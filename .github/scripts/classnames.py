#!/usr/bin/env python3
"""Keeps Steam's hashed class names in the theme up to date.

  classnames.py update [steamui dir]  read Steam's class maps into .github/classnames.json
  classnames.py apply                 rewrite renamed classes in the theme files (used by the workflow)
  classnames.py tray                  tray icon: update + push the list whenever Steam's files change
  classnames.py test                  self-check
"""
import json, os, re, subprocess, sys, tempfile, threading, time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LIST = Path('.github/classnames.json')
STEAMUI = Path.home() / '.local/share/Steam/steamui'
CLONE = Path.home() / '.local/share/spacetheme-classwatch/Steam'
REMOTE = 'https://github.com/SpaceTheme/Steam.git'

# webpack CSS module: 12345:(e=>{e.exports={Key:"_hash",...}})
MODULE = re.compile(r'(\d+):\(?\w+\)?=>\{\w+\.exports=\{([^{}]*)\}\}')
PAIR = re.compile(r'(?:"([^"]+)"|([\w$]+)):"([^"]*)"')
# skips :export values like "1158px", which are not class names
CLASS = re.compile(r'-?[_a-zA-Z][\w-]{7,}')


def dump(steamui=STEAMUI):
    modules = {}
    for f in sorted(Path(steamui).glob('*.js')):
        for mid, body in MODULE.findall(f.read_text(errors='ignore')):
            pairs = PAIR.findall(body)
            if pairs and len(pairs) == body.count(':'):
                modules[mid] = {a or b: v for a, b, v in pairs}
    return modules


def jaccard(a, b):
    return len(a.keys() & b.keys()) / len(a.keys() | b.keys())


def renames(old, new):
    found = {}
    for mid, keys in old.items():
        match = new.get(mid)
        if not match or jaccard(keys, match) < .5:
            # module id changed: take the one module with the most similar key set
            ranked = sorted(new.values(), key=lambda m: jaccard(keys, m), reverse=True)[:2]
            if not ranked or jaccard(keys, ranked[0]) < .5 or (len(ranked) > 1 and jaccard(keys, ranked[1]) == jaccard(keys, ranked[0])):
                continue
            match = ranked[0]
        for key, value in keys.items():
            if match.get(key, value) != value and CLASS.fullmatch(value) and CLASS.fullmatch(match[key]):
                found[value] = None if found.get(value, match[key]) != match[key] else match[key]
    return {k: v for k, v in found.items() if v}


def update(path, modules):
    """Writes the new class maps (and the renames since the last ones) to path. Returns the new renames or None."""
    data = json.loads(path.read_text()) if path.exists() else {'modules': {}, 'renamed': {}}
    if data['modules'] == modules:
        return None
    if len(modules) < len(data['modules']) / 2:
        raise RuntimeError(f'only {len(modules)} class modules found (had {len(data["modules"])}), parser broken?')
    new = renames(data['modules'], modules)
    data['renamed'].update(new)
    data['modules'] = modules
    path.write_text(json.dumps(data, indent=1, sort_keys=True) + '\n')
    return new


def apply(root=REPO):
    data = json.loads((root / LIST).read_text())
    current = {v for m in data['modules'].values() for v in m.values()}

    def resolve(name):
        seen = set()
        while name not in current and name in data['renamed'] and name not in seen:
            seen.add(name)
            name = data['renamed'][name]
        return name if name in current else None

    mapping = {old: new for old in data['renamed'] if old not in current and (new := resolve(old))}
    changes = []
    for f in sorted(root.rglob('*')):
        if f.suffix not in ('.css', '.js', '.json') or {'.git', '.github'} & set(f.relative_to(root).parts):
            continue
        text = f.read_bytes().decode()  # bytes keep CRLF files as they are
        hits = [m for m in re.findall(r'[\w-]+', text) if m in mapping]
        if hits:
            f.write_bytes(re.sub(r'[\w-]+', lambda m: mapping.get(m[0], m[0]), text).encode())
            changes += [(f.relative_to(root), old, mapping[old], hits.count(old)) for old in dict.fromkeys(hits)]
    print('Steam renamed some of its class names. This PR swaps them in the theme files.\n')
    print('| File | Old | New | Count |\n|---|---|---|---|')
    for f, old, new, n in changes:
        print(f'| `{f}` | `{old}` | `{new}` | {n} |')
    return changes


def git(*args, cwd=CLONE):
    return subprocess.run(['git', *args], cwd=cwd, check=True, capture_output=True, text=True,
                          env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'}).stdout


def check():
    files = list(STEAMUI.glob('*.js'))
    if not files:
        return 'Steam not found'
    if time.time() - max(f.stat().st_mtime for f in files) < 120:
        return 'Steam is updating, checking later'
    modules = dump()
    if not CLONE.exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        git('clone', '--depth', '1', REMOTE, str(CLONE), cwd=CLONE.parent)
    git('pull', '--ff-only')
    if not (CLONE / LIST).exists():
        return f'{LIST} is not on main yet'
    new = update(CLONE / LIST, modules)
    if new is None:
        return 'Class names up to date'
    git('add', str(LIST))
    git('commit', '-m', f'chore: update Steam class names ({len(new)} renamed)')
    git('push')
    subprocess.run(['notify-send', '-a', 'SpaceTheme', 'Steam class names changed',
                    f'{len(new)} renamed, list pushed. GitHub opens a PR.'])
    return f'Pushed new list ({len(new)} renamed)'


def tray():
    import gi
    gi.require_version('Gtk', '3.0')
    gi.require_version('AppIndicator3', '0.1')
    from gi.repository import AppIndicator3, GLib, Gtk

    indicator = AppIndicator3.Indicator.new('spacetheme-classnames', 'view-refresh-symbolic',
                                            AppIndicator3.IndicatorCategory.APPLICATION_STATUS)
    indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
    indicator.set_title('SpaceTheme class names')
    menu = Gtk.Menu()
    status = Gtk.MenuItem(label='Checking…', sensitive=False)
    now = Gtk.MenuItem(label='Check now')
    quit_item = Gtk.MenuItem(label='Quit')
    for item in (status, now, quit_item):
        menu.append(item)
    menu.show_all()
    indicator.set_menu(menu)
    lock = threading.Lock()

    def run():
        try:
            msg = check()
        except Exception as e:
            msg = f'Error: {getattr(e, "stderr", None) or e}'.strip()
            subprocess.run(['notify-send', '-a', 'SpaceTheme', 'Class name check failed', msg])
        finally:
            lock.release()
        GLib.idle_add(status.set_label, f'{time.strftime("%H:%M")}  {msg.splitlines()[0][:80]}')

    def start(*_):
        if lock.acquire(blocking=False):
            threading.Thread(target=run, daemon=True).start()
        return True

    now.connect('activate', start)
    quit_item.connect('activate', Gtk.main_quit)
    start()
    GLib.timeout_add_seconds(1800, start)
    Gtk.main()


def test():
    old = {'1': {'A': '_aaaaaaaaaaaa', 'B': '_bbbbbbbbbbbb', 'Break': '1158px'},
           '2': {'C': '_cccccccccccc', 'D': '_dddddddddddd'}}
    # module 2 moved to id 9, A renamed, the :export value changed too
    new = {'1': {'A': '_AAAAAAAAAAAA', 'B': '_bbbbbbbbbbbb', 'Break': '1200px'},
           '9': {'C': '_CCCCCCCCCCCC', 'D': '_dddddddddddd'}}
    assert renames(old, new) == {'_aaaaaaaaaaaa': '_AAAAAAAAAAAA', '_cccccccccccc': '_CCCCCCCCCCCC'}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / '.github').mkdir()
        assert update(root / LIST, old) == {}
        assert update(root / LIST, new) == renames(old, new)
        assert update(root / LIST, new) is None
        # a later build renames A again: old theme files must still land on the newest name
        assert update(root / LIST, {**new, '1': {**new['1'], 'A': '_xxxxxxxxxxxx'}})
        (root / 'a.css').write_text('._aaaaaaaaaaaa ._cccccccccccc_suffix, ._AAAAAAAAAAAA ._cccccccccccc { width: 1158px }')
        apply(root)
        assert (root / 'a.css').read_text() == '._xxxxxxxxxxxx ._cccccccccccc_suffix, ._xxxxxxxxxxxx ._CCCCCCCCCCCC { width: 1158px }'
    print('ok')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'tray'
    if cmd == 'update':
        print(update(REPO / LIST, dump(sys.argv[2] if len(sys.argv) > 2 else STEAMUI)))
    else:
        {'apply': apply, 'tray': tray, 'test': test}[cmd]()
