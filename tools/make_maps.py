"""Draw the two small origin maps on the About page and write them into index.html.

    python3 reflect/tools/make_maps.py <ne_50m_land.geojson>

Coastlines come from Natural Earth (public domain):
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson
The maps are bare outlines in inline SVG, so the app needs no network to show them.
Each dot is a button; tapping it opens the same small card as the glossary.
"""
import html, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(os.path.dirname(HERE), "index.html")
W = 600  # viewBox width; height follows from the region's shape

# One dot per place where our thinkers lived and taught: (lon, lat), card title, card text, Wikipedia page.
MAPS = [
    {
        "id": "map-europe",
        "title": "Europe & the Mediterranean",
        "box": (-11, 34, 37, 61),  # west, south, east, north
        "places": [
            ((23.73, 37.98), "Athens",
             "Socrates and Plato · Platonism\nAristotle · Virtue Ethics\nEpicurus · Epicureanism\nZeno, the founder of Stoicism\n"
             "Four schools began in this one city within a century. Epictetus later taught at Nicopolis, in north-western Greece.",
             "Ancient_Greek_philosophy"),
            ((12.50, 41.90), "Rome",
             "Seneca and Marcus Aurelius · Stoicism\nLucretius · Epicureanism\n"
             "Epictetus also lived here, enslaved and later freed, until his banishment to Greece. Marcus wrote parts of his Meditations on campaign, far from the city.",
             "Ancient_Roman_philosophy"),
            ((2.35, 48.86), "Paris",
             "Blaise Pascal · Existentialism (a forerunner)\nHe lived and worked here; his notes were published after his death as the Pensées.",
             "Blaise_Pascal"),
            ((9.76, 46.43), "Switzerland",
             "Friedrich Nietzsche · Existentialism\nHe taught at the University of Basel from 1869 to 1879, then spent his summers writing in Sils-Maria, in the Alps.",
             "Friedrich_Nietzsche"),
            ((-0.13, 51.51), "London",
             "John Stuart Mill · Utilitarianism\nMill was born here in 1806; Jeremy Bentham, who founded the school, also lived and wrote here.",
             "John_Stuart_Mill"),
            ((12.57, 55.68), "Copenhagen",
             "Søren Kierkegaard · Existentialism\nOften called the first existentialist, he spent almost his whole life here.",
             "Søren_Kierkegaard"),
            ((20.51, 54.71), "Königsberg",
             "Immanuel Kant · Duty Ethics\nKant spent almost his whole life here. The city is now Kaliningrad.",
             "Immanuel_Kant"),
            ((30.31, 59.94), "St Petersburg",
             "Fyodor Dostoevsky · Existentialism\nDostoevsky lived much of his writing life here.",
             "Fyodor_Dostoevsky"),
        ],
    },
    {
        "id": "map-asia",
        "title": "Asia",
        "box": (66, 10, 144, 47),
        "places": [
            ((84.99, 24.70), "Northern India",
             "The Buddha · Buddhist Philosophy\nHe taught across the Ganges plain around the 5th century BCE; tradition places his awakening at Bodh Gaya.",
             "Buddhist_philosophy"),
            ((116.2, 34.7), "China",
             "Confucius · Confucianism\nLaozi and Zhuangzi · Taoism\n"
             "Tradition places Confucius in the state of Lu, Laozi in Chu and Zhuangzi in Song, neighbouring states of ancient China, between the 6th and 4th centuries BCE.",
             "Hundred_Schools_of_Thought"),
            ((135.77, 35.01), "Japan",
             "Kamo no Chōmei, Kenkō and Kakuzo Okakura · Japanese Aesthetics\n"
             "Chōmei and Kenkō wrote in and around Kyoto in the 13th and 14th centuries. Okakura wrote The Book of Tea in English, published in New York in 1906.",
             "Japanese_aesthetics"),
        ],
    },
]


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


def coast_path(features, proj, h):
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
                        r = simplify(r[:k + 1], 0.9)[:-1] + simplify(r[k:], 0.9)
                    else:
                        r = simplify(r, 0.9)
                    if len(r) >= 2:
                        parts.append("M" + "L".join(f"{x:.0f} {y:.0f}" for x, y in r))
    return "".join(parts)


def figure(m, features):
    proj, h = projector(m["box"])
    a = lambda s: html.escape(s, quote=True)
    out = ['      <figure class="map-figure">',
           f'        <figcaption>{m["title"]}</figcaption>',
           '        <div class="map-wrap">',
           f'          <svg class="map" viewBox="0 0 {W} {h:.0f}" aria-hidden="true">'
           f'<path class="map-coast" d="{coast_path(features, proj, h)}"/></svg>']
    for (lon, lat), title, text, wiki in m["places"]:
        x, y = proj(lon, lat)
        out.append(f'          <button type="button" class="map-dot" style="left:{x / W * 100:.1f}%;top:{y / h * 100:.1f}%" '
                   f'aria-haspopup="dialog" aria-label="{a(title)}" data-title="{a(title)}" '
                   f'data-text="{a(text)}" data-wiki="{a(wiki)}"></button>')
    out += ['        </div>', '      </figure>']
    return "\n".join(out)


def main(geojson):
    features = json.load(open(geojson, encoding="utf-8"))["features"]
    block = "\n".join(figure(m, features) for m in MAPS)
    page = open(INDEX, encoding="utf-8").read()
    start, end = "<!-- maps:start -->", "<!-- maps:end -->"
    if start not in page:
        sys.exit("index.html has no <!-- maps:start --> marker")
    page = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: f"{start}\n{block}\n      {end}", page, flags=re.S)
    open(INDEX, "w", encoding="utf-8").write(page)
    print(f"maps written to index.html ({len(block) // 1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
