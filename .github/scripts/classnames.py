#!/usr/bin/env python3
"""Keeps Steam's hashed class names in the theme up to date.

  classnames.py update  read the class names of the Steam client and the store/community pages into .github/classnames.json
  classnames.py apply   rewrite renamed classes in the theme files (used by the workflow)
  classnames.py tray    tray icon: update + push the list whenever Steam changes its class names
  classnames.py test    self-check
"""
import collections, hashlib, json, os, re, shutil, subprocess, sys, tempfile, threading, time
import urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LIST = Path('.github/classnames.json')
STEAMUI = Path.home() / '.local/share/Steam/steamui'
CLONE = Path.home() / '.local/share/spacetheme-classwatch/Steam'
STATE = CLONE.parent / 'classnames.json'
CACHE = Path.home() / '.cache/spacetheme-classwatch'
REMOTE = 'https://github.com/SpaceTheme/Steam.git'
# one page per web app/route; their scripts list every other chunk. steamcommunity.com/market answers 429 most of the time
PAGES = ['https://store.steampowered.com/', 'https://store.steampowered.com/app/620/', 'https://store.steampowered.com/cart/',
         'https://store.steampowered.com/wishlist/id/gabelogannewell/', 'https://store.steampowered.com/points/shop/',
         'https://steamcommunity.com/', 'https://steamcommunity.com/market/listings/730/G1807209A023004']

# Steam client, webpack CSS module: 12345:(e=>{e.exports={Key:"_hash",...}})
MODULE = re.compile(r'(\d+):\(?\w+\)?=>\{\w+\.exports=\{([^{}]*)\}\}')
PAIR = re.compile(r'(?:"([^"]+)"|([\w$]+)):"([^"]*)"')
# skips :export values like "1158px", which are not class names
CLASS = re.compile(r'-?[_a-zA-Z][\w-]{7,}')
# Store/community pages (Vite): the key names are gone, only classes like .r0DFA3TwTH8- in the CSS
WEB_CLASS = re.compile(r'\.(_?[\w-]{11}-)(?![\w-])')
RULE = re.compile(r'([^{}]+)\{([^{}]*)\}')
REF = re.compile(r'''["'`]((?:https://[\w.]+steamstatic\.com/|\.{1,2}/)[^"'`\s]*?\.(?:js|css)(?:\?[^"'`\s]*)?)["'`]''')


def dump(steamui=STEAMUI):
    modules = {}
    for f in sorted(Path(steamui).glob('*.js')):
        for mid, body in MODULE.findall(f.read_text(errors='ignore')):
            pairs = PAIR.findall(body)
            if pairs and len(pairs) == body.count(':'):
                modules[mid] = {a or b: v for a, b, v in pairs}
    return modules


def fetch(url, tries=5):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 Valve Steam Client'}),
                                          timeout=30).read().decode(errors='ignore')
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(15 * 2 ** i)


def is_css(url):
    return urllib.parse.urlsplit(url).path.endswith('.css')


def links(url, text):
    # pages link akamai or fastly at random, same files
    return [urllib.parse.urljoin(url, r.replace('&amp;', '&')).replace('.akamai.steamstatic.com', '.fastly.steamstatic.com')
            for r in REF.findall(text)]


def load(url):
    """CSS text, or the chunk URLs a script links to. Cached: the URLs carry a content hash."""
    f = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if f.exists():
        return f.read_text()
    text = fetch(url)
    text = text if is_css(url) else '\n'.join(u for u, r in zip(links(url, text), REF.findall(text)) if r.startswith('.'))
    f.write_text(text)
    return text


def crawl():
    """Returns the CSS of every store/community chunk."""
    CACHE.mkdir(parents=True, exist_ok=True)
    todo, keep = [], set()
    for page in PAGES:
        f = CACHE / f'page-{hashlib.sha1(page.encode()).hexdigest()}'
        try:
            f.write_text('\n'.join(links(page, fetch(page, tries=2))))
        except urllib.error.HTTPError:
            # rate limited (the market often is): the links from the last visit still point at valid files
            if not f.exists():
                raise
        todo += f.read_text().split()
        keep.add(f.name)
    seen, css = set(), []
    with ThreadPoolExecutor(4) as pool:
        while todo:
            batch = [u for u in dict.fromkeys(todo) if u not in seen and ('/applications/' in u or '/ssr/' in u) and '/localization/' not in u]
            seen.update(batch)
            todo = []
            for url, text in zip(batch, pool.map(load, batch)):
                if is_css(url):
                    css.append(text)
                else:
                    todo += text.split()
    keep |= {hashlib.sha1(u.encode()).hexdigest() for u in seen}
    for f in CACHE.iterdir():
        if f.name not in keep:
            f.unlink()
    return css


def fingerprints(css):
    """Web classes have no key names, so a class is known by its rules: selectors (other classes as *) plus declarations."""
    rules = collections.defaultdict(set)
    for text in css:
        for selectors, body in RULE.findall(text):
            body = re.sub(r'https?://[\w.-]+', '', body)  # image URLs point at akamai or fastly at random
            for sel in selectors.split(','):
                for c in set(WEB_CLASS.findall(sel)):
                    rules[c].add(WEB_CLASS.sub(lambda m: '.&' if m[1] == c else '.*', sel.strip()) + '{' + body + '}')
    return {c: hashlib.sha1('\n'.join(sorted(r)).encode()).hexdigest()[:12] for c, r in rules.items()}


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


def web_renames(old, new):
    """A class that vanished maps to the one new class with the same rules."""
    fresh = collections.defaultdict(list)
    for c in new.keys() - old.keys():
        fresh[new[c]].append(c)
    gone = collections.Counter(old[c] for c in old.keys() - new.keys())
    return {c: fresh[old[c]][0] for c in old.keys() - new.keys() if len(fresh[old[c]]) == 1 and gone[old[c]] == 1}


def names(data):
    return {v for m in data['steamui'].values() for v in m.values()} | data['web'].keys()


def update(path, steamui, web):
    """Writes the new class names (plus renames and removals since the last ones) to path. Returns the new renames or None."""
    raw = json.loads(path.read_text()) if path.exists() else {}
    old = {'steamui': {}, 'web': {}, 'renamed': {}, 'removed': [], **raw}
    for k, new in (('steamui', steamui), ('web', web)):
        if len(new) < len(old[k]) / 2:
            raise RuntimeError(f'only {len(new)} {k} entries found (had {len(old[k])}), parser broken?')
    found = {**renames(old['steamui'], steamui), **web_renames(old['web'], web)}
    data = {'steamui': steamui, 'web': web, 'renamed': {**old['renamed'], **found}}
    current = names(data)
    gone = {c for c in names(old) - current - found.keys() if CLASS.fullmatch(c)}
    data['removed'] = sorted((set(old['removed']) | gone) - current)
    if data == raw:
        return None
    path.write_text(json.dumps(data, indent=1, sort_keys=True) + '\n')
    return found


def apply(root=REPO):
    data = json.loads((root / LIST).read_text())
    current, removed = names(data), set(data['removed'])

    def resolve(name):
        seen = set()
        while name not in current and name in data['renamed'] and name not in seen:
            seen.add(name)
            name = data['renamed'][name]
        return name if name in current else None

    mapping = {old: new for old in data['renamed'] if old not in current and (new := resolve(old))}
    changes, dead = [], collections.defaultdict(set)
    for f in sorted(root.rglob('*')):
        rel = f.relative_to(root)
        if f.suffix not in ('.css', '.js', '.json') or {'.git', '.github'} & set(rel.parts):
            continue
        text = f.read_bytes().decode()  # bytes keep CRLF files as they are
        tokens = re.findall(r'[\w-]+', text)
        hits = [t for t in tokens if t in mapping]
        dead[rel] |= {t for t in tokens if t in removed and t not in mapping}
        if hits:
            f.write_bytes(re.sub(r'[\w-]+', lambda m: mapping.get(m[0], m[0]), text).encode())
            changes += [(rel, old, mapping[old], hits.count(old)) for old in dict.fromkeys(hits)]
    print('Steam renamed some of its class names. This PR swaps them in the theme files.\n')
    print('| File | Old | New | Count |\n|---|---|---|---|')
    for rel, old, new, n in changes:
        print(f'| `{rel}` | `{old}` | `{new}` | {n} |')
    if any(dead.values()):
        print('\n**Removed by Steam with no clear replacement, fix these by hand:**\n')
        for rel, found in dead.items():
            if found:
                print(f'- `{rel}`: ' + ', '.join(f'`{c}`' for c in sorted(found)))
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
    steamui, web = dump(), fingerprints(crawl())
    if not CLONE.exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        git('clone', '--depth', '1', REMOTE, str(CLONE), cwd=CLONE.parent)
    git('pull', '--ff-only')
    if not (CLONE / LIST).exists():
        return f'{LIST} is not on main yet'
    if not STATE.exists():
        shutil.copy(CLONE / LIST, STATE)
    # the newest names stay local; only renames go to GitHub, new classes alone would spam main with commits
    update(STATE, steamui, web)
    pushed = json.loads(git('show', f'@{{u}}:{LIST}'))
    new = json.loads(STATE.read_text())['renamed'].keys() - pushed.get('renamed', {}).keys()
    if not new:
        return 'Class names up to date'
    shutil.copy(STATE, CLONE / LIST)
    git('add', str(LIST))
    if git('status', '--porcelain'):  # empty when an earlier push failed after committing
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
    # web: w1 renamed with the same rules (its neighbour is renamed too), w3 gone with changed rules
    web_old = fingerprints(['.w1aaaaaaaaa- .w2aaaaaaaaa-{color:red}.w2aaaaaaaaa-:hover{color:#fff}@media (max-width:9px){.w3aaaaaaaaa-{margin:0}}'])
    web_new = fingerprints(['.w1bbbbbbbbb- .w2bbbbbbbbb-{color:red}.w2aaaaaaaaa-:hover{color:#000}@media (max-width:9px){.w3bbbbbbbbb-{margin:1px}}'])
    assert web_renames(web_old, web_new) == {'w1aaaaaaaaa-': 'w1bbbbbbbbb-'}, web_renames(web_old, web_new)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / '.github').mkdir()
        assert update(root / LIST, old, web_old) == {}
        assert update(root / LIST, new, web_new) == {**renames(old, new), 'w1aaaaaaaaa-': 'w1bbbbbbbbb-'}
        assert update(root / LIST, new, web_new) is None
        # a later build renames A again: old theme files must still land on the newest name
        assert update(root / LIST, {**new, '1': {**new['1'], 'A': '_xxxxxxxxxxxx'}}, web_new)
        assert 'w3aaaaaaaaa-' in json.loads((root / LIST).read_text())['removed']
        (root / 'a.css').write_text('._aaaaaaaaaaaa ._cccccccccccc_x, ._AAAAAAAAAAAA ._cccccccccccc { width: 1158px }\n.w1aaaaaaaaa- .w3aaaaaaaaa- {}')
        apply(root)
        assert (root / 'a.css').read_text() == '._xxxxxxxxxxxx ._cccccccccccc_x, ._xxxxxxxxxxxx ._CCCCCCCCCCCC { width: 1158px }\n.w1bbbbbbbbb- .w3aaaaaaaaa- {}'
    print('ok')


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'tray'
    if cmd == 'update':
        print(update(REPO / LIST, dump(), fingerprints(crawl())))
    else:
        {'apply': apply, 'tray': tray, 'test': test}[cmd]()
