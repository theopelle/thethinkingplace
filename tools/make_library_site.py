"""The Library as real web pages: site/library/ (an index) and site/library/<page>/, one per page.

    called by tools/make_site.py (no separate step)

So that search engines can read the Library and new readers can arrive through it (DECISIONS.md,
Website, "The Library on the website", 1 Nov 2026). Built from pages.json with the page template
(web/page.html); the page text is never rewritten here, only laid out, as the app does:
light Markdown, the names of other pages as links, a path's thinkers, an era's thinkers.
Thoughts appear only once their day has passed everywhere (up to yesterday in UTC), each linking
to its day in the web app; the site is rebuilt every day for that (.github/workflows/pages.yml).
No walls or popups: the whole page reads without the app, with one calm block at the end.
Standard Python only (the site is built on GitHub without the spreadsheet tools).
"""
import datetime as dt
import html, json, os, re

import calendar_rules

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = os.path.join(ROOT, "site")
URL = "https://thinkingplace.app/"
KIND = {"thinker": "Thinker", "text": "Text", "path": "Path", "topic": "Theme", "era": "Era", "essay": ""}
PATH_ORDER = ["Stoicism", "Epicureanism", "Classical Greek Philosophy", "Enlightenment Ethics", "Existential Thought",
              "Humanists and Essayists", "Buddhist Philosophy", "Indian Philosophy", "Taoism", "Confucianism",
              "Japanese Aesthetics", "Persian and Sufi Poetry"]  # as app.js
LIB_PATHS = sorted(PATH_ORDER)  # the Library lists the paths A to Z (5 Nov 2026)
SORT_AS = {"Émilie du Châtelet": "Chatelet", "Jean de La Bruyère": "La Bruyere", "Kamo no Chōmei": "Chomei",
           "Ibn Arabi": "Ibn Arabi", "Omar Khayyam": "Khayyam", "Sei Shōnagon": "Shonagon",
           "Questions of King Milinda": "Milinda", "Al-Ghazali": "Ghazali", "Bhagavad Gita": "Bhagavad Gita",
           "Okakura Kakuzō": "Okakura"}  # as app.js: family name first
# A name that is part of someone else's ("James Mill", "Seneca Falls") is left alone, as in the app.
OPENERS = {"The", "A", "An", "In", "On", "At", "For", "And", "But", "Yet", "So", "Then", "When", "While", "After",
           "Before", "As", "Like", "By", "To", "From", "With", "Of", "His", "Her", "Their", "Its", "Both", "Only",
           "Even", "Unlike", "Later", "Where", "Here", "There", "Today", "Read", "Start"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
esc = html.escape


def plain(s):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def title_of(p):
    return p["title"].replace(" (society)", "")


def slug(p):
    return re.sub(r"[^a-z0-9]+", "-", plain(title_of(p)).lower()).strip("-")


def sort_key(p):
    t = re.sub(r"^The ", "", p["title"])
    return plain(SORT_AS.get(t) or (t.split(" ")[-1] if p["type"] == "thinker" else t))


def date_label(d):
    return f"{DAYS[d.weekday()]}, {d.day} {MONTHS[d.month - 1]}"


def strip_md(md):
    return re.sub(r"^\s*- ", "", md.replace("**", "").replace("*", ""), flags=re.M)


class Linker:
    """The names of other Library pages as links, each page once, never the page itself."""
    def __init__(self, links, shown, self_id, href):
        names = sorted(links, key=len, reverse=True)
        self.re = re.compile(r"(?<![^\W_])(" + "|".join(map(re.escape, names)) + r")(?![^\W_])") if names else None
        self.links, self.shown, self.href, self.used = links, shown, href, {self_id}

    def part_of_another(self, text, m, pid):
        own = set(self.shown[pid]["title"].split())
        before = re.search(r"([A-Z][^\W\d_]*(?:['’-][^\W\d_]*)*)\s$", text[max(0, m.start() - 30):m.start()])
        after = re.match(r"\s([A-Z][^\W\d_]*(?:['’-][^\W\d_]*)*)", text[m.end():m.end() + 30])
        return bool((before and before.group(1) not in own and before.group(1) not in OPENERS)
                    or (after and after.group(1) not in own))

    def __call__(self, text):
        if not self.re:
            return esc(text)
        out, last = [], 0
        for m in self.re.finditer(text):
            pid = self.links[m.group(1)]
            if pid in self.used or pid not in self.shown or self.part_of_another(text, m, pid):
                continue
            self.used.add(pid)
            out += [esc(text[last:m.start()]), f'<a class="lib-in" href="{self.href(pid)}">{esc(m.group(1))}</a>']
            last = m.end()
        return "".join(out) + esc(text[last:])


def inline(text, linker):
    """**bold**, *italic*, bare links, as the app does."""
    out = []
    for part in re.split(r"(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|https?://[^\s)]+)", text):
        if not part:
            continue
        if re.fullmatch(r"\*\*.+\*\*", part, re.S):
            out.append(f"<strong>{inline(part[2:-2], linker)}</strong>")
        elif re.fullmatch(r"\*.+\*", part, re.S):
            out.append(f"<em>{inline(part[1:-1], linker)}</em>")
        elif re.match(r"https?://", part):
            out.append(f'<a href="{esc(part)}" rel="noopener">{esc(part)}</a>')
        else:
            out.append(linker(part))
    return "".join(out)


def render_md(md, linker):
    out = []
    for block in re.split(r"\n\s*\n", md):
        lines = [l for l in block.split("\n") if l.strip()]
        if lines and all(re.match(r"\s*- ", l) for l in lines):
            items = [inline(re.sub(r"^\s*- ", "", l), linker) for l in lines]
            out.append("<ul>" + "".join(f"<li>{x}</li>" for x in items) + "</ul>")
        elif lines:
            out.append(f"<p>{inline(' '.join(lines), linker)}</p>")
    return "\n".join(out)


def description(p):
    one = next((md for t, md in p["sections"] if t == "In one line"), None) or (p["sections"][0][1] if p["sections"] else "")
    text = " ".join(strip_md(re.split(r"\n\s*\n", one)[0]).split())
    if len(text) > 160:
        text = text[:157].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return text


def main(tpl, by_id):
    lib = json.load(open(os.path.join(ROOT, "pages.json"), encoding="utf-8"))
    cal = json.load(open(os.path.join(ROOT, "calendar.json"), encoding="utf-8"))
    shown = {p["id"]: p for p in lib["pages"] if p["status"] == "Ready" and p["type"] != "essay"}
    slugs = {pid: slug(p) for pid, p in shown.items()}
    assert len(set(slugs.values())) == len(slugs), "two Library pages share a web address"

    # Every day already passed everywhere: up to yesterday in UTC (the latest time zone is 12 hours
    # behind, so yesterday in UTC is never a day still to come there).
    cycle = [(x[0], len(x) > 1) for x in cal["cycle"]]
    pinned = {md: v[0] for md, v in cal["pinned"].items()}
    last = dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(1)
    days = {}  # thought id -> the dates it was shown, newest first
    for k in range((last - calendar_rules.START).days + 1):
        tid = calendar_rules.shown(k, cycle, pinned)[0]
        days.setdefault(tid, []).insert(0, calendar_rules.date_of(k))

    # Wide screens only: the app's rail beside each page (the sections, and the current section's
    # pages with this one marked).
    by = lambda t: [p for p in shown.values() if p["type"] == t]
    lists = {"time": sorted(by("era"), key=lambda p: (p["start"], p.get("eraOrder") or 0)),
             "paths": sorted(by("path"), key=lambda p: LIB_PATHS.index(p["title"])),
             "people": sorted(by("thinker") + by("text"), key=sort_key),
             "topics": sorted(by("topic"), key=title_of)}
    SECTIONS = [("time", "In their time"), ("paths", "Paths"), ("people", "Thinkers and texts"), ("topics", "Themes and topics"),
                ("maps", "Maps and timelines"), ("compare", "Compare two paths"), ("questions", "Questions for good conversations")]
    SECTION_OF = {"era": "time", "path": "paths", "thinker": "people", "text": "people", "topic": "topics"}
    # Maps and timelines (as app.js LIB_MAPS), the written pairs, and the conversation questions
    # (extras.json, only "Ready" rows)
    MAPS = [("world", "The world", "Every place our thinkers lived and wrote"),
            ("europe", "Europe and the Mediterranean, closer", "From Athens and Rome to Paris and London"),
            ("asia", "Asia, closer", "China, Japan, India and Persia"),
            ("paths-in-time", "The paths through time", "Each path from when it began"),
            ("thinkers-in-time", "The thinkers through time", "Every thinker on one line, from the Upanishads to Simone Weil")]
    extras = json.load(open(os.path.join(ROOT, "extras.json"), encoding="utf-8"))
    pairs = [x for x in extras["pairs"] if x["status"] == "Ready"]
    conv = extras["conversation"]
    conv_qs = [q for q in conv["questions"] if q["status"] == "Ready"]
    taken = set(slugs.values())
    assert not taken & ({k for k, _ in SECTIONS} | {k for k, _, _ in MAPS} | {x["id"] for x in pairs}), \
        "a page's address is taken by a section, a map, or a pair"
    subs = {k: [(x["id"], slugs[x["id"]], x["title"] if k == "people" else title_of(x),
                 sort_key(x)[0].upper() if k == "people" else None) for x in v] for k, v in lists.items()}
    subs["maps"] = [(k, k, t.replace(", closer", ""), None) for k, t, _ in MAPS]

    def rail(sec, current=None):
        out = ['<nav class="librail" aria-label="Library contents">', '<a class="home" href="../">Library</a>', '<ul class="secs">']
        for key, label in SECTIONS:
            here = ' aria-current="true"' if key == sec else ""
            out.append(f'<li><a href="../{key}/"{here}>{label}</a>')
            if key == sec and subs.get(key):
                out.append('<ul class="sub">')
                letter = ""
                for xid, xslug, xlabel, L in subs[key]:
                    if L and L != letter:
                        letter = L
                        out.append(f'<li class="letter" aria-hidden="true">{letter}</li>')
                    mark = ' aria-current="page"' if xid == current else ""
                    out.append(f'<li><a href="../{xslug}/"{mark}>{esc(xlabel)}</a></li>')
                out.append("</ul>")
            out.append("</li>")
        out += ["</ul>", "</nav>"]
        return "\n".join(out)

    # The current page in the middle of its list (wide screens; a no-op elsewhere)
    CENTRE = ("<script>(function(){var a=document.querySelector('.librail .sub [aria-current]');if(a){var s=a.closest('.sub');"
              "s.scrollTop=a.offsetTop-s.offsetTop-s.clientHeight/2+a.offsetHeight/2;}})();</script>")

    def wrap(sec, current, out):
        return '<div class="libwrap">\n' + rail(sec, current) + "\n" + "\n".join(out) + "\n</div>\n" + CENTRE

    def compare_links(path):  # under a path page's "Next to its neighbours", as in the app
        mine = [x for x in pairs if path in (x["a"], x["b"])]
        out = []
        if mine:
            out.append(f'<p class="libpage-compare-k">Compare {esc(path)} with</p><p class="libpage-related">' + "".join(
                f'<a href="../{x["id"]}/">{esc(x["b"] if x["a"] == path else x["a"])}</a>' for x in mine) + "</p>")
        out.append('<p class="libpage-go"><a href="../compare/">' + ("or see every pair" if mine else "Compare two paths") + "</a></p>")
        return "\n".join(out)

    def page_html(p):
        up = "../../"
        href = lambda pid: f"../{slugs[pid]}/"
        linker = Linker(lib["links"], shown, p["id"], href)
        path_page = lambda name: next((x for x in shown.values() if x["type"] == "path" and x["title"] == name), None)
        out = [f'<article class="libpage">', '<a class="libpage-back" href="../">← the Library</a>', f'<p class="libpage-kind">{esc(KIND[p["type"]])}</p>',
               f"<h1>{esc(title_of(p))}</h1>"]
        parts = p["header"][:1] if p["type"] == "era" else p["header"]
        head = []
        for part in parts:
            pp = part == p.get("path") and p["type"] != "path" and path_page(part)
            head.append(f'<a href="{href(pp["id"])}">{esc(part)}</a>' if pp else esc(part))
        if head:
            out.append(f'<p class="libpage-header">{" · ".join(head)}</p>')
        if p["tags"]:
            out.append(f'<p class="libpage-also">Keywords: {esc(", ".join(p["tags"][:6]))}</p>')

        def people(match, order):
            def at(x):
                names = [x["title"], re.sub(r"^The ", "", x["title"]), *x.get("aliases", []), x["title"].split(" ")[-1]]
                hits = [order.lower().find(n.lower()) for n in names]
                return min([h for h in hits if h >= 0] or [10 ** 6])
            rows = sorted((x for x in shown.values() if x["type"] in ("thinker", "text") and match(x)), key=at)
            return '<ul class="libpage-list">' + "".join(
                f'<li><a href="{href(x["id"])}"><span class="t">{esc(x["title"])}</span>'
                f'<span class="d">{esc(x["header"][1] if len(x["header"]) > 1 else "")}</span></a></li>' for x in rows) + "</ul>"

        for i, (t, md) in enumerate(p["sections"]):
            if t == "In one line" and i == 0:
                out.append(f'<p class="libpage-one">{inline(md, linker)}</p>')
                continue
            out.append(f"<h2>{esc(t)}</h2>")
            if p["type"] == "path" and t == "Who we read":
                out.append(people(lambda x: x["path"] == p["title"], md))
            else:
                out.append(render_md(md, linker))
            if p["type"] == "path" and t == "Next to its neighbours" and pairs:
                out.append(compare_links(p["title"]))
        if p["type"] == "era":
            out += ["<h2>The thinkers of this era</h2>", people(lambda x: x.get("era") == p["title"], p["header"][1] if len(p["header"]) > 1 else "")]
        era = p["type"] in ("thinker", "text") and next((x for x in shown.values() if x["type"] == "era" and x["title"] == p.get("era")), None)
        if era:
            out.append(f'<p class="libpage-era"><span class="k">In their time</span> <a href="{href(era["id"])}">{esc(era["title"])} →</a></p>')

        # The thoughts so far, newest first, each linking to its day in the web app.
        met = sorted(((d, tid) for tid in p.get("thoughts") or [] for d in days.get(tid, [])), reverse=True)
        if met:
            out.append(f"<h2>{esc('Thoughts on ' + title_of(p).lower() if p['type'] == 'topic' else 'Thoughts from ' + p['title'])} so far</h2>")
            out.append('<ol class="libpage-met">' + "".join(
                f'<li><a href="{up}app/#/day/{d}"><span class="date">{date_label(d)}</span>'
                f'<span class="q">{esc(by_id[tid]["text"]).replace(" / ", "<br>")}</span>'
                f'<span class="s">{esc(by_id[tid]["source"])}</span></a></li>' for d, tid in met) + "</ol>")
        related = [r for r in lib["related"].get(p["id"], []) if r in shown]
        if related:
            out += ["<h2>Related</h2>", '<p class="libpage-related">' + "".join(
                f'<a href="{href(r)}">{esc(title_of(shown[r]))}</a>' for r in related) + "</p>"]
        if p["sources"]:
            out.append("<h2>Sources</h2>")
            out.append('<ul class="libpage-sources">' + "".join(
                f'<li><a href="{esc(u)}" rel="noopener">{inline(label, esc)}</a></li>' if u else f"<li>{inline(label, esc)}</li>"
                for label, u in p["sources"]) + "</ul>")
        if met:  # only where the page shows quotes
            out.append('<p class="libpage-ai">The quotes are always the translators’ own words.</p>')
        # One calm way into the app, at the end; nothing in front of the page.
        out.append(f'<aside class="libpage-app"><p>This page is part of the Library in The Thinking Place: one short '
                   f'thought from philosophy each day, free, with no ads and no tracking.</p>'
                   f'<p><a href="{up}app/#/page/{p["id"]}">Read it in the app →</a> · <a href="{up}">About the app</a></p></aside>')
        out.append("</article>")
        return wrap(SECTION_OF[p["type"]], p["id"], out)

    def head(p, path):
        desc = description(p)
        ld = {"@context": "https://schema.org", "@type": "Article", "headline": title_of(p), "description": desc,
              "url": URL + path, "inLanguage": "en", "isPartOf": {"@type": "WebSite", "name": "The Thinking Place", "url": URL}}
        if p["type"] == "thinker":
            ld["about"] = {"@type": "Person", "name": p["title"]}
        return (f'\n  <meta property="og:type" content="article">\n  <meta property="og:title" content="{esc(title_of(p))}">'
                f'\n  <meta property="og:description" content="{esc(desc)}">\n  <meta property="og:url" content="{URL}{path}">'
                f'\n  <meta property="og:image" content="{URL}app/mark-400.png">\n  <meta name="twitter:card" content="summary">'
                f'\n  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>')

    def write(path, title, desc, body, extra_head, back):
        os.makedirs(os.path.join(SITE, path), exist_ok=True)
        depth = "../" * path.strip("/").count("/") + "../"
        open(os.path.join(SITE, path, "index.html"), "w", encoding="utf-8").write(
            tpl.replace("{{TITLE}}", esc(title)).replace("{{PATH}}", path).replace("{{DESC}}", esc(desc))
               .replace("{{HEAD}}", extra_head).replace("{{BACK}}", back).replace("{{BODY}}", body).replace("{{ROOT}}", depth))

    for pid, p in shown.items():
        path = f"library/{slugs[pid]}/"
        write(path, f"{title_of(p)} · Library", description(p), page_html(p), head(p, path),
              '<a class="back" href="../">← the Library</a>')

    # The Library home and its four sections, as in the app (LIB_SECTIONS, LIB_EXTRAS in app.js); maps
    # and timelines, comparing two paths, and the conversation questions open in the web app.
    ROWS = [("time", "In their time", "Where history meets philosophy"), ("paths", "Paths", "The twelve schools of thought"),
            ("people", "Thinkers and texts", "From A to Z"), ("topics", "Themes and topics", "The big questions, across traditions"),
            ("maps", "Maps and timelines", "Where and when they lived"),
            ("compare", "Compare two paths", "Where they agree, and where they part ways"),
            ("questions", "Questions for good conversations", "To take to a dinner, a walk, or a long drive")]
    row = lambda href, t, d="", k="": (f'<li><a href="{href}"><span><span class="t">{esc(t)}</span>'
                                       + (f'<span class="d">{esc(d)}</span>' if d else "") + "</span>"
                                       + (f'<span class="k">{esc(k)}</span>' if k else "") + "</a></li>")

    # The weekly highlight: every page in turn, a new one each Monday from 19 October 2026, in the
    # app's fixed shuffled order (app.js weeklyPage), so the site and the app show the same page.
    def hash_of(t):
        h = 7
        for c in t:
            h = (h * 31 + ord(c)) & 0xFFFFFFFF
        return h
    order = sorted(shown.values(), key=lambda p: hash_of(p["id"]))
    week = (dt.datetime.now(dt.timezone.utc).date() - dt.date(2026, 10, 19)).days // 7
    hl = order[week % len(order)]
    first = next((md for t, md in hl["sections"] if t == "In one line"), None) or hl["sections"][0][1]
    first = strip_md(re.split(r"\n\s*\n", first)[0])
    home = ['<article class="libpage libhome">', "<h1>Library</h1>",
            '<p class="libpage-intro">A well of knowledge behind each day’s thought: the thinkers, their paths, their times, '
            "and the big questions.</p>",
            '<input class="libsearch" id="libsearch" type="search" placeholder="Search the Library" aria-label="Search the Library" autocomplete="off" hidden>',
            '<ul class="libpage-list libsearch-hits" id="libsearch-hits" aria-live="polite" hidden></ul>',
            '<div class="libhome-grid" id="libhome-grid">',
            '<ul class="libpage-list">' + "".join(row(f"{k}/", t, d) for k, t, d in ROWS) + "</ul>",
            f'<div><p class="libhl-label">Weekly highlight</p><a class="libhl" href="{slugs[hl["id"]]}/">'
            f'<span class="kind">{esc(KIND[hl["type"]])}</span><span class="t">{esc(title_of(hl))}</span>'
            f'<span class="d">{esc(first)}</span><span class="go">read</span></a></div>', "</div>",
            '<aside class="libpage-app"><p>The Library is part of The Thinking Place: one short thought from philosophy each '
            'day, free, with no ads and no tracking.</p><p><a href="../app/#/library">Open the Library in the app →</a> · '
            '<a href="../">About the app</a></p></aside>', "</article>"]
    # Search, in the page itself (nothing is sent anywhere): titles first, then other names, then
    # keywords; accents and case ignored. Without scripts the box stays hidden.
    index = [[title_of(p), f"{slugs[p['id']]}/", KIND[p["type"]], plain(title_of(p)).lower(),
              plain(" ".join(p.get("aliases", []))).lower(), plain(" ".join(p["tags"])).lower()]
             for p in sorted(shown.values(), key=title_of)]
    home.append("<script>(function(){var I=" + json.dumps(index, ensure_ascii=False).replace("</", "<\\/") + ";"
                "var box=document.getElementById('libsearch'),hits=document.getElementById('libsearch-hits'),"
                "grid=document.getElementById('libhome-grid');box.hidden=false;"
                "var fold=function(t){return t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();};"
                "var esc=function(t){return t.replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});};"
                "box.addEventListener('input',function(){var q=fold(box.value);grid.hidden=!!q;hits.hidden=!q;if(!q)return;"
                "var r=I.map(function(x){var at=function(t){var i=t.indexOf(q);return i<0?-1:(i===0||t[i-1]===' '?0:1);};"
                "var s=[at(x[3]),at(x[4]),at(x[5])],k=s[0]>=0?s[0]:s[1]>=0?2+s[1]:s[2]>=0?4+s[2]:-1;return[k,x];})"
                ".filter(function(y){return y[0]>=0;}).sort(function(a,b){return a[0]-b[0];});"
                "hits.innerHTML=r.length?r.map(function(y){return'<li><a href=\"'+y[1][1]+'\"><span><span class=\"t\">'+esc(y[1][0])+"
                "'</span><span class=\"d\">'+y[1][2]+'</span></span></a></li>';}).join(''):'<li class=\"none\">Nothing found.</li>';});"
                "})();</script>")
    write("library/", "Library", "The thinkers, texts, paths, eras, and big questions behind each day’s thought in "
          "The Thinking Place: free to read, with no ads and no tracking.", "\n".join(home), "",
          '<a class="back" href="../">← back</a>')

    # The four sections, each its own page, in the app's order and wording.
    first_line = lambda p: strip_md(next((md for t, md in p["sections"] if t == "In one line"), ""))
    app_page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    voices = re.search(r"<h2>(About the voices[^<]*)</h2>\s*<p>(.*?)</p>", app_page, re.S)
    essay = next((p for p in lib["pages"] if p["type"] == "essay" and p["status"] == "Ready"), None)
    for key, title, sub in ROWS[:4]:
        out = ['<article class="libpage">', '<a class="libpage-back" href="../">← the Library</a>', f"<h1>{esc(title)}</h1>", f'<p class="libpage-intro">{esc(sub)}</p>']
        if key == "time":
            if essay:  # "Before you read", folded, as in the app after the first visit
                out.append('<details class="libpage-fold"><summary><span class="t">Before you read</span>'
                           '<span class="d">Why it helps to know the world a thinker lived in.</span></summary>'
                           + render_md(essay["sections"][0][1], Linker(lib["links"], shown, essay["id"], lambda pid: f"../{slugs[pid]}/"))
                           + "</details>")
            out += ["<h2>The eras</h2>", '<ul class="libpage-list">' + "".join(
                row(f"../{slugs[p['id']]}/", p["title"], p["header"][0]) for p in lists["time"]) + "</ul>"]
            if voices:
                out += [f'<h2 id="voices">{voices.group(1)}</h2>', f"<p>{voices.group(2)}</p>"]
        elif key == "paths":
            out.append('<ul class="libpage-list">' + "".join(row(f"../{slugs[p['id']]}/", p["title"], first_line(p)) for p in lists["paths"]) + "</ul>")
        elif key == "topics":
            out.append('<ul class="libpage-list">' + "".join(row(f"../{slugs[p['id']]}/", title_of(p)) for p in lists["topics"]) + "</ul>")
        else:  # A to Z, by family name, with letters
            letter, ul = "", []
            for p in lists["people"]:
                L = sort_key(p)[0].upper()
                if L != letter:
                    if ul:
                        out.append('<ul class="libpage-list">' + "".join(ul) + "</ul>")
                    out.append(f'<p class="libpage-letter">{L}</p>')
                    letter, ul = L, []
                ul.append(row(f"../{slugs[p['id']]}/", p["title"], "", p["path"]))
            out.append('<ul class="libpage-list">' + "".join(ul) + "</ul>")
            if voices:
                out.append('<p class="libpage-end">Missing a voice you expected? <a href="../time/#voices">Here’s why →</a></p>')
        out.append("</article>")
        write(f"library/{key}/", f"{title} · Library", sub + ": the Library of The Thinking Place.", wrap(key, None, out), "",
              '<a class="back" href="../">← the Library</a>')
    # ---- Maps and timelines, Compare two paths, and Questions for good conversations, as in the app
    # but as pages: each map's place notes written out below it, and the list of pairs instead of a
    # picker. A cited thought shows its quote only once its day has passed (our gloss always shows).
    extra_urls = []
    app_js = open(os.path.join(ROOT, "app.js"), encoding="utf-8").read()
    page_link = lambda pid: f"../{slugs[pid]}/"
    path_slug = {p["title"]: slugs[p["id"]] for p in lists["paths"]}

    def sectioned(title, sub, body):
        return ['<article class="libpage">', '<a class="libpage-back" href="../">← the Library</a>', f"<h1>{esc(title)}</h1>",
                f'<p class="libpage-intro">{esc(sub)}</p>', *body, "</article>"]

    def app_block(hash_route, label="Read it in the app →"):
        return (f'<aside class="libpage-app"><p>This page is part of the Library in The Thinking Place: one short thought '
                f'from philosophy each day, free, with no ads and no tracking.</p><p><a href="../../app/#/{hash_route}">{label}</a>'
                f' · <a href="../../">About the app</a></p></aside>')

    write("library/maps/", "Maps and timelines · Library", "Where and when the thinkers of The Thinking Place lived: maps and timelines.",
          wrap("maps", None, sectioned("Maps and timelines", "Where and when they lived",
                                       ['<ul class="libpage-list">' + "".join(row(f"../{k}/", t, d) for k, t, d in MAPS) + "</ul>"])),
          "", '<a class="back" href="../">← the Library</a>')

    # The three maps: the app's own drawing (index.html), each dot a link to its place's note below.
    for key, title, sub in MAPS[:3]:
        m = re.search(rf'<figure class="map-figure" data-map="{key}">(.*?)</figure>', app_page, re.S)
        inner, places = re.sub(r"\s*<figcaption>.*?</figcaption>", "", m.group(1), flags=re.S), []

        def dot(mm):
            a = dict(re.findall(r'([\w-]+)="([^"]*)"', mm.group(1)))
            places.append((html.unescape(a["data-title"]), html.unescape(a["data-text"])))
            return f'<a class="map-dot" style="{a["style"]}" href="#place-{len(places)}" aria-label="{a["aria-label"]}"></a>'
        inner = re.sub(r'<button type="button" class="map-dot"([^>]*)>\s*</button>', dot, inner)
        inner = re.sub(r'href="#/library/([\w-]+)"', r'href="../\1/"', inner)
        assert places and "<button" not in inner, f"the {key} map's dots were not all read"
        body = ['<article class="libpage libmap">', '<a class="libpage-back" href="../maps/">← maps and timelines</a>',
                f"<h1>{esc(title)}</h1>", f'<p class="libpage-intro">{esc(sub)}</p>',
                "<p>Each dot marks where our thinkers lived and wrote. Tap one to read about the place below.</p>",
                f'<figure class="map-figure" data-map="{key}">{inner}</figure>']
        if key == "world":
            body.append('<p class="libpage-hint">Tap Europe or Asia on the map to see it closer.</p>')
        body.append("<h2>The places</h2>")
        for i, (ptitle, text) in enumerate(places, 1):
            lk = Linker(lib["links"], shown, None, page_link)  # each place links the thinkers it names
            parts = []
            for block in text.split("\n\n"):
                lines = block.split("\n")
                if lines[0] != ptitle:
                    parts.append(f'<p class="where">{esc(lines[0])}</p>')
                if len(lines) > 1:
                    parts.append(f'<p class="who">{lk(lines[1])}</p>')
                if len(lines) > 2:
                    parts.append(f"<p>{lk(' '.join(lines[2:]))}</p>")
            body.append(f'<section class="libplace" id="place-{i}"><h3>{esc(ptitle)}</h3>{"".join(parts)}</section>')
        body += [app_block(f"library/{key}", "See it in the app →"), "</article>"]
        write(f"library/{key}/", f"{title.replace(', closer', '')} · Library", f"{sub}: a map of where the thinkers of "
              "The Thinking Place lived, with a note on each place.", "\n".join(body), "", '<a class="back" href="../maps/">← maps and timelines</a>')
        extra_urls.append(f"library/{key}/")

    # The paths through time: the app's TIMELINE (app.js), to scale within each era, long gaps cut short.
    timeline = [(int(y), lab, path) for y, lab, path in
                re.findall(r'\[(-?\d+), "([^"]+)", "([^"]+)"\]', re.search(r"const TIMELINE = \[(.*?)\];", app_js, re.S).group(1))]
    gap_years = int(re.search(r"const GAP_YEARS = (\d+)", app_js).group(1))
    rem_per_year = float(re.search(r"const REM_PER_YEAR = ([\d.]+)", app_js).group(1))
    li = []
    for i, (year, label, path) in enumerate(timeline):
        gap = year - timeline[i - 1][0] if i else 0
        if gap > gap_years:
            li.append(f'<li class="tl-break"><span class="tl-mark" aria-hidden="true">//</span><span class="tl-gap">about {round(gap / 100) * 100} years</span></li>')
        top = f' style="margin-top:{min(4, max(0.35, gap * rem_per_year)):.2f}rem"' if i and gap <= gap_years else ""
        link = f'<a class="tl-path" href="../{path_slug[path]}/">{esc(path)}</a>' if path in path_slug else f'<span class="tl-path">{esc(path)}</span>'
        li.append(f'<li class="tl-item"{top}><span class="tl-year">{esc(label)}</span>{link}</li>')
    axial = re.search(r'<ol class="timeline" id="timeline"></ol>\s*<p>(.*?)</p>', app_page, re.S)
    k, t, d = MAPS[3]
    write(f"library/{k}/", f"{t} · Library", f"{d}: when each of the twelve paths of The Thinking Place began.",
          wrap("maps", k, sectioned(t, d, ["<p>When each path began.</p>", '<ol class="timeline">' + "".join(li) + "</ol>",
                                           f"<p>{axial.group(1)}</p>" if axial else "", app_block(f"library/{k}", "See it in the app →")])),
          "", '<a class="back" href="../maps/">← maps and timelines</a>')
    extra_urls.append(f"library/{k}/")

    # The thinkers through time (app.js thinkersInTime): oldest first, a label per century, a dashed
    # stretch where three or more centuries pass with nobody.
    NUMBERS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
    ordinal = lambda n: f"{n}{'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"
    century = lambda y: -((-y + 99) // 100) if y < 0 else (y + 99) // 100
    step = lambda c: c + 1 if c < 0 else c
    rows, prev = [], None
    for x in sorted(lists["people"], key=lambda x: (x["start"], x["title"])):
        c = century(x["start"])
        if c != prev:
            if prev is not None and step(c) - step(prev) >= 3:
                n = step(c) - step(prev)
                rows.append(f'<li class="ttl-gap"><span>{NUMBERS[n] if n < len(NUMBERS) else n} centuries later</span></li>')
            rows.append(f'<li class="ttl-century"><span>{ordinal(abs(c))} century{" BCE" if c < 0 else ""}</span></li>')
            prev = c
        rows.append(f'<li class="ttl-row{" soft" if x["type"] == "text" else ""}"><a href="{page_link(x["id"])}"><span class="t">{esc(x["title"])}</span>'
                    f'<span class="d">{esc(x["header"][1] if len(x["header"]) > 1 else "")}</span><span class="k">{esc(x["path"])}</span></a></li>')
    k, t, d = MAPS[4]
    write(f"library/{k}/", f"{t} · Library", f"{d}: every thinker and text of The Thinking Place in order of time.",
          wrap("maps", k, sectioned(t, d, ['<p class="ttl-note">The texts of ancient India, in italics, grew over centuries in the hands '
                                           "of many authors, so they appear at the start of their span.</p>",
                                           '<ol class="ttl">' + "".join(rows) + "</ol>", app_block(f"library/{k}", "See it in the app →")])),
          "", '<a class="back" href="../maps/">← maps and timelines</a>')
    extra_urls.append(f"library/{k}/")

    # Compare two paths: the app's picker (two of the twelve paths; a third pick replaces the older
    # one), then the list, then a page per written pair. The picker runs inside the page and stays
    # hidden without scripts, which leaves the list.
    if pairs:
        chips = "".join(f'<li><button type="button" class="libchip" aria-pressed="false">{esc(t)}</button></li>' for t in LIB_PATHS)
        picker = ('<div id="libpick" hidden><p class="libpick-label">Pick two</p><ul class="libchips">' + chips + "</ul>"
                  '<div class="libverdict" id="libverdict" aria-live="polite"></div></div>')
        data = json.dumps([[x["a"], x["b"], x["id"], strip_md(x["line"])] for x in pairs], ensure_ascii=False).replace("</", "<\\/")
        script = ("<script>(function(){var P=" + data + ",pick=[],box=document.getElementById('libpick'),"
                  "v=document.getElementById('libverdict'),chips=[].slice.call(box.querySelectorAll('.libchip'));box.hidden=false;"
                  "var esc=function(t){return t.replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c];});};"
                  "function draw(){chips.forEach(function(c){c.setAttribute('aria-pressed',String(pick.indexOf(c.textContent)>=0));});"
                  "var a=pick[0],b=pick[1],p=a&&b&&P.filter(function(x){return(x[0]===a&&x[1]===b)||(x[0]===b&&x[1]===a);})[0];"
                  "v.innerHTML=p?'<a class=\"libverdict-pair\" href=\"../'+p[2]+'/\"><span class=\"t\">'+esc(p[0])+' and '+esc(p[1])+"
                  "'</span><span class=\"d\">'+esc(p[3])+'</span><span class=\"go\">read</span></a>':'<p class=\"quiet\">'+"
                  "(!a?'Pick two paths.':!b?esc(a)+', and…':'We haven\\u2019t written this pair yet.')+'</p>';}"
                  "chips.forEach(function(c){c.addEventListener('click',function(){var t=c.textContent,i=pick.indexOf(t);"
                  "if(i>=0)pick.splice(i,1);else{pick.push(t);if(pick.length>2)pick.shift();}draw();});});draw();})();</script>")
        write("library/compare/", "Compare two paths · Library", "Where two paths of philosophy agree, and where they part ways, "
              "with a few of their thoughts side by side.",
              wrap("compare", None, sectioned("Compare two paths", "Where two paths agree, and where they part ways, with a few of "
                                              "their thoughts side by side.", [picker, "<h2>Pairs to read</h2>", '<ul class="libpage-list">' + "".join(
                                                  row(f"../{x['id']}/", f"{x['a']} and {x['b']}", strip_md(x["line"])) for x in pairs) + "</ul>",
                                                  script])),
              "", '<a class="back" href="../">← the Library</a>')
        extra_urls.append("library/compare/")
    for x in pairs:
        lk = Linker(lib["links"], shown, None, page_link)
        out = ['<article class="libpage">', '<a class="libpage-back" href="../compare/">← compare two paths</a>',
               '<p class="libpage-kind">Two paths</p>', f"<h1>{esc(x['a'])} and {esc(x['b'])}</h1>",
               '<p class="libpage-header">' + " · ".join(f'<a href="../{path_slug[n]}/">{esc(n)}</a>' if n in path_slug else esc(n)
                                                         for n in (x["a"], x["b"])) + "</p>",
               f'<p class="libpage-one">{inline(x["line"], lk)}</p>']
        for head_, pts in (("Where they agree", x["agree"]), ("Where they part ways", x["part"])):
            out += [f"<h2>{head_}</h2>", '<ul class="libpage-points">' + "".join(
                f"<li><strong>{esc(h)}</strong> {inline(tx, lk)}</li>" for h, tx in pts) + "</ul>"]
        quotes, cites = False, []
        for c in x["thoughts"]:
            seen = days.get(c["id"])
            q = (f'<span class="q">{esc(by_id[c["id"]]["text"]).replace(" / ", "<br>")}</span>') if seen else ""
            quotes = quotes or bool(seen)
            inner = f'<span class="p">{esc(c["path"])}</span>{q}<span class="s">{esc(c["gloss"])}</span>'
            cites.append(f'<a class="libcite" href="../../app/#/day/{seen[0]}">{inner}</a>' if seen else f'<div class="libcite">{inner}</div>')
        out += ["<h2>From our thoughts</h2>", '<div class="libcites">' + "".join(cites) + "</div>",
                "<h2>Compare</h2>", '<p class="libpage-go"><a href="../compare/">every pair</a></p>']
        if quotes:
            out.append('<p class="libpage-ai">The quotes are always the translators’ own words.</p>')
        out += [app_block(f"pair/{x['id']}"), "</article>"]
        write(f"library/{x['id']}/", f"{x['a']} and {x['b']} · Library", strip_md(x["line"])[:160], wrap("compare", x["id"], out), "",
              '<a class="back" href="../compare/">← compare two paths</a>')
        extra_urls.append(f"library/{x['id']}/")

    # Questions for good conversations: one page, a section per group, each question from a thought
    # (a link to its day once that day has passed).
    if conv_qs:
        body = []
        for g in conv["groups"]:
            qs = [q for q in conv_qs if g["key"] in q["groups"]]
            if not qs:
                continue
            items = []
            for q in qs:
                e, seen = by_id[q["id"]], days.get(q["id"])
                who = f'from {esc(e["source"].split(",")[0])}<span class="p">{esc(e["path"])}</span>'
                src = f'<a class="libfrom" href="../../app/#/day/{seen[0]}">{who}</a>' if seen else f'<span class="libfrom">{who}</span>'
                items.append(f'<li><p class="q">{esc(q["question"])}</p>{src}</li>')
            body += [f'<h2 id="{g["key"]}">{esc(g["label"])}</h2>', '<ul class="libqs">' + "".join(items) + "</ul>"]
        # "Give me one" (the intro promises it): picks from the questions on the page, never the one
        # just shown; inside the page only, and hidden without scripts.
        body.insert(0, '<div class="libq-one" id="libq-one" aria-live="polite"></div>'
                       '<button type="button" class="libq-give" id="libq-give" hidden>give me one</button>')
        body.append(app_block("library/questions", "Open them in the app →"))
        body.append("<script>(function(){var b=document.getElementById('libq-give'),box=document.getElementById('libq-one'),"
                    "seen={},last=-1,qs=[].slice.call(document.querySelectorAll('.libqs li')).filter(function(li){"
                    "var t=li.querySelector('.q').textContent;if(seen[t])return false;seen[t]=1;return true;});"
                    "b.hidden=false;b.addEventListener('click',function(){var i;do{i=Math.floor(Math.random()*qs.length);}"
                    "while(qs.length>1&&i===last);last=i;var d=document.createElement('div');d.className='libq-card';"
                    "d.innerHTML=qs[i].innerHTML;box.replaceChildren(d);b.textContent='another';});})();</script>")
        write("library/questions/", "Questions for good conversations · Library", conv["intro"],
              wrap("questions", None, sectioned("Questions for good conversations", conv["intro"], body)), "",
              '<a class="back" href="../">← the Library</a>')
        extra_urls.append("library/questions/")
    # The sitemap: the website's own pages, the Library home, its sections, and every page (the web
    # app itself is one page with hash routes, so only its address is listed).
    urls = ["", "app/", "about.html", "questions.html", "terms.html", "iphone.html", "library/"]
    urls += [f"library/{k}/" for k, _ in SECTIONS if f"library/{k}/" not in extra_urls] + extra_urls + [f"library/{slugs[pid]}/" for pid in sorted(shown, key=lambda i: slugs[i])]
    open(os.path.join(SITE, "sitemap.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{URL}{u}</loc></url>\n" for u in urls) + "</urlset>\n")
    print(f"library/ ready: {len(shown)} pages, thoughts up to {last}; sitemap.xml: {len(urls)} addresses")
