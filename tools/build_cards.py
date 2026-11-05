"""One card per item, the same everywhere: glossary.json + pages.json -> cards.json.

    python3 tools/build_cards.py        (also run at the end of build_content.py)

Every small card in the app (a dotted word in a quote, a name in a Library page, a path on the
timeline, a voice in a monthly question) shows from this one set, so an item reads the same on
Today, in the Library, in Past thoughts, and in monthly questions. Design:
handover-one-card-2026-11-05.md (shared session notes). A card has:
  - its type (Thinker, Text, Path, Era, Theme, Idea, Book, Person, Character, Place, Word);
  - its title;
  - for thinkers and texts, the Library page's header (place · dates · path); for eras, their dates;
  - its body: the glossary definition for thinkers, texts, and every other glossary word; the
    Library page's "In one line" for paths and eras, "The question in one line" for themes (never a
    page's first sentence);
  - its link: the Library page ("More about …", or "More in: …" for ideas), else Wikipedia.
The app shows a page link only when that page is shown (Ready, or a test build).
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KIND = {"thinker": "Thinker", "text": "Text", "path": "Path", "topic": "Theme", "era": "Era"}


def plain(md):
    return " ".join(md.replace("**", "").replace("*", "").split())


def main():
    glossary = json.load(open(os.path.join(ROOT, "glossary.json"), encoding="utf-8"))
    lib = json.load(open(os.path.join(ROOT, "pages.json"), encoding="utf-8"))
    pages = {p["id"]: p for p in lib["pages"] if p["type"] != "essay"}
    # "In one line" (paths and eras), or "The question in one line" (themes)
    one_line = lambda p: plain(next((md for t, md in p["sections"] if t in ("In one line", "The question in one line")), ""))
    title = lambda p: p["title"].replace(" (society)", "")
    path_page = {p["title"]: p["id"] for p in pages.values() if p["type"] == "path"}
    problems, by_term, by_page = [], [], {}  # word cards in glossary order (a term may appear twice, once per path)

    for g in glossary:
        t = g["type"]
        pid = path_page.get(g["term"]) if t == "Path" else lib["glossaryLinks"].get(g["term"]) if g.get("concept") else lib["cards"].get(g["term"])
        p = pages.get(pid)
        card = {"type": t, "title": g["term"], "header": "", "body": g["def"], "page": pid if p else None,
                "lead": "More in: " if g.get("concept") else "More about ", "wiki": g.get("wiki") or ""}
        if p and t in ("Thinker", "Text") and p["type"] in ("thinker", "text"):
            card["header"] = " · ".join(p["header"])
        if t == "Path":
            if not p or not one_line(p):
                problems.append(f"path {g['term']}: no Library page with an 'In one line'")
            else:
                card["body"] = one_line(p)
        by_term.append(card)
        # A thinker's or text's page shows its glossary card, so both read the same.
        if p and ((t in ("Thinker", "Text") and p["type"] in ("thinker", "text")) or (t == "Path" and p["type"] == "path")):
            by_page.setdefault(pid, dict(card, lead="More about "))

    for pid, p in pages.items():
        if pid in by_page:
            continue
        body = one_line(p)
        if p["type"] in ("thinker", "text"):
            problems.append(f"{pid}: a {p['type']} page with no glossary card")
            continue
        if not body:
            problems.append(f"{pid}: no 'In one line' for its card")
        by_page[pid] = {"type": KIND[p["type"]], "title": title(p), "header": p["header"][0] if p["type"] == "era" and p["header"] else "",
                        "body": body, "page": pid, "lead": "More about ", "wiki": ""}

    if problems:
        sys.exit("cards:\n" + "\n".join(problems))
    json.dump({"term": by_term, "page": by_page}, open(os.path.join(ROOT, "cards.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"{len(by_term)} word cards and {len(by_page)} page cards -> cards.json")


if __name__ == "__main__":
    main()
