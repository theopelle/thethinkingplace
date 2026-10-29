"""Build the website into site/: the home page, About, Terms and the iPhone guide at the
top, and the web app itself in site/app/ (also what the Android app packages).

    python3 tools/make_site.py

About and Terms are taken from the app's own pages (index.html), so the text is written
once. Upload the whole site/ folder to any static host.
"""
import os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))

ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web")
SITE = os.path.join(ROOT, "site")
APP_FILES = ["index.html", "style.css", "calendar.js", "app.js", "sw.js", "manifest.webmanifest", "entries.json",
             "calendar.json", "glossary.json", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png",
             "icon-maskable-512.png", "mark-400.png"]
PLAY_URL = "https://play.google.com/store/apps/details?id=app.thinkingplace"  # live once published
HOME_THOUGHTS = [15, 308, 78, 494, 288, 389, 236]  # Monday to Sunday, see below


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
    shutil.copy(os.path.join(WEB, ".htaccess"), SITE)  # HTTPS and fresh updates on OVH
    # GitHub Pages: the custom domain, and no Jekyll processing (it would hide some files).
    open(os.path.join(SITE, "CNAME"), "w").write("thinkingplace.app\n")
    open(os.path.join(SITE, ".nojekyll"), "w").close()

    # The home page has the logo drawn into it (from tools/logo.py), so it shows even when
    # web/index.html is opened on its own.
    home = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    home = home.replace("{{PLAY_URL}}", PLAY_URL)

    # The home page shows a thought from the app, one per weekday (Monday first), written into
    # the page here. Chosen to be inviting: top-rated, the easiest level, seven paths, and none
    # in the app during its first three months. Change the ids to change them.
    import html, json
    by_id = {e["id"]: e for e in json.load(open(os.path.join(ROOT, "entries.json"), encoding="utf-8"))}
    # "about this thought" uses the long About note, as the app does (its paragraphs kept).
    week = [{**{k: by_id[i][k] for k in ("path", "text", "source", "prompt")},
             "context": by_id[i].get("about") or by_id[i]["context"]} for i in HOME_THOUGHTS]
    home = home.replace("{{HOME_THOUGHTS}}", json.dumps(week, ensure_ascii=False).replace("</", "<\\/"))
    first = week[0]  # what shows before the script picks today's weekday (and without scripts)
    for key in ("text", "source", "path", "context", "prompt"):
        home = home.replace("{{T_%s}}" % key.upper(), html.escape(first[key]))
    open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(home)

    page = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    tpl = open(os.path.join(WEB, "page.html"), encoding="utf-8").read()
    # About: the app's introduction and the voices paragraph (the maps and timeline need the app).
    about = app_section(page, "about")
    keep = re.findall(r"\s*<h1>.*?</h1>|\s*<h2>(?:Why|About the voices).*?</h2>\s*<p>.*?</p>|\s*<p>(?:One thought|Each day's|Read slowly).*?</p>",
                      about, re.S)
    terms_html = app_section(page, "terms").replace("Use <em>export</em> in Settings", "Use <em>export</em> in the app's Settings")
    # Near the end of About too: where the notes live, and how they can be lost (from Terms).
    notes = re.search(r"\s*<h2>Your notes are yours alone</h2>.*?(?=\s*<h2>)", terms_html, re.S).group(0)
    about_html = "".join(keep) + notes + '\n    <p><a href="app/#/about">More in the app: the paths through time and where our thinkers lived →</a></p>'
    for name, title, body in (("about.html", "About", about_html), ("terms.html", "Terms & privacy", terms_html)):
        open(os.path.join(SITE, name), "w", encoding="utf-8").write(
            tpl.replace("{{TITLE}}", title.replace("&", "&amp;")).replace("{{PATH}}", name).replace("{{BODY}}", body))
    print(f"site/ ready: {sum(len(f) for _, _, f in os.walk(SITE))} files")


if __name__ == "__main__":
    main()
