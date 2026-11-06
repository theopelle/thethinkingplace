"""Draw the store screenshots from the real app: a caption above the app in a phone frame,
for the App Store (1320 x 2868) and Google Play (1080 x 1920). No platform names anywhere.

    python3 server.py &                          # the local server, port 8770
    python3 tools/make_store_screens.py           # every shot, both stores
    python3 tools/make_store_screens.py appstore 1 7   # only some (store, then shot numbers)

Renders tools/store-screens.html with headless Chrome, so Google Chrome must be installed.
Output: exports/app-store/screenshots/ and exports/store-listing/new/ (the Play set waits
there until it replaces the current one).
"""
import os, subprocess, sys
from urllib.parse import urlencode

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SERVER = "http://localhost:8770/tools/store-screens.html?"

NOTE = ("I keep saying I'll call my brother when things calm down. They never calm down. "
        "Maybe that's the point: the joy I'm postponing is today's.")

# Caption, the day shown, then what to open or tap (see store-screens.html).
SHOTS = [
    ("One thought a day, from 2,500 years of philosophy", dict(today="2026-11-14", hour=8)),
    ("Explained in plain words", dict(today="2026-11-14", hour=8, do="about,scroll330")),
    ("A private journal, kept on your phone", dict(today="2026-11-08", hour=9, note=NOTE, do="write,type,scroll400")),
    ("A few calm minutes to sit with the question", dict(today="2026-11-27", hour=7, do="sit")),
    ("The Library: thinkers, eras, and maps", dict(today="2026-11-20", hash="#/library/europe")),
    ("One big question a month, many answers", dict(today="2026-11-30", hash="#/question/2026-11")),
    ("Light or dark, morning or night", dict(today="2026-12-10", hour=9, do="split")),
]

STORES = {
    # canvas (CSS px, drawn at 3x), frame width, phone screen height, caption top and size, frame top
    "appstore": dict(w=440, h=956, fw=330, ph=852, ct=74, cs=31, ft=210,
                     out=os.path.join(ROOT, "exports", "app-store", "screenshots")),
    "play": dict(w=360, h=640, fw=262, ph=720, ct=40, cs=24, ft=146,
                 out=os.path.join(ROOT, "exports", "store-listing", "new")),
}


def shoot(store, n):
    st, (caption, opts) = STORES[store], SHOTS[n - 1]
    os.makedirs(st["out"], exist_ok=True)
    params = {k: st[k] for k in ("w", "h", "fw", "ph", "ct", "cs", "ft")}
    params.update(opts, caption=caption)
    out = os.path.join(st["out"], f"{store}-{n}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=3", "--blink-settings=preferredColorScheme=1", f"--window-size={st['w']},{st['h']}",
                    "--virtual-time-budget=15000", f"--screenshot={out}",
                    SERVER + urlencode(params)], check=True, capture_output=True)
    print(out)


if __name__ == "__main__":
    stores = [sys.argv[1]] if len(sys.argv) > 1 else list(STORES)
    picks = [int(x) for x in sys.argv[2:]] or range(1, len(SHOTS) + 1)
    for store in stores:
        for n in picks:
            shoot(store, n)
