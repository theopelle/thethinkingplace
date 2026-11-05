"""Draw the iPhone app's icon and launch-screen mark from the logo (tools/logo.py), into
ios/App/App/Assets.xcassets.

    python3 tools/make_ios_icons.py

Renders with headless Chrome, so Google Chrome must be installed. The App Store refuses an
icon with transparency, so the icon is flattened through sips (built into macOS).
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from logo import mark, COLORS, ART

ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "ios", "App", "App", "Assets.xcassets")
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


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def hex_rgb(h):
    return {k: f"0x{h[i:i + 2]}" for k, i in (("red", 1), ("green", 3), ("blue", 5))}


INFO = {"author": "xcode", "version": 1}
DARK = [{"appearance": "luminosity", "value": "dark"}]

# App icon: one 1024px square, full bleed (iOS rounds the corners), drawn like the web app's
# home-screen icon (icon-180.png). Flattened: JPEG has no alpha, then back to PNG.
icons = os.path.join(ASSETS, "AppIcon.appiconset")
for f in os.listdir(icons):
    if f.endswith(".png"):
        os.remove(os.path.join(icons, f))
with tempfile.TemporaryDirectory() as tmp:
    png, jpg = os.path.join(tmp, "icon.png"), os.path.join(tmp, "icon.jpg")
    render(mark(L["ink"], L["teal"], .74, L["paper"]), 1024, png)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "100", png, "--out", jpg], check=True, capture_output=True)
    subprocess.run(["sips", "-s", "format", "png", jpg, "--out", os.path.join(icons, "AppIcon-1024.png")], check=True, capture_output=True)
write_json(os.path.join(icons, "Contents.json"), {
    "images": [{"filename": "AppIcon-1024.png", "idiom": "universal", "platform": "ios", "size": "1024x1024"}],
    "info": INFO})

# Launch screen: the mark in a 288pt box, centred, exactly as the app's own launch screen
# draws it (.launch-mark in style.css), so the hand-over to the app is invisible.
splash = os.path.join(ASSETS, "Splash.imageset")
for f in os.listdir(splash):
    if f.endswith(".png"):
        os.remove(os.path.join(splash, f))
scale = .6104 * ART[2] / 365
images = []
for theme, c in (("light", L), ("dark", D)):
    for k in (1, 2, 3):
        name = f"launch-{theme}@{k}x.png"
        render(mark(c["ink"], c["teal"], scale), 288 * k, os.path.join(splash, name))
        image = {"filename": name, "idiom": "universal", "scale": f"{k}x"}
        if theme == "dark":
            image["appearances"] = DARK
        images.append(image)
write_json(os.path.join(splash, "Contents.json"), {"images": images, "info": INFO})

# The launch screen's background: paper, light or dark like the phone.
write_json(os.path.join(ASSETS, "LaunchBackground.colorset", "Contents.json"), {
    "colors": [
        {"color": {"color-space": "srgb", "components": dict(hex_rgb(L["paper"]), alpha="1.000")}, "idiom": "universal"},
        {"appearances": DARK, "color": {"color-space": "srgb", "components": dict(hex_rgb(D["paper"]), alpha="1.000")}, "idiom": "universal"},
    ],
    "info": INFO})
print("iPhone icon and launch screen written to", os.path.relpath(ASSETS, ROOT))
