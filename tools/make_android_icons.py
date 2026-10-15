"""Draw the Android launcher icons and splash icons from icon.svg.

    python3 reflect/tools/make_android_icons.py

Renders with headless Chrome, so Google Chrome must be installed. Writes into
android/app/src/main/res: legacy, round and adaptive launcher icons, plus the
splash icon in a light and a dark version (the dark one swaps to the night colours,
like the launch screen inside the app).
"""
import os, re, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

LIGHT = {"bg": "#f6f3ee", "fg": "#2b2a28", "water": "#2f4b4c"}
DARK = {"bg": "#1b1b1a", "fg": "#e6e1d8", "water": "#9fc0bd"}

icon = open(os.path.join(ROOT, "icon.svg"), encoding="utf-8").read()
BRICKS = re.search(r'<path d="(M40\.58[^"]+)"', icon).group(1)
MOON = re.search(r'<path d="(M57\.36[^"]+)"', icon).group(1)
# The well spans roughly x/y 13–87 in icon.svg's 100-unit box.


def art(c, scale, bg=True, circle=False):
    """The well, centred and scaled within a 100x100 canvas."""
    off = 50 - 50 * scale
    back = ""
    if bg:
        back = (f'<circle cx="50" cy="50" r="50" fill="{c["bg"]}"/>' if circle
                else f'<rect width="100" height="100" fill="{c["bg"]}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{back}'
            f'<g transform="translate({off} {off}) scale({scale})">'
            f'<path d="{BRICKS}" fill="{c["fg"]}" stroke="{c["fg"]}" stroke-width="1.2" stroke-linejoin="round"/>'
            f'<circle cx="50" cy="50" r="23" fill="{c["water"]}"/>'
            f'<path d="{MOON}" fill="{c["bg"]}" opacity=".92"/></g></svg>')


def render(svg, size, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, "i.html")
        open(page, "w").write(f'<html><body style="margin:0;background:transparent">'
                              f'<div style="width:{size}px;height:{size}px">{svg.replace("<svg ", f"<svg width={size} height={size} ")}</div></body></html>')
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--default-background-color=00000000", f"--window-size={size},{size}",
                        f"--screenshot={out}", "file://" + page],
                       check=True, capture_output=True)


DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

for name, k in DENSITIES.items():
    d = os.path.join(RES, f"mipmap-{name}")
    render(art(LIGHT, .8), round(48 * k), os.path.join(d, "ic_launcher.png"))
    render(art(LIGHT, .72, circle=True), round(48 * k), os.path.join(d, "ic_launcher_round.png"))
    # Adaptive foreground: 108dp canvas, art kept inside the 66dp safe zone.
    render(art(LIGHT, .6, bg=False), round(108 * k), os.path.join(d, "ic_launcher_foreground.png"))

# Status-bar icon for the reminder: Android shows it as a white silhouette, so the well is
# drawn in white with the moon cut out.
def silhouette(scale):
    off = 50 - 50 * scale
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><mask id="m">'
            f'<rect width="100" height="100" fill="white"/><path d="{MOON}" fill="black"/></mask></defs>'
            f'<g transform="translate({off} {off}) scale({scale})" mask="url(#m)">'
            f'<path d="{BRICKS}" fill="white" stroke="white" stroke-width="1.2" stroke-linejoin="round"/>'
            f'<circle cx="50" cy="50" r="23" fill="white"/></g></svg>')

for name, k in DENSITIES.items():
    render(silhouette(1.2), round(24 * k), os.path.join(RES, f"drawable-{name}", "ic_stat_well.png"))

# Splash icon (Android 12+): shown inside a 192dp circle on a 288dp canvas.
render(art(LIGHT, .5, bg=False), 1152, os.path.join(RES, "drawable-nodpi", "splash_icon.png"))
render(art(DARK, .5, bg=False), 1152, os.path.join(RES, "drawable-night-nodpi", "splash_icon.png"))
print("icons written to", RES)
