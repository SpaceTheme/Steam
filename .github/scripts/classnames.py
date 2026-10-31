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
    """A class maps to the one new class with the same rules. It may still be in use:
    Steam ships its sections one at a time, so old and new names run side by side for a while."""
    fresh = collections.defaultdict(list)
    for c in new.keys() - old.keys():
        fresh[new[c]].append(c)
    gone = collections.Counter(old[c] for c in old.keys() - new.keys())
    kept = collections.Counter(old[c] for c in old.keys() & new.keys())
    return {c: fresh[fp][0] for c, fp in old.items() if len(fresh[fp]) == 1
            and (gone[fp] == 1 if c not in new else not gone[fp] and kept[fp] == 1)}


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


COMMENT = r'/\*.*?(?:\*/|\Z)'  # an unclosed comment runs to the end of the file
TOKEN = re.compile(COMMENT + r'|"[^"]*"|\'[^\']*\'|[^()"\',/]+|.', re.S)


def twin_selectors(text, mapping, current):
    """Puts the renamed copy under each selector that uses an old class (`.old,` newline `.new`).
    The old selector goes once one of its old classes is not in Steam's list anymore."""
    nl = '\r\n' if '\r\n' in text else '\n'
    stats = collections.Counter()

    def rewrite(chunk):
        if re.sub(COMMENT + r'|\s', '', chunk, flags=re.S).startswith('@'):  # @media, @font-face, ...
            return chunk
        parts, depth = [''], 0
        for tok in TOKEN.findall(chunk):  # split at the commas outside :is(a, b) and "a,b"
            depth += (tok == '(') - (tok == ')')
            if tok == ',' and not depth:
                parts.append('')
            else:
                parts[-1] += tok
        split = [re.fullmatch(rf'((?:\s|{COMMENT})*)(.*?)(\s*)', p, re.S).groups() for p in parts]
        cores = {core for _, core, _ in split}
        out, carry = [], None

        def emit(part):
            nonlocal carry
            out.append(part if carry is None else carry + part.lstrip())
            carry = None

        for i, (pre, core, post) in enumerate(split):
            hits = [t for t in re.findall(r'[\w-]+', core) if t in mapping]
            new = re.sub(r'[\w-]+', lambda t: mapping.get(t[0], t[0]), core)
            dead = any(t not in current for t in hits)
            if not hits or new in cores and not dead:  # nothing renamed, or the copy is there from an earlier PR
                emit(pre + core + post)
            elif new in cores:
                carry = (carry or '') + pre  # keeps a comment in front of the dropped selector
                if out and i == len(split) - 1:
                    out[-1] += carry.rstrip() + post
                stats.update((t, mapping[t], 'old removed') for t in hits)
            elif dead:
                cores.add(new)
                emit(pre + new + post)
                stats.update((t, mapping[t], 'replaced') for t in hits)
            else:
                cores.add(new)
                emit(pre + core)
                emit(nl + (pre.rpartition('\n')[2] if '\n' in pre else '') + new + post)
                stats.update((t, mapping[t], 'added') for t in hits)
        return ','.join(out) if out else chunk

    # find the selector lists on a copy without comments and strings: they hold braces and semicolons too
    masked = re.sub(COMMENT + r'|"[^"\n]*"|\'[^\'\n]*\'', lambda c: re.sub(r'\S', ' ', c[0]), text, flags=re.S)
    out, last = [], 0
    for m in re.finditer(r'(?:^|(?<=[{};]))[^{};]*(?=\{)', masked):
        out += [text[last:m.start()], rewrite(text[m.start():m.end()])]
        last = m.end()
    return ''.join(out) + text[last:], stats


def apply(root=REPO):
    data = json.loads((root / LIST).read_text())
    current, removed = names(data), set(data['removed'])

    def resolve(name):
        seen = {name}
        while data['renamed'].get(name, name) not in seen:
            name = data['renamed'][name]
            seen.add(name)
        return name if name in current else None

    mapping = {old: new for old in data['renamed'] if (new := resolve(old)) and new != old}
    gone = {old: new for old, new in mapping.items() if old not in current}
    changes, dead = collections.Counter(), collections.defaultdict(set)
    for f in sorted(root.rglob('*')):
        rel = f.relative_to(root)
        if f.suffix not in ('.css', '.js', '.json') or {'.git', '.github'} & set(rel.parts):
            continue
        text = f.read_bytes().decode()  # bytes keep CRLF files as they are
        new, stats = twin_selectors(text, mapping, current) if f.suffix == '.css' else (text, collections.Counter())
        # scripts and CSS values can't list both names: there only names Steam dropped are swapped
        stats.update((t, gone[t], 'replaced') for t in re.findall(r'[\w-]+', new) if t in gone)
        new = re.sub(r'[\w-]+', lambda m: gone.get(m[0], m[0]), new)
        dead[rel] |= {t for t in re.findall(r'[\w-]+', text) if t in removed and t not in mapping}
        if new != text:
            f.write_bytes(new.encode())
        changes.update({(str(rel), *k): n for k, n in stats.items()})
    print('Steam renamed some of its class names. This PR updates the theme files.\n')
    print('Steam ships its sections one at a time. While an old class is still in the list, the new selector '
          'is added under the old one. The old selector goes once its class is gone from the list.\n')
    print('| File | Old | New | Change | Count |\n|---|---|---|---|---|')
    for (rel, old, new, how), n in sorted(changes.items()):
        print(f'| `{rel}` | `{old}` | `{new}` | {how} | {n} |')
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
    # one section got the new name, the old one is still in use elsewhere
    twin = fingerprints(['.t1aaaaaaaaa-{gap:1px}.t2aaaaaaaaa-{gap:2px}.t3aaaaaaaaa-{gap:2px}'])
    assert web_renames(twin, fingerprints(['.t1aaaaaaaaa-,.t1bbbbbbbbb-{gap:1px}.t2aaaaaaaaa-,.t3aaaaaaaaa-,.t2bbbbbbbbb-{gap:2px}'])) == {'t1aaaaaaaaa-': 't1bbbbbbbbb-'}
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / '.github').mkdir()
        data = {'steamui': {}, 'web': {'t1aaaaaaaaa-': '1', 't1bbbbbbbbb-': '1', 't2bbbbbbbbb-': '2'}, 'removed': [],
                'renamed': {'t1aaaaaaaaa-': 't1bbbbbbbbb-', 't2aaaaaaaaa-': 't2bbbbbbbbb-'}}
        (root / LIST).write_text(json.dumps(data))
        (root / 'b.css').write_text('/* c; { */\n.t1aaaaaaaaa- a:has(b, c),\n.x {}\n/* .t1aaaaaaaaa- {} */\n.t2aaaaaaaaa- { animation: t2aaaaaaaaa- }')
        apply(root)
        apply(root)  # the next run must not add the copy again
        assert (root / 'b.css').read_text() == '/* c; { */\n.t1aaaaaaaaa- a:has(b, c),\n.t1bbbbbbbbb- a:has(b, c),\n.x {}\n/* .t1aaaaaaaaa- {} */\n.t2bbbbbbbbb- { animation: t2bbbbbbbbb- }'
        del data['web']['t1aaaaaaaaa-']  # Steam is done with the old name
        (root / LIST).write_text(json.dumps(data))
        apply(root)
        assert (root / 'b.css').read_text() == '/* c; { */\n.t1bbbbbbbbb- a:has(b, c),\n.x {}\n/* .t1bbbbbbbbb- {} */\n.t2bbbbbbbbb- { animation: t2bbbbbbbbb- }'
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
