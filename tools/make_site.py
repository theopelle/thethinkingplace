"""Build the website into site/: the home page, About, Terms and the iPhone guide at the
top, and the web app itself in site/app/ (also what the Android app packages).

    python3 tools/make_site.py

About and Terms are taken from the app's own pages (index.html), so the text is written
once. Upload the whole site/ folder to any static host.
"""
import os, re, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from logo import mark

ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web")
SITE = os.path.join(ROOT, "site")
APP_FILES = ["index.html", "style.css", "app.js", "sw.js", "manifest.webmanifest", "entries.json",
             "calendar.json", "glossary.json", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png",
             "icon-maskable-512.png", "mark-400.png"]
PLAY_URL = "https://play.google.com/store/apps/details?id=app.thethinkingplace"  # live once published


def app_section(page, view):
    """The inner HTML of one of the app's views, without its back button."""
    m = re.search(rf'<section id="view-{view}" class="view" hidden>(.*?)</section>', page, re.S)
    body = re.sub(r'\s*<button class="link quiet back".*?</button>', "", m.group(1), flags=re.S)
    return body


def main():
    shutil.rmtree(SITE, ignore_errors=True)
    os.makedirs(os.path.join(SITE, "app"))
    for f in APP_FILES:
        shutil.copy(os.path.join(ROOT, f), os.path.join(SITE, "app", f))
    shutil.copytree(os.path.join(ROOT, "fonts"), os.path.join(SITE, "app", "fonts"))
    shutil.copytree(os.path.join(ROOT, "vendor"), os.path.join(SITE, "app", "vendor"))
    shutil.copy(os.path.join(WEB, "site.css"), SITE)
    shutil.copy(os.path.join(WEB, "iphone.html"), SITE)

    svg = (mark("var(--fg)", "var(--logo-accent)", 1.0).replace(' width="365" height="365"', "", 1)
           .replace("<svg ", '<svg class="logo-mark" aria-hidden="true" ', 1))
    home = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(
        home.replace("{{MARK}}", svg).replace("{{PLAY_URL}}", PLAY_URL))

    page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    tpl = open(os.path.join(WEB, "page.html"), encoding="utf-8").read()
    # About: the app's introduction and the voices paragraph (the maps and timeline need the app).
    about = app_section(page, "about")
    keep = re.findall(r"\s*<h1>.*?</h1>|\s*<h2>(?:Why|About the voices).*?</h2>\s*<p>.*?</p>|\s*<p>(?:One thought|Each day's|Read slowly).*?</p>",
                      about, re.S)
    about_html = "".join(keep) + '\n    <p><a href="app/#/about">More in the app: the paths through time and where our thinkers lived →</a></p>'
    terms_html = app_section(page, "terms").replace("Use <em>export</em> in Settings", "Use <em>export</em> in the app's Settings")
    for name, title, body in (("about.html", "About", about_html), ("terms.html", "Terms & privacy", terms_html)):
        open(os.path.join(SITE, name), "w", encoding="utf-8").write(
            tpl.replace("{{TITLE}}", title.replace("&", "&amp;")).replace("{{BODY}}", body))
    print(f"site/ ready: {sum(len(f) for _, _, f in os.walk(SITE))} files")


if __name__ == "__main__":
    main()
