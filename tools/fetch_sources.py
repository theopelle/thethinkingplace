"""Download the public-domain source texts that build_entries.py quotes from.

    python3 reflect/tools/fetch_sources.py <sources-dir>

Everything is fetched from Project Gutenberg, Wikisource and archive.org. Wikisource rate-limits bursts, so re-run if a page comes back empty.
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "Reflect-factcheck/1.0"}
GUTENBERG = [15877, 10661, 64576, 2017, 785, 1998, 4363, 52881, 38145, 28054, 600, 18269,
             1656, 1657, 1658, 1497, 1600, 1636, 1672, 1726, 1643, 1750,
             216, 59709, 8438, 5682, 5683, 11224, 34901, 10378, 769, 3330]
WIKISOURCE = {
    "dl10": "Lives of the Eminent Philosophers/Book X",
    "aston_b4c3": "A History of Japanese Literature/Book 4/Chapter 3",
    # Swenson's 1920 essay, which quotes Kierkegaard in his own translations
    "swenson_kierkegaard": "Sören Kierkegaard",
}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read().decode("utf-8")


def html_to_text(s):
    s = re.sub(r"(?s)<(script|style)[^>]*>.*?</\1>", "", s)
    s = re.sub(r'(?s)<sup[^>]*class="reference".*?</sup>', "", s)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = re.sub(r"[ \t ]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n\n", s)


def main(out):
    os.makedirs(out, exist_ok=True)
    w = lambda name, text: open(os.path.join(out, name), "w", encoding="utf-8").write(text)

    for n in GUTENBERG:
        w(f"pg{n}.txt", get(f"https://www.gutenberg.org/cache/epub/{n}/pg{n}.txt"))

    for name, title in WIKISOURCE.items():
        q = urllib.parse.urlencode({"title": title, "action": "render"})
        w(f"{name}.txt", html_to_text(get(f"https://en.wikisource.org/w/index.php?{q}")))
        time.sleep(1)

    # Rackham's Nicomachean Ethics (Loeb, 1926) from the Perseus Digital Library's TEI file.
    tei = get("https://raw.githubusercontent.com/PerseusDL/canonical-greekLit/master/data/"
              "tlg0086/tlg010/tlg0086.tlg010.perseus-eng2.xml")
    tei = re.sub(r"(?s)<note\b.*?</note>", "", tei[tei.find("<body"):])
    tei = re.sub(r"</p>", "\n\n", tei)
    w("rackham_ne.txt", re.sub(r"[ \t]+", " ", html.unescape(re.sub(r"<[^>]+>", "", tei))))

    w("porter_kenko.txt", get("https://archive.org/download/miscellanyofjapa00yosh/"
                               "miscellanyofjapa00yosh_djvu.txt"))
    print(f"sources written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources"))
