"""Download the public-domain source texts that build_entries.py quotes from.

    python3 reflect/tools/fetch_sources.py <sources-dir>

Everything is fetched from Project Gutenberg, Wikisource, Sefaria, Tanzil and
archive.org. Wikisource rate-limits bursts, so re-run if a page comes back empty.
"""
import html, json, os, re, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "Reflect-factcheck/1.0"}
GUTENBERG = [10, 15877, 10661, 64576, 2017, 785, 1998, 4363, 52881, 38145,
             28054, 600, 18269, 8547, 1656, 1657, 1658, 1497, 1600, 1636, 1672, 1726, 1643, 1750]
WIKISOURCE = {
    **{f"gita_{i}": f"Bhagavad-Gita (Besant 4th)/Discourse {i}" for i in range(1, 19)},
    "up_katha": "Sacred Books of the East/Volume 15/Katha-upanishad",
    "up_mundaka": "Sacred Books of the East/Volume 15/Mundaka-upanishad",
    "up_isa": "Sacred Books of the East/Volume 1/Vâgasaneyi-samhitâ-upanishad",
    "up_chand_Sixth": "Sacred Books of the East/Volume 1/Khândogya-upanishad/Sixth Prapâthaka",
    "up_chand_Seventh": "Sacred Books of the East/Volume 1/Khândogya-upanishad/Seventh Prapâthaka",
    "dl10": "Lives of the Eminent Philosophers/Book X",
}
JPS = "The Holy Scriptures: A New Translation (JPS 1917)"


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

    for name, book, chapters in [("proverbs", "Proverbs", 31), ("eccl", "Ecclesiastes", 12)]:
        q = urllib.parse.urlencode({"version": f"english|{JPS}"})
        data = json.loads(get(f"https://www.sefaria.org/api/v3/texts/{book}.1-{chapters}?{q}"))
        lines = [f"{book} {c}:{v}\t{re.sub(r'<[^>]+>', '', t)}"
                 for c, ch in enumerate(data["versions"][0]["text"], 1)
                 for v, t in enumerate(ch, 1)]
        w(f"{name}.tsv", "\n".join(lines) + "\n")

    w("quran_yusufali.txt", get("https://tanzil.net/trans/?transID=en.yusufali&type=txt-2"))
    w("suhrawardy.txt", get("https://archive.org/download/the-sayings-of-muhammad_202401/"
                            "The%20Sayings%20of%20%27Muhammad_djvu.txt"))
    print(f"sources written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources"))
