"""Build the app's data from the content team's spreadsheets in content/.

    python3 tools/fetch_content.py <sources-dir>    # once, downloads the source texts
    python3 tools/build_content.py <sources-dir>

Writes entries.json (the thoughts), calendar.json (the 728-day cycle that loops forever,
the pinned dates and the evening teasers; see calendar_rules.py) and glossary.json. Every quote is first checked word for word against
its source by check_quotes.py; the build stops if any quote fails.

Thought ids are the # column of thoughts.xlsx and never change. Thoughts from the first
365-day version keep their old text ids as "legacy", so notes written on them follow;
old thoughts that were dropped stay in entries.json as "retired" (never scheduled).
"""
import json, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from content_io import ROOT, read_thoughts, read_calendar, read_pinned, read_glossary, translation, source_url
import calendar_rules
import check_quotes

PATHS = ["Stoicism", "Epicureanism", "Classical Greek Philosophy", "Enlightenment Ethics",
         "Existential Thought", "Humanists and Essayists", "Buddhist Philosophy", "Indian Philosophy",
         "Taoism", "Confucianism", "Japanese Aesthetics", "Persian and Sufi Poetry"]

# Links shown under a thought when the spreadsheet's link is a page that only quotes the
# book (the quote is checked against the book itself, see content_io.EXTRA_SOURCES).
CREDIT_URL = {
    "https://rohanmaitzen.com/2009/05/06/the-other-sides-of-silence/": "https://www.gutenberg.org/ebooks/145",
    "https://georgeeliotarchive.org/items/show/58607": "https://www.gutenberg.org/ebooks/145",
    "https://apposition.substack.com/p/unvisited-tombs": "https://www.gutenberg.org/ebooks/145",
    "https://bnk.institutkurde.org/images/pdf/43SW7NCMFH.pdf": "https://archive.org/details/in.ernet.dli.2015.52959",
}

# Free books to start each path with, shown on its card.
START_READING = {
    "Stoicism": "https://www.gutenberg.org/ebooks/15877",
    "Epicureanism": "https://en.wikisource.org/wiki/Lives_of_the_Eminent_Philosophers/Book_X",
    "Classical Greek Philosophy": "https://www.gutenberg.org/ebooks/1656",
    "Enlightenment Ethics": "https://www.gutenberg.org/ebooks/34901",
    "Existential Thought": "https://www.gutenberg.org/ebooks/600",
    "Humanists and Essayists": "https://www.gutenberg.org/ebooks/205",
    "Buddhist Philosophy": "https://www.gutenberg.org/ebooks/2017",
    "Indian Philosophy": "https://www.gutenberg.org/ebooks/2388",
    "Taoism": "https://www.gutenberg.org/ebooks/216",
    "Confucianism": "https://www.gutenberg.org/ebooks/3330",
    "Japanese Aesthetics": "https://www.gutenberg.org/ebooks/769",
    "Persian and Sufi Poetry": "https://www.gutenberg.org/ebooks/13060",
}


# School names of the first version, now paths.
RENAMED = {"Platonism": "Classical Greek Philosophy", "Virtue Ethics": "Classical Greek Philosophy",
           "Duty Ethics": "Enlightenment Ethics", "Utilitarianism": "Enlightenment Ethics",
           "Existentialism": "Existential Thought"}


def credit(raw):
    """The translation credit as readers see it: notes for the content team left out."""
    c = re.split(r",? checked against the text|, replaces |; ", raw)[0].strip()
    c = c.replace(" (translator's brackets removed)", "")
    c = re.sub(r"^Original English", "Written in English", c)
    c = c.replace("Translated from the French by The Thinking Place team", "Translated from the French by The Thinking Place")
    c = c.replace("dedicated to the public domain (CC0)", "public domain (CC0)")
    return c


def wiki_title(url):
    return urllib.parse.unquote(url.rsplit("/wiki/", 1)[1]) if url and "/wiki/" in url else url


def split_list(s):
    return [x.strip() for x in (s or "").split(",") if x.strip()]


def main(srcdir):
    old = json.load(open(os.path.join(ROOT, "entries.json"), encoding="utf-8"))
    if old and isinstance(old[0].get("id"), int):  # already rebuilt once: keep the legacy map
        legacy_src = json.load(open(os.path.join(HERE, "legacy_365.json"), encoding="utf-8"))
    else:
        legacy_src = old
        json.dump(old, open(os.path.join(HERE, "legacy_365.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    old_by_text = {e["text"]: e for e in legacy_src}

    failures = []
    entries = []
    for t in read_thoughts():
        status, info = check_quotes.check(t, srcdir, set(old_by_text))
        if status not in ("ok", "ok-old", "own"):
            failures.append(f"{t['id']} {status} {t['source']}: {info[:200]}")
            continue
        if t["path"] not in PATHS:
            failures.append(f"{t['id']} unknown path {t['path']!r}")
            continue
        prev = old_by_text.get(t["text"])
        url = source_url(t)
        raw_url = (t["translation_raw"] or "").split("|")[-1].strip() if "|" in (t["translation_raw"] or "") else ""
        e = {
            "id": t["id"],
            "path": t["path"],
            "text": t["text"],
            "source": t["source"],
            "context": t["context"],
            "prompt": t["prompt"],
            "translation": credit(translation(t)) if translation(t) else prev["translation"],
            "source_url": CREDIT_URL.get(raw_url) or (raw_url if url else prev["source_url"]),
            "themes": [x for x in (t["theme1"], t["theme2"]) if x],
            "difficulty": t["difficulty"],
            "value": t["value"],
        }
        if prev:
            e["legacy"] = prev["id"]
        entries.append(e)
    if failures:
        sys.exit("\n".join(failures) + f"\n{len(failures)} thought(s) failed")

    # Thoughts whose wording changed (a new translation) keep their old id when the
    # reference matches exactly one new thought, e.g. "Blaise Pascal, Pensées 139".
    kept = {e.get("legacy") for e in entries}
    for o in legacy_src:
        if o["id"] in kept:
            continue
        same = [e for e in entries if not e.get("legacy") and
                (e["source"] == o["source"] or e["source"].startswith(o["source"] + " "))]
        if len(same) == 1:
            same[0]["legacy"] = o["id"]
            kept.add(o["id"])
    for o in legacy_src:  # dropped thoughts stay readable for notes written on them
        if o["id"] not in kept:
            entries.append({"id": o["id"], "path": o["tradition"], "text": o["text"], "source": o["source"],
                            "context": o["context"], "prompt": o["prompt"], "translation": o["translation"],
                            "source_url": o["source_url"], "themes": [], "retired": True})

    ids = {e["id"] for e in entries}
    days = read_calendar()
    pinned = read_pinned()
    import datetime
    for k, d in enumerate(days):
        assert d["date"] == str(calendar_rules.date_of(k)), f"calendar dates must run day by day from 20 October 2026 ({d['date']})"
    missing = [d["date"] for d in days if d["id"] not in ids] + [md for md, p in pinned.items() if p["id"] not in ids]
    if missing:
        sys.exit(f"calendar days with unknown thought ids: {missing[:10]}")
    cycle = [(d["id"], d["revisit"]) for d in days]
    by_id = {e["id"]: e for e in entries}
    problems, stats = calendar_rules.check(cycle, {md: p["id"] for md, p in pinned.items()}, by_id)
    if problems:
        sys.exit("calendar rules broken:\n" + "\n".join(problems[:30]) + f"\n({len(problems)} in all)")
    # Each evening's teaser describes the next day's thought, and belongs to that thought.
    teasers = {}
    for k, d in enumerate(days):
        nxt = days[(k + 1) % len(days)]
        if not nxt["revisit"]:
            if not d["teaser"]:
                sys.exit(f"no evening teaser on {d['date']} (about #{nxt['id']})")
            teasers[str(nxt["id"])] = d["teaser"]
    calendar = {"start": days[0]["date"], "cycle": [[i, 1] if rev else [i] for i, rev in cycle],
                "teasers": teasers, "revisitTeaser": calendar_rules.REVISIT_TEASER,
                "pinned": {md: [p["id"], p["occasion"], p["teaser"]] for md, p in sorted(pinned.items())},
                "words": teaser_words(by_id, teasers)}
    if PREVIEW_DAYS:
        calendar["preview"] = preview(entries, cycle, days[0]["date"])
    json.dump(entries, open(os.path.join(ROOT, "entries.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(calendar, open(os.path.join(ROOT, "calendar.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    build_glossary()
    live = [e for e in entries if not e.get("retired")]
    print(f"{len(live)} thoughts (+{len(entries) - len(live)} retired) -> entries.json")
    print(f"{len(days)}-day cycle from {days[0]['date']} ({sum(r for _, r in cycle)} revisits), {len(pinned)} pinned dates "
          f"-> calendar.json; shortest gap over {stats['years']} years: {stats['shortest_gap'][0]} days")


def teaser_words(by_id, teasers):
    """How the content team's evening teasers name each path and theme ("a Stoic thought",
    "pride and humility"), so the app can word reminders and new teasers the same way."""
    import collections
    paths, themes = collections.defaultdict(collections.Counter), collections.defaultdict(collections.Counter)
    for i, text in teasers.items():
        m = re.match(r"Tomorrow: (.*) on (.*)\.$", text)
        if m:
            e = by_id[int(i)]
            paths[e["path"]][m.group(1)] += 1
            themes[e["themes"][0]][m.group(2)] += 1
    return {"paths": {k: v.most_common(1)[0][0] for k, v in paths.items()},
            "themes": {k: v.most_common(1)[0][0] for k, v in themes.items()}}


# TEST BUILDS ONLY: days before the calendar starts get easy thoughts from late in the
# calendar, so past thoughts has something to show while testing. Set to 0 before launch.
PREVIEW_DAYS = 10


def preview(entries, cycle, start):
    """Test days before the cycle starts (outside the loop): easy thoughts from late in it."""
    import datetime
    late = {i for i, rev in cycle[len(cycle) // 2:] if not rev}
    picks, seen = [], set()
    for e in sorted((e for e in entries if not e.get("retired")), key=lambda e: e["id"]):
        if e["id"] in late and e.get("value") == 5 and e.get("difficulty", 9) <= 2 and e["path"] not in seen:
            picks.append(e["id"]); seen.add(e["path"])
        if len(picks) == PREVIEW_DAYS:
            break
    first = datetime.date.fromisoformat(start) - datetime.timedelta(days=len(picks))
    return {"start": first.isoformat(), "ids": picks}


def build_glossary():
    """glossary.json from glossary.xlsx, keeping the matching rules of the old file."""
    old = {g["term"]: g for g in json.load(open(os.path.join(ROOT, "glossary.json"), encoding="utf-8"))}
    sheets = read_glossary()
    out = []
    for s in sheets["Schools"]:
        out.append({"term": s["School"], "match": split_list(s["Appears as"]) or [s["School"]],
                    "wiki": wiki_title(s["Wikipedia"]), "def": s["Definition"],
                    "school": {"who": s["We read"], "began": s["Began"],
                               "read": {"title": s["Start reading"], "url": START_READING[s["School"]]}}})
    for s in sheets["Core concepts"]:
        g = {"term": s["Term"], "match": split_list(s["Appears as"]) or [s["Term"]],
             "scope": [s["School"]], "wiki": wiki_title(s["Wikipedia"]), "def": s["Definition"], "concept": True}
        if old.get(s["Term"], {}).get("exact"):
            g["exact"] = True
        out.append(g)
    for s in sheets["Other terms"]:
        g = {"term": s["Term"], "match": split_list(s["Appears as"]) or [s["Term"]],
             "wiki": wiki_title(s["Wikipedia"]), "def": s["Definition"]}
        o = old.get(s["Term"], {})
        if o.get("scope"):  # terms that only make sense on some paths (e.g. the Chinese "li")
            g["scope"] = sorted({RENAMED.get(p, p) for p in o["scope"]})
        if o.get("exact"):
            g["exact"] = True
        out.append(g)
    unknown = {p for g in out for p in g.get("scope", []) if p not in PATHS}
    if unknown:
        sys.exit(f"glossary scopes that are not paths: {unknown}")
    json.dump(out, open(os.path.join(ROOT, "glossary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(out)} glossary entries -> glossary.json")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "sources"))
