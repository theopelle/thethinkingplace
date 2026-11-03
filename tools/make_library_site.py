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
    # pages with this one marked). Maps and timelines, comparing paths, and the conversation
    # questions live in the web app.
    by = lambda t: [p for p in shown.values() if p["type"] == t]
    lists = {"time": sorted(by("era"), key=lambda p: (p["start"], p.get("eraOrder") or 0)),
             "paths": sorted(by("path"), key=lambda p: PATH_ORDER.index(p["title"])),
             "people": sorted(by("thinker") + by("text"), key=sort_key),
             "topics": sorted(by("topic"), key=title_of)}
    SECTIONS = [("time", "In their time"), ("paths", "Paths"), ("people", "Thinkers and texts"), ("topics", "Themes and topics")]
    IN_APP = [("maps", "Maps and timelines"), ("compare", "Compare two paths"), ("questions", "Questions for good conversations")]
    SECTION_OF = {"era": "time", "path": "paths", "thinker": "people", "text": "people", "topic": "topics"}

    def rail(p):
        sec, out = SECTION_OF[p["type"]], ['<nav class="librail" aria-label="Library contents">', '<a class="home" href="../">Library</a>', '<ul class="secs">']
        for key, label in SECTIONS:
            here = ' aria-current="true"' if key == sec else ""
            out.append(f'<li><a href="../#{key}"{here}>{label}</a>')
            if key == sec:
                out.append('<ul class="sub">')
                letter = ""
                for x in lists[key]:
                    if key == "people" and sort_key(x)[0].upper() != letter:
                        letter = sort_key(x)[0].upper()
                        out.append(f'<li class="letter" aria-hidden="true">{letter}</li>')
                    mark = ' aria-current="page"' if x["id"] == p["id"] else ""
                    out.append(f'<li><a href="../{slugs[x["id"]]}/"{mark}>{esc(x["title"] if key == "people" else title_of(x))}</a></li>')
                out.append("</ul>")
            out.append("</li>")
        out += [f'<li><a href="../../app/#/library/{key}">{label}</a></li>' for key, label in IN_APP]
        out += ["</ul>", "</nav>"]
        return "\n".join(out)

    def page_html(p):
        up = "../../"
        href = lambda pid: f"../{slugs[pid]}/"
        linker = Linker(lib["links"], shown, p["id"], href)
        path_page = lambda name: next((x for x in shown.values() if x["type"] == "path" and x["title"] == name), None)
        out = [f'<article class="libpage">', f'<p class="libpage-kind">{esc(KIND[p["type"]])}</p>',
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
        # The current page in the middle of its list (wide screens; a no-op elsewhere)
        centre = ("<script>(function(){var a=document.querySelector('.librail .sub [aria-current]');if(a){var s=a.closest('.sub');"
                  "s.scrollTop=a.offsetTop-s.offsetTop-s.clientHeight/2+a.offsetHeight/2;}})();</script>")
        return '<div class="libwrap">\n' + rail(p) + "\n" + "\n".join(out) + "\n</div>\n" + centre

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

    # The index: the four sections of the app's Library, with the rest (maps and timelines, comparing
    # paths, conversation questions, search) one tap away in the web app.
    row = lambda p, d="": (f'<li><a href="{slugs[p["id"]]}/"><span class="t">{esc(title_of(p))}</span>'
                           f'<span class="d">{esc(d)}</span></a></li>')
    body = ['<article class="libpage">', "<h1>Library</h1>",
            '<p class="libpage-intro">A well of knowledge behind each day’s thought in The Thinking Place: the thinkers, '
            "their paths, their times, and the big questions.</p>",
            '<h2 id="time">In their time</h2>', '<ul class="libpage-list">' + "".join(
                row(p, p["header"][0]) for p in sorted(by("era"), key=lambda p: (p["start"], p.get("eraOrder") or 0))) + "</ul>",
            '<h2 id="paths">Paths</h2>', '<ul class="libpage-list">' + "".join(
                row(p) for p in sorted(by("path"), key=lambda p: PATH_ORDER.index(p["title"]))) + "</ul>",
            '<h2 id="people">Thinkers and texts</h2>', '<ul class="libpage-list">' + "".join(
                row(p, p["path"]) for p in sorted(by("thinker") + by("text"), key=sort_key)) + "</ul>",
            '<h2 id="topics">Themes and topics</h2>', '<ul class="libpage-list">' + "".join(
                row(p) for p in sorted(by("topic"), key=title_of)) + "</ul>",
            '<aside class="libpage-app"><p>In the app, the Library also has maps and timelines, a way to compare two '
            'paths, and questions for good conversations.</p><p><a href="../app/#/library">Open the Library in the app →</a></p></aside>',
            "</article>"]
    write("library/", "Library", "The thinkers, texts, paths, eras, and big questions behind each day’s thought in "
          "The Thinking Place: free to read, with no ads and no tracking.", "\n".join(body), "",
          '<a class="back" href="../">← back</a>')
    print(f"library/ ready: {len(shown)} pages, thoughts up to {last}")
