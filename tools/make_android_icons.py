"""Draw every icon from the logo (tools/logo.py): Android launcher, splash and status-bar
icons, the web app icons, and the PNG logos in brand/logo/.

    python3 tools/make_android_icons.py

Renders with headless Chrome, so Google Chrome must be installed.
"""
import os, subprocess, tempfile, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from logo import mark, COLORS, SQUARE

ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
BRAND = os.path.join(ROOT, "brand", "logo")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
L, D = COLORS["light"], COLORS["dark"]


def render(svg, size, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    svg = svg.replace('width="365" height="365"', f'width="{size}" height="{size}"', 1)
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "i.html")
        open(page, "w").write(f'<html><body style="margin:0;background:transparent">{svg}</body></html>')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", f"--window-size={size},{size}",
                        f"--screenshot={out}", "file://" + page], check=True, capture_output=True)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)


light_icon = mark(L["ink"], L["teal"], .82, L["paper"], "rounded")
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
for name, k in DENSITIES.items():
    d = os.path.join(RES, f"mipmap-{name}")
    render(light_icon, round(48 * k), os.path.join(d, "ic_launcher.png"))
    render(mark(L["ink"], L["teal"], .7, L["paper"], "circle"), round(48 * k), os.path.join(d, "ic_launcher_round.png"))
    # Adaptive foreground: 108dp canvas, art inside the 66dp safe zone (paper comes from the background colour).
    render(mark(L["ink"], L["teal"], .56), round(108 * k), os.path.join(d, "ic_launcher_foreground.png"))
    # Status-bar icon for the reminder: Android shows it as a white silhouette.
    render(mark("#FFFFFF", "#FFFFFF", .92), round(24 * k), os.path.join(RES, f"drawable-{name}", "ic_stat_well.png"))
write(os.path.join(RES, "values", "ic_launcher_background.xml"),
      f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{L["paper"]}</color>\n</resources>\n')

# Splash icon (Android 12+): a 288dp canvas whose middle 192dp circle is visible. The in-app
# launch screen draws the mark at the same size and place, so the hand-over is invisible.
render(mark(L["ink"], L["teal"], .5), 1152, os.path.join(RES, "drawable-nodpi", "splash_icon.png"))
render(mark(D["ink"], D["teal"], .5), 1152, os.path.join(RES, "drawable-night-nodpi", "splash_icon.png"))

# Web app icons: the rounded logo for browsers, full-bleed squares where the system rounds it.
write(os.path.join(ROOT, "icon.svg"), mark(L["ink"], L["teal"], .82, L["paper"], "rounded"))
render(mark(L["ink"], L["teal"], .74, L["paper"]), 180, os.path.join(ROOT, "icon-180.png"))
render(light_icon, 192, os.path.join(ROOT, "icon-192.png"))
render(light_icon, 512, os.path.join(ROOT, "icon-512.png"))
render(mark(L["ink"], L["teal"], .62, L["paper"]), 512, os.path.join(ROOT, "icon-maskable-512.png"))

# Brand files: the designer's SVGs stay as they are; PNGs and transparent marks are generated.
write(os.path.join(BRAND, "mark-light.svg"), mark(L["ink"], L["teal"]))
write(os.path.join(BRAND, "mark-dark.svg"), mark(D["ink"], D["teal"]))
for size in (512, 1024):
    render(open(os.path.join(BRAND, "logo-light.svg")).read(),
           size, os.path.join(BRAND, f"logo-light-{size}.png"))
    render(open(os.path.join(BRAND, "logo-dark.svg")).read(), size, os.path.join(BRAND, f"logo-dark-{size}.png"))
    render(mark(L["ink"], L["teal"]), size, os.path.join(BRAND, f"mark-light-{size}.png"))
    render(mark(D["ink"], D["teal"]), size, os.path.join(BRAND, f"mark-dark-{size}.png"))
# Google Play listing icon: 512x512, full square (Play rounds it).
render(mark(L["ink"], L["teal"], .74, L["paper"]), 512, os.path.join(BRAND, "play-store-icon-512.png"))
print("icons written")
