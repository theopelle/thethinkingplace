"""Download every source text linked from content/thoughts.xlsx, so build_content.py
can check each quote against it.

    python3 tools/fetch_content.py <sources-dir>

Gutenberg links are fetched as plain text, archive.org links as their full text,
everything else as HTML turned into text (PDFs need the pypdf package). Files are named
after the link, so re-running only fetches what is missing.
"""
import hashlib, html, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content_io import read_thoughts, source_url, EXTRA_SOURCES

UA = {"User-Agent": "Mozilla/5.0 (Macintosh) ThinkingPlace-factcheck/1.0"}

# archive.org items whose full text is not named after the item.
ARCHIVE_FILES = {
    "in.ernet.dli.2015.183333": "2015.183333.Aristotle-The-Nicomachean-Ethics_djvu.txt",  # Rackham
}


def local_name(url):
    return hashlib.sha1(url.encode()).hexdigest()[:12] + ".txt"


def fetch_url(url):
    """The URL actually downloaded for a source link."""
    m = re.search(r"gutenberg\.org/(?:cache/epub|files|ebooks)/(\d+)", url)
    if m:
        n = m.group(1)
        return f"https://www.gutenberg.org/cache/epub/{n}/pg{n}.txt"
    m = re.search(r"archive\.org/details/([^/?#]+)", url)
    if m:
        item = m.group(1)
        return f"https://archive.org/download/{item}/{ARCHIVE_FILES.get(item, item + '_djvu.txt')}"
    m = re.search(r"en\.wikisource\.org/wiki/(.+)", url)
    if m:
        return f"https://en.wikisource.org/w/index.php?title={m.group(1)}&action=render"
    m = re.search(r"fr\.wikisource\.org/wiki/(.+)", url)
    if m:
        return f"https://fr.wikisource.org/w/index.php?title={m.group(1)}&action=render"
    return url


def get(url, tries=4):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return r.read(), r.headers.get_content_type()
        except Exception:  # noqa: BLE001 - mirrors drop connections under load; back off
            if attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def html_to_text(s):
    s = re.sub(r"(?s)<(script|style|nav|header|footer)[^>]*>.*?</\1>", "", s)
    s = re.sub(r'(?s)<sup[^>]*class="reference".*?</sup>', "", s)
    s = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>|</tr>|</blockquote>", "\n", s)
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = re.sub(r"[ \t ]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n\n", s)


def crawl(index):
    """Every page linked from an index page, in order, as one text."""
    base = index.rsplit("/", 1)[0] + "/"
    page = get(index)[0].decode("utf-8", "replace")
    links = []
    for href in re.findall(r'href="?([^"\s>#:]+\.htm)', page, re.I):
        if "/" not in href and href != "index.htm" and href not in links:
            links.append(href)
    texts = []
    for href in links:
        time.sleep(1)
        try:
            texts.append(html_to_text(get(base + href, tries=2)[0].decode("utf-8", "replace")))
        except Exception as e:  # noqa: BLE001 - a few mirror pages are broken; quotes there fail the check
            print(f"  skipped {base + href}: {e}")
    return "\n\n".join(texts)


def fetch(url, out):
    path = os.path.join(out, local_name(url))
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return url, "cached"
    if url.startswith("crawl:"):
        try:
            open(path, "w", encoding="utf-8").write(crawl(url[6:]))
            return url, "ok"
        except Exception as e:  # noqa: BLE001
            return url, f"FAILED {e}"
    real = fetch_url(url)
    for attempt in range(3):
        try:
            data, ctype = get(real)
            break
        except Exception as e:  # noqa: BLE001 - report and retry
            err = e
            time.sleep(3 * (attempt + 1))
    else:
        return url, f"FAILED {err}"
    if ctype == "application/pdf" or real.lower().endswith(".pdf"):
        import io
        from pypdf import PdfReader
        pages = PdfReader(io.BytesIO(data)).pages
        open(path, "w", encoding="utf-8").write("\n".join(p.extract_text() or "" for p in pages))
    else:
        text = data.decode("utf-8", "replace")
        if "html" in ctype or text.lstrip()[:1] == "<":
            text = html_to_text(text)
        open(path, "w", encoding="utf-8").write(text)
    return url, "ok"


def main(out):
    os.makedirs(out, exist_ok=True)
    urls = sorted({source_url(t) for t in read_thoughts() if source_url(t)} | set(EXTRA_SOURCES.values()))
    with ThreadPoolExecutor(6) as pool:
        for url, status in pool.map(lambda u: fetch(u, out), urls):
            if status != "cached":
                print(status, url)
    print(f"{len(urls)} sources in {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources"))
