"""The Thinking Place logo, drawn from brand/logo/logo-light.svg, in any colours and size.

Twelve rays (one per path; the first, in teal, is today's) around a crescent moon.
Everything that draws the logo (icons, splash, launch screen, website) uses mark() so the
shapes and colours stay identical everywhere. Colours live in brand/colors.json.
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = open(os.path.join(ROOT, "brand", "logo", "logo-light.svg"), encoding="utf-8").read()
COLORS = json.load(open(os.path.join(ROOT, "brand", "colors.json"), encoding="utf-8"))

_paths = re.findall(r'<path d="([^"]+)" fill="([^"]+)"', SRC)
# [0] the rounded square, [1] the mask box, [2] the teal ray, [3..13] the other rays,
# [14] the big disc, [15] the cut that shapes the crescent, [16] the inner disc.
SQUARE = _paths[0][0]
RAYS = [p for p, _ in _paths[2:14]]
DISC, CUT, INNER = (p for p, _ in _paths[14:17])

# The artwork sits between 33 and 332 in the 365-unit box.
ART = (33.0, 33.0, 299.0)


def mark(fg, accent, scale=1.0, bg=None, shape=None, size=365):
    """SVG of the mark. bg/shape: None (transparent), "square", "rounded" or "circle"."""
    x, y, w = ART
    s = scale * 365 / w
    off = 182.5 - 182.5 * s
    back = ""
    if bg and shape == "rounded":
        back = f'<path d="{SQUARE}" fill="{bg}"/>'
    elif bg and shape == "circle":
        back = f'<circle cx="182.5" cy="182.5" r="182.5" fill="{bg}"/>'
    elif bg:
        back = f'<rect width="365" height="365" fill="{bg}"/>'
    rays = f'<path d="{RAYS[0]}" fill="{accent}"/>' + "".join(f'<path d="{d}" fill="{fg}"/>' for d in RAYS[1:])
    moon = (f'<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="365" height="365">'
            f'<rect width="365" height="365" fill="white"/><path d="{CUT}" fill="black"/></mask>'
            f'<path d="{DISC}" fill="{fg}" mask="url(#cut)"/><path d="{INNER}" fill="{fg}"/>')
    # Scale around the centre so the art fills `scale` of the canvas.
    tf = f'translate({off:.3f} {off:.3f}) scale({s:.4f}) translate(0 0)'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 365 365">'
            f'{back}<g transform="{tf}">{rays}{moon}</g></svg>')


def css_mark():
    """The mark for inline HTML, coloured by the page's CSS variables."""
    return (mark("var(--fg)", "var(--logo-accent)", 1.0).replace(' width="365" height="365"', "", 1)
            .replace("<svg ", '<svg class="logo-mark" aria-hidden="true" ', 1))
