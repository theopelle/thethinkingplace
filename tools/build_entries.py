"""Build reflect/entries.json from the spec files, quoting every passage
verbatim from a downloaded public-domain source text.

    python3 reflect/tools/fetch_sources.py <sources-dir>   # once
    python3 reflect/tools/build_entries.py <sources-dir>
    python3 reflect/tools/build_entries.py <sources-dir> --freeze   # after a release

Released passages never move. tools/released.json lists their ids in schedule
order; the build keeps that order and appends anything new after it. To swap a
released passage, give the new spec entry "replaces": "<old id>" and it takes the
old one's slot. After adding passages, extend SCHEDULE in app.js with a block that
starts on a future date, then run with --freeze to lock the new order.

Each spec entry locates its passage in a source by reference (Bible-style
"15:1" for verse-indexed sources) or by a start and end phrase. If a phrase
is not found, the build fails, so nothing is ever quoted from memory.
"""
import hashlib, json, os, re, sys, unicodedata, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "entries.json")
RELEASED = os.path.join(HERE, "released.json")

# Rotation order: one tradition per day, cycling.
ORDER = ["Stoicism", "Taoism", "Virtue Ethics", "Buddhist Philosophy", "Epicureanism",
         "Duty Ethics", "Japanese Aesthetics", "Platonism", "Utilitarianism", "Existentialism",
         "Confucianism"]

G = "https://www.gutenberg.org/ebooks/"
SOURCES = {
    # key: (file, kind, translation, url)
    "kjv":        ("pg10.txt", "bible", "King James Version (1611)", G + "10"),
    "proverbs":   ("proverbs.tsv", "refs", "JPS Tanakh (1917)", "https://www.sefaria.org/Proverbs"),
    "eccl":       ("eccl.tsv", "refs", "JPS Tanakh (1917)", "https://www.sefaria.org/Ecclesiastes"),
    "avot":       ("pg8547.txt", "text", "Joseph I. Gorfinkle (1913)", G + "8547"),
    "quran":      ("quran_yusufali.txt", "quran", "Abdullah Yusuf Ali (1934)", "https://tanzil.net/trans/en.yusufali"),
    "hadith":     ("suhrawardy.txt", "text", "Abdullah al-Mamun al-Suhrawardy, The Sayings of Muhammad (1905)",
                   "https://archive.org/details/the-sayings-of-muhammad_202401"),
    "dhammapada": ("pg2017.txt", "numbered", "F. Max Müller (1881)", G + "2017"),
    "marcus":     ("pg15877.txt", "text", "George Long (1862)", G + "15877"),
    "epictetus":  ("pg10661.txt", "text", "George Long (1877)", G + "10661"),
    "seneca":     ("pg64576.txt", "text", "Aubrey Stewart (1889)", G + "64576"),
    "epicurus":   ("dl10.txt", "text", "R. D. Hicks (1925)",
                   "https://en.wikisource.org/wiki/Lives_of_the_Eminent_Philosophers/Book_X"),
    "lucretius":  ("pg785.txt", "text", "William Ellery Leonard (1916)", G + "785"),
    # Jowett's files open with his own introduction; quotes must come from the
    # dialogue itself, so those sources are searched only after it begins.
    "apology":    ("pg1656.txt", "text", "Benjamin Jowett (1871)", G + "1656"),
    "crito":      ("pg1657.txt", "text", "Benjamin Jowett (1871)", G + "1657"),
    "phaedo":     ("pg1658.txt", "text", "Benjamin Jowett (1871)", G + "1658"),
    "republic":   ("pg1497.txt", "text", "Benjamin Jowett (1871)", G + "1497"),
    "symposium":  ("pg1600.txt", "text", "Benjamin Jowett (1871)", G + "1600"),
    "phaedrus":   ("pg1636.txt", "text", "Benjamin Jowett (1871)", G + "1636"),
    "gorgias":    ("pg1672.txt", "text", "Benjamin Jowett (1871)", G + "1672"),
    "theaetetus": ("pg1726.txt", "text", "Benjamin Jowett (1871)", G + "1726"),
    "meno":       ("pg1643.txt", "text", "Benjamin Jowett (1871)", G + "1643"),
    "laws":       ("pg1750.txt", "text", "Benjamin Jowett (1871)", G + "1750"),
    "zarathustra":("pg1998.txt", "text", "Thomas Common (1909)", G + "1998"),
    "bge":        ("pg4363.txt", "text", "Helen Zimmern (1906)", G + "4363"),
    "gaya":       ("pg52881.txt", "text", "Thomas Common (1910)", G + "52881"),  # Cohn and Petre did only the verse
    "human":      ("pg38145.txt", "text", "Alexander Harvey (1908)", G + "38145"),
    "karamazov":  ("pg28054.txt", "text", "Constance Garnett (1912)", G + "28054"),
    "underground":("pg600.txt", "text", "Constance Garnett (1918)", G + "600"),
    "pascal":     ("pg18269.txt", "text", "W. F. Trotter (1910)", G + "18269"),
    "taote":      ("pg216.txt", "text", "James Legge (1891)", G + "216"),
    "analects":   ("pg3330.txt", "text", "James Legge (1861)", G + "3330"),
    # Swenson quotes Kierkegaard throughout this essay, translating from the Danish himself.
    "swenson":    ("swenson_kierkegaard.txt", "text", "David F. Swenson (1920)",
                   "https://en.wikisource.org/wiki/S%C3%B6ren_Kierkegaard"),
    "zhuangzi":   ("pg59709.txt", "text", "Herbert A. Giles (1889)", G + "59709"),
    "aristotle":  ("pg8438.txt", "text", "D. P. Chase (1847)", G + "8438"),
    "kant_g":     ("pg5682.txt", "text", "Thomas Kingsmill Abbott (1873)", G + "5682"),
    "kant_p":     ("pg5683.txt", "text", "Thomas Kingsmill Abbott (1873)", G + "5683"),
    "mill_u":     ("pg11224.txt", "text", "Written in English (1863)", G + "11224"),
    "mill_l":     ("pg34901.txt", "text", "Written in English (1859)", G + "34901"),
    "mill_a":     ("pg10378.txt", "text", "Written in English (1873)", G + "10378"),
    "tea":        ("pg769.txt", "text", "Written in English (1906)", G + "769"),
    "aston":      ("aston_b4c3.txt", "text", "W. G. Aston (1899)",
                   "https://en.wikisource.org/wiki/A_History_of_Japanese_Literature/Book_4/Chapter_3"),
    "kenko":      ("porter_kenko.txt", "text", "William N. Porter (1914)",
                   "https://archive.org/details/miscellanyofjapa00yosh"),
    **{f"gita{i}": (f"gita_{i}.txt", "text", "Annie Besant (1922 ed.)",
                    f"https://en.wikisource.org/wiki/Bhagavad-Gita_(Besant_4th)/Discourse_{i}") for i in range(1, 19)},
    "katha":      ("up_katha.txt", "text", "F. Max Müller (1884)",
                   "https://en.wikisource.org/wiki/Sacred_Books_of_the_East/Volume_15/Katha-upanishad"),
    "mundaka":    ("up_mundaka.txt", "text", "F. Max Müller (1884)",
                   "https://en.wikisource.org/wiki/Sacred_Books_of_the_East/Volume_15/Mundaka-upanishad"),
    "isa":        ("up_isa.txt", "text", "F. Max Müller (1879)",
                   "https://en.wikisource.org/wiki/Sacred_Books_of_the_East/Volume_1/V%C3%A2gasaneyi-samhit%C3%A2-upanishad"),
    "chandogya6": ("up_chand_Sixth.txt", "text", "F. Max Müller (1879)",
                   "https://en.wikisource.org/wiki/Sacred_Books_of_the_East/Volume_1/Kh%C3%A2ndogya-upanishad/Sixth_Prap%C3%A2thaka"),
    "chandogya7": ("up_chand_Seventh.txt", "text", "F. Max Müller (1879)",
                   "https://en.wikisource.org/wiki/Sacred_Books_of_the_East/Volume_1/Kh%C3%A2ndogya-upanishad/Seventh_Prap%C3%A2thaka"),
}


KJV_BOOKS = {
    "Matthew": "The Gospel According to Saint Matthew",
    "Mark": "The Gospel According to Saint Mark",
    "Luke": "The Gospel According to Saint Luke",
    "John": "The Gospel According to Saint John",
    "Acts": "The Acts of the Apostles",
    "Romans": "The Epistle of Paul the Apostle to the Romans",
    "1 Corinthians": "The First Epistle of Paul the Apostle to the Corinthians",
    "2 Corinthians": "The Second Epistle of Paul the Apostle to the Corinthians",
    "Galatians": "The Epistle of Paul the Apostle to the Galatians",
    "Ephesians": "The Epistle of Paul the Apostle to the Ephesians",
    "Philippians": "The Epistle of Paul the Apostle to the Philippians",
    "Colossians": "The Epistle of Paul the Apostle to the Colossians",
    "1 Thessalonians": "The First Epistle of Paul the Apostle to the Thessalonians",
    "2 Thessalonians": "The Second Epistle of Paul the Apostle to the Thessalonians",
    "1 Timothy": "The First Epistle of Paul the Apostle to Timothy",
    "2 Timothy": "The Second Epistle of Paul the Apostle to Timothy",
    "Titus": "The Epistle of Paul the Apostle to Titus",
    "Philemon": "The Epistle of Paul the Apostle to Philemon",
    "Hebrews": "The Epistle of Paul the Apostle to the Hebrews",
    "James": "The General Epistle of James",
    "1 Peter": "The First Epistle General of Peter",
    "2 Peter": "The Second General Epistle of Peter",
    "1 John": "The First Epistle General of John",
    "Jude": "The General Epistle of Jude",
    "Revelation": "The Revelation of Saint John the Divine",
}


DIALOGUE_START = {
    "pg1656.txt": "How you, O Athenians",
    "pg59709.txt": "CHAPTER I.",   # Giles: skip his introduction, which quotes passages
    **{f: "PERSONS OF THE DIALOGUE" for f in
       ["pg1657.txt", "pg1658.txt", "pg1497.txt", "pg1600.txt", "pg1636.txt",
        "pg1672.txt", "pg1726.txt", "pg1643.txt", "pg1750.txt"]},
}


VERSE = {"pg785.txt"}  # Lucretius: keep the poem's line breaks


SOURCE_END = {"pg8438.txt": "NOTES"}


def normalize(s, verse=False):
    s = unicodedata.normalize("NFC", s)
    if verse:  # single newlines are verse lines; mark them so they survive whitespace folding
        s = re.sub(r"(?<!\n)\n(?!\n)", "\u2028", s.replace("\r", ""))
    s = s.replace("\r", "").replace("\u200b", "")
    s = re.sub(r"[^\S\u2028]+", " ", s)
    return s


def clean(s, key):
    """Tidy an extracted passage without changing its wording."""
    s = re.sub(r"\[\d+\]|\[[A-Z]\]|\{[^{}]*\}", "", s)     # footnote, page and paragraph markers
    s = re.sub(r"\s*\(\[Greek:[^\]]*\]\)", "", s)        # inline Greek glosses
    s = re.sub(r"\b\d+:\d+ ", "", s)                    # KJV verse numbers
    s = re.sub(r"\(\d+\)", "", s)                       # Besant verse numbers
    s = re.sub(r"(?<!\w)\d{1,3}\. (?=['‘\"“]?[A-Z])", "", s)  # section numbers
    s = s.replace("[", "").replace("]", "")             # Long's editorial brackets
    s = s.replace("_", "")                              # Gutenberg italics
    if key == "epicurus":
        s = re.sub(r"\s\d{2,3}\.\s(?=[a-z])", " ", s)   # Diogenes Laertius section numbers
    if key in ("hadith", "kenko"):
        s = re.sub(r"(\w)- (\w)", r"\1\2", s)           # OCR line-break hyphens
    s = s.replace("--", "—").replace("`", "‘")
    s = re.sub(r"\b([Tt]o)- (morrow|day|night)", r"\1-\2", s)
    s = re.sub(r"[^\S\u2028]+([,;:.!?])", r"\1", s)
    s = re.sub(r"([.!?])(\s*\.)+$", r"\1", s)
    s = re.sub(r"([?!])\.", r"\1", s)
    s = re.sub(r"[^\S\u2028]+", " ", s).strip()
    s = re.sub(r" ?\u2028 ?", "\n", s).strip()
    s = s.strip(" “”\"'‘’")
    s = re.sub(r"[;:,]?-+$", ".", s)
    if s.count("“") > s.count("”"):
        s += "”"
    if s.count('"') % 2:
        s += '"'
    if s[-1:] in (";", ":"):
        s = s[:-1] + "."
    s = s.strip(",—")
    if s and s[0].islower():
        s = s[0].upper() + s[1:]
    if s and s.rstrip("”\"’")[-1:] not in tuple(".!?…"):
        s += "…"
    return s


_cache = {}
def load(key, srcdir):
    if key in _cache:
        return _cache[key]
    fname, kind, *_ = SOURCES[key]
    raw = open(os.path.join(srcdir, fname), encoding="utf-8").read()
    if kind == "text":
        if fname in DIALOGUE_START:
            raw = raw[raw.rfind(DIALOGUE_START[fname]):]
        if fname in SOURCE_END:  # stop before an editor's endnotes
            raw = raw[:raw.rfind(SOURCE_END[fname])]
        data = normalize(raw, verse=fname in VERSE)
    elif kind == "refs":
        data = {}
        for line in raw.splitlines():
            ref, _, txt = line.partition("\t")
            data[ref.split(" ", 1)[1]] = txt.strip()
    elif kind == "quran":
        data = {}
        for line in raw.splitlines():
            parts = line.split("|", 2)
            if len(parts) == 3 and parts[0].isdigit():
                data[f"{parts[0]}:{parts[1]}"] = parts[2].strip()
    elif kind == "numbered":
        data = {}
        for para in re.split(r"\n\s*\n", raw):
            m = re.match(r"\s*(\d+)\.\s+(.*)", para, re.S)
            if m:
                data[m.group(1)] = normalize(m.group(2)).strip()
    elif kind == "bible":
        data = {}
        for book, header in KJV_BOOKS.items():
            i = raw.rfind("\n" + header + "\n")
            if i < 0:
                continue
            seg = raw[i + len(header) + 2:]
            nxt = min([j for j in (seg.find("\n" + h + "\n") for h in KJV_BOOKS.values()) if j > 0] or [len(seg)])
            seg = normalize(seg[:nxt])
            for m in re.finditer(r"(\d+):(\d+) (.*?)(?= \d+:\d+ |$)", seg):
                data[f"{book} {m.group(1)}:{m.group(2)}"] = m.group(3).strip()
    _cache[key] = data
    return data


def by_ref(data, ref):
    if " " in ref:  # "Matthew 7:15-16"
        book, _, cv = ref.rpartition(" ")
        ch, verses = cv.split(":")
        a, _, b = verses.partition("-")
        return " ".join(data[f"{book} {ch}:{v}"] for v in range(int(a), int(b or a) + 1))
    if ":" not in ref:
        a, _, b = ref.partition("-")
        return " ".join(data[str(v)] for v in range(int(a), int(b or a) + 1))
    ch, verses = ref.split(":")
    a, _, b = verses.partition("-")
    return " ".join(data[f"{ch}:{v}"] for v in range(int(a), int(b or a) + 1))


def find_span(text, start, end, near=None, final=True):
    eq = {"'": "['’‘]", "’": "['’‘]", '"': '["“”]', "“": '["“”]', "”": '["“”]', "-": "[-—–]+"}
    flex = lambda p: r"\s*".join(eq.get(c, re.escape(c)) for c in normalize(p).replace(" ", ""))
    lo = 0
    if near:
        m = re.search(flex(near), text)
        if not m:
            raise LookupError(f"anchor not found: {near!r}")
        lo = m.start()
    m1 = re.compile(flex(start)).search(text, lo)
    if not m1:
        raise LookupError(f"start not found: {start!r}")
    if end is None:
        return text[m1.start():m1.end()]
    m2 = re.compile(flex(end)).search(text, m1.start())
    if not m2:
        raise LookupError(f"end not found after start: {end!r}")
    span = text[m1.start():m2.end()]
    # A quote that stops at a clause boundary (or before a closing quote or
    # footnote) is complete; one that stops mid-clause gets an ellipsis later.
    after = text[m2.end():m2.end() + 3].lstrip()
    if final and span[-1:].isalnum() and after[:1] in (";", ":", ",", '"', "”", "’", "(", ".", "—"):
        span += "."
    if len(span) > 900:
        raise LookupError(f"span suspiciously long ({len(span)} chars): {start!r}")
    return span


def extract(e, srcdir):
    data = load(e["from"], srcdir)
    if "ref" in e:
        data = normalize(by_ref(data, e["ref"]))
        if "start" not in e and "parts" not in e:
            return data
    parts = e.get("parts") or [[e["start"], e.get("end")]]
    return e.get("join", " … ").join(
        find_span(data, p[0], p[1], e.get("near"), final=(i == len(parts) - 1)) for i, p in enumerate(parts))


# Verse-level reading links, used when a scripture verse is shortened.
SCRIPTURE_URL = {
    "kjv": lambda ref: "https://www.biblegateway.com/passage/?search="
                       + urllib.parse.quote(ref.replace("-", "–")) + "&version=KJV",
    "quran": lambda ref: "https://quran.com/" + ref.replace(":", "/"),
    "proverbs": lambda ref: "https://www.sefaria.org/Proverbs." + ref.replace(":", "."),
    "eccl": lambda ref: "https://www.sefaria.org/Ecclesiastes." + ref.replace(":", "."),
}


def verse_cuts(e, srcdir):
    """For a scripture quote taken from part of a verse: (cut at start, cut at end)."""
    if "ref" not in e or e["from"] not in SCRIPTURE_URL or ("start" not in e and "parts" not in e):
        return False, False
    full = normalize(by_ref(load(e["from"], srcdir), e["ref"])).strip()
    parts = e.get("parts") or [[e["start"], e.get("end")]]
    first = find_span(full, parts[0][0], parts[0][1], final=False)
    last = find_span(full, parts[-1][0], parts[-1][1], final=False)
    before = full[:full.index(first)].strip(" “\"‘'")
    after = full[full.index(last) + len(last):].strip(" .,;:!?\"”’'-—")
    return bool(before), bool(after)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def main(srcdir, freeze=False):
    specdir = os.path.join(HERE, "spec")
    by_trad, errors, replaces = {t: [] for t in ORDER}, [], {}
    for fname in sorted(os.listdir(specdir)):
        if not fname.endswith(".json"):
            continue
        for e in json.load(open(os.path.join(specdir, fname), encoding="utf-8")):
            try:
                text = extract(e, srcdir)
                for bad, good in e.get("fix", {}).items():  # documented OCR corrections
                    if bad not in text:
                        raise LookupError(f"fix target not found: {bad!r}")
                    text = text.replace(bad, good)
                text = clean(text, e["from"])
                if re.search(r"[\u0900-\u097f<>{}]|\[\d", text):
                    raise LookupError(f"markup or untranslated text in passage: {text[:80]!r}")
                text = e.get("prefix", "") + text + e.get("suffix", "")
                # Re-balance quote marks now that any opening quote has been added.
                if text.count('"') % 2:
                    text = text[:-1] if text.endswith('"') and not e.get("suffix") else text + '"'
                if text.count("“") > text.count("”"):
                    text += "”"
                elif text.count("”") > text.count("“") and text.endswith("”") and not e.get("suffix"):
                    text = text[:-1]
                cut_start, cut_end = verse_cuts(e, srcdir)
                if cut_start:  # show where the verse was entered mid-way, keeping its own case
                    first_raw = extract(e, srcdir).lstrip(" “\"‘'")[:1]
                    text = "…" + (text[0].lower() if first_raw.islower() else text[0]) + text[1:]
                if cut_end and text[-1:] not in "?!":  # after ? or ! the link alone shows the cut
                    text = re.sub(r"[.,;:…]+$", "", text).rstrip() + "…"
            except (LookupError, KeyError) as err:
                errors.append(f"{fname}: {e['source']}: {err}")
                continue
            _, _, translation, url = SOURCES[e["from"]]
            entry = {
                # Stable id from the passage text itself, so correcting a citation
                # never detaches notes from their passage.
                "id": slug(e["tradition"]) + "-" + hashlib.sha1(text.encode("utf-8")).hexdigest()[:10],
                "tradition": e["tradition"],
                "text": text,
                "source": e["source"],
                "context": e["context"],
                "prompt": e["prompt"],
                "translation": e.get("translation", translation),
                "source_url": url,
            }
            if cut_start or cut_end:
                entry["shortened"] = True
                entry["full_url"] = SCRIPTURE_URL[e["from"]](e["ref"])
            by_trad[e["tradition"]].append(entry)
            if "replaces" in e:
                replaces[e["replaces"]] = entry
    if errors:
        print("\n".join(errors))
        sys.exit(f"{len(errors)} passage(s) could not be verified")

    seen = {}
    for x in (x for t in by_trad.values() for x in t):
        seen[x["id"]] = seen.get(x["id"], 0) + 1
        if seen[x["id"]] > 1:
            x["id"] += f"-{seen[x['id']]}"

    texts = [x["text"] for t in by_trad.values() for x in t]
    dupes = {t[:60] for t in texts if texts.count(t) > 1}
    if dupes:
        sys.exit(f"duplicate passages: {sorted(dupes)}")

    # Released passages keep their slots; replacements take over their predecessor's.
    by_id = {x["id"]: x for t in by_trad.values() for x in t}
    released = json.load(open(RELEASED, encoding="utf-8")) if os.path.exists(RELEASED) else []
    out, placed, missing = [], set(), []
    for rid in released:
        x = by_id.get(rid) or replaces.get(rid)
        if x is None or x["id"] in placed:
            missing.append(rid)
            continue
        out.append(x)
        placed.add(x["id"])
    if missing:
        sys.exit("released passages missing from the specs (add a spec entry with "
                 f"\"replaces\": \"<id>\" to swap one): {missing}")

    # Everything new goes after the released ones. Schools are spread in proportion to
    # their size (some have fewer passages), never the same school two days running.
    fresh = {t: [x for x in by_trad[t] if x["id"] not in placed] for t in ORDER}
    total = {t: len(v) for t, v in fresh.items()}
    last = out[-1]["tradition"] if out else None
    while any(fresh.values()):
        def lag(t):  # how far behind its fair share this school is
            done = total[t] - len(fresh[t])
            return (done + 1) / total[t]
        options = [t for t in ORDER if fresh[t] and t != last] or [t for t in ORDER if fresh[t]]
        t = min(options, key=lambda t: (lag(t), ORDER.index(t)))
        out.append(fresh[t].pop(0))
        last = t

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if freeze:
        json.dump([x["id"] for x in out], open(RELEASED, "w", encoding="utf-8"), indent=1)
        print(f"froze {len(out)} released passages -> {RELEASED}")
    elif len(out) > len(released):
        print(f"{len(out) - len(released)} new passage(s) after the released ones")
    counts = {t: sum(1 for x in out if x["tradition"] == t) for t in ORDER}
    print(f"{len(out)} entries -> {OUT}\n{counts}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--freeze"]
    main(args[0] if args else os.path.join(HERE, "sources"), freeze="--freeze" in sys.argv)
