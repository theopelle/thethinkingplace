"""Check every quote in content/thoughts.xlsx word for word against its source text.

    python3 tools/check_quotes.py <sources-dir>

A quote passes when each of its pieces (split at "…") appears in the source, after
folding typography (curly quotes, dashes, spacing, Gutenberg italics) and, for
passages credited "lightly modernised", after applying build_entries.modernise to
the source. Quotes already verified by the old spec build (entries.json) pass as is.
Writes a report and exits non-zero if any quote fails.
"""
import json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from content_io import ROOT, read_thoughts, translation, source_url
from fetch_content import local_name
from build_entries import modernise

# Quotes whose source is not an English text we can match: our own translations from the
# French (checked by hand against the original, quoted in the sheet's "To check" column).
OWN_TRANSLATION = "Translated from the French by The Thinking Place team"

# Light modernisation beyond the general rules in build_entries.modernise, passage by
# passage: {thought id: {"words in the source": "words in our quote"}}. Applied to the
# source before matching, so every change is listed here and nowhere else.
MODERNISE = {int(k): v for k, v in json.load(open(os.path.join(ROOT, "content", "modernisations.json"),
                                                   encoding="utf-8")).items() if not k.startswith("_")}

# Checked sentence by sentence: lists assembled from an anthology's running text (Aston
# quotes Sei Shōnagon's lists with his own remarks in between), and verses whose numbers
# and footnote marks in the source sit on the sentence break (Isha Upanishad 6–7).
SENTENCES = {542, 544, 548, 549, 366}


def fold(s):
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("­", "").replace("_", "").replace("*", "")
    s = re.sub(r"\[(\d+|[a-z]|Footnote[^\]]*)\]", "", s)
    s = re.sub(r"[‘’`´ʼ“”„«»\"]", "'", s)
    s = re.sub(r"\s*(--|—|–)\s*", " — ", s)
    s = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", s)   # words broken over a line
    s = s.replace(" / ", " ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r" ([,;:.!?])", r"\1", s)
    return s


def strip_markers(s):
    """Source-only clean-up: page markers, footnote numbers and verse numbers."""
    s = re.sub(r"\s*\bp\. \d+\b", "", s)
    s = re.sub(r"(?<=[\s.;:!?'])\d{1,3}\. (?=\S)", "", s)
    s = re.sub(r"(?<=[A-Za-z,;:.!?')]) ?\d{1,3}(?=[\s,;:.!?)])", "", s)
    return re.sub(r" +", " ", s)


def loose(s):
    return re.sub(r"[^a-z0-9]+", " ", fold(s).lower()).strip()


def pieces(text, split=None):
    parts = re.split(r"\s*(?:…|\.\.\.)\s*", fold(text))
    if split:
        parts = [q for p in parts for q in re.split(split, p)]
    for p in parts:
        p = p.strip(" '—,;:.!?")
        if len(p) > 2:
            yield p


_src = {}
def source(url, srcdir, modern, extra=None):
    key = url
    if key not in _src:
        path = os.path.join(srcdir, local_name(url))
        if not os.path.exists(path):
            _src[key] = None
        else:
            raw = open(path, encoding="utf-8", errors="replace").read()
            _src[key] = strip_markers(fold(raw))
    s = _src[key]
    if s is None:
        return None
    for old, new in (extra or {}).items():  # documented, passage-specific modernisation
        if old not in s:
            raise LookupError(f"modernisation target not in source: {old!r}")
        s = s.replace(old, new)
    return modernise(s, {}, True) if modern else s


def find(piece, text):
    # Case is ignored: quotes start mid-sentence and some sources print words in small capitals.
    return piece.lower() in text.lower()


def check(t, srcdir, old_texts):
    if t["text"] in old_texts:
        return "ok-old", ""
    tr = translation(t)
    if tr.startswith(OWN_TRANSLATION):
        return "own", ""
    url = source_url(t)
    if not url:
        return "no-source", "no link and not in the verified 365"
    modern = "modernised" in tr
    extra = MODERNISE.get(t["id"])
    texts = [x for x in (source(url, srcdir, False, extra), modern and source(url, srcdir, True, extra)) if x]
    if not texts:
        return "missing-file", url
    split = r"(?<=[.:!?])\s+" if t["id"] in SENTENCES else None
    bad = [p for p in pieces(t["text"], split) if not any(find(p, x) for x in texts)]
    if not bad:
        return "ok", ""
    # Same words, different punctuation or spelling of quote marks?
    lsrc = [loose(x) for x in texts]
    words_bad = [p for p in bad if not any(loose(p) in x for x in lsrc)]
    if not words_bad:
        return "punct", " | ".join(bad)
    return "words", " | ".join(words_bad)


# Phrases in curly quotes in the long About that are glosses, not quotes from the source.
ABOUT_GLOSSES = {"without", "what good does it do", "know thyself", "the pathos of things"}


def check_about(t, srcdir):
    """Every “…” phrase in the long About must appear in the row's source (words only:
    case, punctuation and spacing are ignored). Single-quoted phrases are our own
    wording (e.g. 'This is mine', ROU14) and are not checked. Returns the phrases not
    found, or None when the row has no English source to check against."""
    phrases = [p for p in re.findall(r"“([^”]+)”", t.get("about") or "")
               if loose(p) not in ABOUT_GLOSSES]
    if not phrases:
        return []
    tr = translation(t)
    url = source_url(t)
    if tr.startswith(OWN_TRANSLATION) or not url:
        return None
    modern = "modernised" in tr
    extra = MODERNISE.get(t["id"])
    texts = [x for x in (source(url, srcdir, False, extra), modern and source(url, srcdir, True, extra)) if x]
    if not texts:
        return None
    lsrc = [loose(x) for x in texts]
    found = lambda piece: any(loose(piece) in x for x in lsrc)
    return [p for p in phrases if not all(found(q) for q in pieces(p))]


def main(srcdir):
    old = json.load(open(os.path.join(ROOT, "entries.json"), encoding="utf-8"))
    old_texts = {e["text"] for e in old}
    results = {}
    lines = []
    for t in read_thoughts():
        status, info = check(t, srcdir, old_texts)
        results.setdefault(status, []).append(t["id"])
        if status not in ("ok", "ok-old", "own"):
            lines.append(f"{t['id']:>3} {status:12} {t['source']} :: {info[:300]}")
        bad = check_about(t, srcdir)
        if bad:
            lines.append(f"{t['id']:>3} about        {t['source']} :: " + " | ".join(bad)[:300])
    print("\n".join(lines))
    print({k: len(v) for k, v in results.items()})
    json.dump(results, open(os.path.join(srcdir, "check_results.json"), "w"), indent=1)
    sys.exit(1 if lines else 0)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "sources"))
