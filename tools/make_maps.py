"""Draw the maps on the About page and write them into index.html.

    python3 tools/make_maps.py <ne_50m_land.geojson>

A world map shows where our thinkers lived; Europe, where most of them did, gets a
closer map of its own below it. The places and their card texts come from the
content team's glossary (content/glossary.xlsx, sheet "Map cards"); their positions
are in COORDS below. Dots too close to tell apart on a phone share one card.

Coastlines come from Natural Earth (public domain):
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson
The maps are bare outlines in inline SVG, so the app needs no network to show them.
"""
import html, json, math, os, re, sys, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from content_io import read_glossary

INDEX = os.path.join(os.path.dirname(HERE), "index.html")
W = 600  # viewBox width; height follows from the region's shape
MERGE = 26  # dots closer than this (in viewBox units) share one card

# Where each place on the Map cards sheet is: (longitude, latitude).
COORDS = {
    "Athens": (23.73, 37.98), "Rome": (12.50, 41.90), "Paris": (2.35, 48.86),
    "Switzerland": (7.59, 47.56), "London": (-0.13, 51.51), "Königsberg": (20.51, 54.71),
    "St Petersburg": (30.31, 59.94), "Ephesus": (27.34, 37.94), "Bordeaux": (-0.58, 44.84),
    "Amsterdam": (4.90, 52.37), "Edinburgh": (-3.19, 55.95), "Frankfurt": (8.68, 50.11),
    "Murcia": (-1.13, 37.99), "Rotterdam": (4.48, 51.92), "Arezzo": (11.88, 43.46),
    "Yasnaya Polyana": (37.53, 54.07), "Konya": (32.49, 37.87), "Baghdad": (44.36, 33.31),
    "Shiraz": (52.53, 29.59), "Nishapur": (58.80, 36.21), "Northern India": (84.99, 24.70),
    "Kolkata": (88.36, 22.57), "China": (116.2, 34.7), "Japan": (135.77, 35.01),
    "Concord, Massachusetts": (-71.35, 42.46), "Amherst, Massachusetts": (-72.52, 42.37),
    "Cambridge, Massachusetts": (-71.11, 42.37),
}

EUROPE = (-11, 32, 48, 62)   # west, south, east, north
WORLD = (-82, 14, 146, 63)
MAPS = [
    {"title": "The world", "box": WORLD, "inset": EUROPE, "tol": 0.7},
    {"title": "Europe and the Mediterranean, closer", "box": EUROPE, "tol": 0.9},
]


def inside(box, lon, lat):
    w, s, e, n = box
    return w <= lon <= e and s <= lat <= n


def places():
    cards = read_glossary()["Map cards"]
    missing = [c["Place"] for c in cards if c["Place"] not in COORDS]
    if missing:
        sys.exit(f"add these places to COORDS in make_maps.py: {missing}")
    wiki = lambda u: urllib.parse.unquote(u.rsplit("/wiki/", 1)[1]) if u and "/wiki/" in u else (u or "")
    return [(COORDS[c["Place"]], c["Place"], c["Card text"], wiki(c["Wikipedia"])) for c in cards]


def merged(points):
    """Join places whose dots would overlap: one dot, one card listing them all."""
    groups = []
    for x, y, title, text, wiki in sorted(points, key=lambda p: (p[1], p[0])):
        for g in groups:
            if any(math.dist((x, y), (gx, gy)) < MERGE for gx, gy, *_ in g):
                g.append((x, y, title, text, wiki))
                break
        else:
            groups.append([(x, y, title, text, wiki)])
    out = []
    for g in groups:
        x = sum(p[0] for p in g) / len(g)
        y = sum(p[1] for p in g) / len(g)
        titles = [p[2] for p in g]
        tail = {t.rpartition(", ")[2] for t in titles}
        if len(g) > 1 and len(tail) == 1 and all(", " in t for t in titles):  # same state: say it once
            titles = [t.rpartition(", ")[0] for t in titles]
            titles[-1] += ", " + tail.pop()
        title = titles[0] if len(g) == 1 else ", ".join(titles[:-1]) + " and " + titles[-1]
        text = "\n\n".join((p[2] + "\n" if len(g) > 1 else "") + p[3] for p in g)
        out.append((x, y, title, text, g[0][4]))
    return out


def projector(box):
    w, s, e, n = box
    k = math.cos(math.radians((s + n) / 2))
    scale = W / ((e - w) * k)
    h = (n - s) * scale
    return (lambda lon, lat: ((lon - w) * k * scale, (n - lat) * scale)), h


def clip(ring, xmin, ymin, xmax, ymax):
    """Sutherland–Hodgman: clip a closed ring to a rectangle."""
    def cut(pts, inside, meet):
        out = []
        for i, p in enumerate(pts):
            q = pts[i - 1]
            if inside(p):
                if not inside(q):
                    out.append(meet(q, p))
                out.append(p)
            elif inside(q):
                out.append(meet(q, p))
        return out

    def at_x(x):
        return lambda a, b: (x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]))

    def at_y(y):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y)

    for inside, meet in ((lambda p: p[0] >= xmin, at_x(xmin)), (lambda p: p[0] <= xmax, at_x(xmax)),
                         (lambda p: p[1] >= ymin, at_y(ymin)), (lambda p: p[1] <= ymax, at_y(ymax))):
        ring = cut(ring, inside, meet)
        if not ring:
            break
    return ring


def simplify(pts, tol):
    """Ramer–Douglas–Peucker."""
    if len(pts) < 3:
        return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-9
    i, d = max(((i, abs(dy * (x - x1) - dx * (y - y1)) / norm) for i, (x, y) in enumerate(pts[1:-1], 1)),
               key=lambda t: t[1])
    if d <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[:i + 1], tol)[:-1] + simplify(pts[i:], tol)


def coast_path(features, proj, h, tol=0.9):
    """Coastlines only: clipped rings, minus the straight cuts along the map's edges."""
    m = 2
    box = (-m, -m, W + m, h + m)
    on_edge = lambda p, q: any(abs(p[i] - v) < 1e-6 and abs(q[i] - v) < 1e-6
                               for i, v in ((0, box[0]), (0, box[2]), (1, box[1]), (1, box[3])))
    parts = []
    for f in features:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                pts = clip([proj(lon, lat) for lon, lat in ring], *box)
                if len(pts) < 3:
                    continue
                xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
                if max(xs) - min(xs) < 6 and max(ys) - min(ys) < 6:
                    continue  # specks too small to read as land
                pts = pts + [pts[0]]
                # Break the ring into runs of real coastline.
                runs, run = [], [pts[0]]
                for p, q in zip(pts, pts[1:]):
                    if on_edge(p, q):
                        if len(run) > 1:
                            runs.append(run)
                        run = [q]
                    else:
                        run.append(q)
                if len(run) > 1:
                    runs.append(run)
                if len(runs) > 1 and runs[0][0] == runs[-1][-1]:  # rejoin across the start
                    runs[0] = runs.pop()[:-1] + runs[0]
                for r in runs:
                    if r[0] == r[-1] and len(r) > 3:  # a whole island: split for simplifying
                        k = max(range(len(r)), key=lambda i: math.dist(r[0], r[i]))
                        r = simplify(r[:k + 1], tol)[:-1] + simplify(r[k:], tol)
                    else:
                        r = simplify(r, tol)
                    if len(r) >= 2:
                        parts.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in r))
    return "".join(parts)


def figure(m, features, all_places):
    proj, h = projector(m["box"])
    a = lambda s: html.escape(s, quote=True)
    extra = ""
    if "inset" in m:  # outline the area the closer map shows
        w, s_, e, n = m["inset"]
        (x1, y1), (x2, y2) = proj(w, n), proj(e, s_)
        extra = f'<rect class="map-inset" x="{x1:.0f}" y="{y1:.0f}" width="{x2 - x1:.0f}" height="{y2 - y1:.0f}" rx="4"/>'
    out = ['      <figure class="map-figure">',
           f'        <figcaption>{m["title"]}</figcaption>',
           '        <div class="map-wrap">',
           f'          <svg class="map" viewBox="0 0 {W} {h:.0f}" aria-hidden="true">'
           f'<path class="map-coast" d="{coast_path(features, proj, h, m["tol"])}"/>{extra}</svg>']
    pts = []
    for (lon, lat), title, text, wiki in all_places:
        if not inside(m["box"], lon, lat) or ("inset" in m and inside(m["inset"], lon, lat)):
            continue
        x, y = proj(lon, lat)
        pts.append((x, y, title, text, wiki))
    for x, y, title, text, wiki in merged(pts):
        out.append(f'          <button type="button" class="map-dot" style="left:{x / W * 100:.1f}%;top:{y / h * 100:.1f}%" '
                   f'aria-haspopup="dialog" aria-label="{a(title)}" data-title="{a(title)}" '
                   f'data-text="{a(text)}" data-wiki="{a(wiki)}"></button>')
    out += ['        </div>', '      </figure>']
    return "\n".join(out)


def main(geojson):
    features = json.load(open(geojson, encoding="utf-8"))["features"]
    all_places = places()
    block = "\n".join(figure(m, features, all_places) for m in MAPS)
    page = open(INDEX, encoding="utf-8").read()
    start, end = "<!-- maps:start -->", "<!-- maps:end -->"
    if start not in page:
        sys.exit("index.html has no <!-- maps:start --> marker")
    page = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: f"{start}\n{block}\n      {end}", page, flags=re.S)
    open(INDEX, "w", encoding="utf-8").write(page)
    print(f"maps written to index.html ({len(block) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
