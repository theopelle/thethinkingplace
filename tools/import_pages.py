"""Turn exported Claude Doc markdown (thinker, text, path, and topic pages)
into content/pages.xlsx.

Usage: python3 tools/import_pages.py OUT.xlsx IN1.md [IN2.md ...]

Each page starts at a level-2 heading ("## Seneca", "## Thinker page: Seneca",
"## Topic page: Justice (society)"). Level-3 headings are its sections.
Intro sections ("How to read this batch", "The page shapes") are skipped.
Re-running replaces pages with the same Page ID, so later batches can be added.
"""
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font, PatternFill

SKIP = {"how to read this batch", "the page shapes", "open points for théo"}
PATHS = {
    "Stoicism", "Epicureanism", "Classical Greek Philosophy", "Enlightenment Ethics",
    "Existential Thought", "Humanists and Essayists", "Buddhist Philosophy",
    "Indian Philosophy", "Taoism", "Confucianism", "Japanese Aesthetics",
    "Persian and Sufi Poetry",
}
# Path labels used in the pilot, mapped to the glossary names.
PATH_ALIASES = {"Stoics": "Stoicism", "Taoists": "Taoism", "Enlightenment": "Enlightenment Ethics"}
SECTION_COLS = [
    "In one line", "The question in one line", "Who he was", "Who she was",
    "What this text is", "What these texts are", "Where and when", "What he cared about", "What she cared about",
    "What it cares about", "What they care about", "Key ideas", "How the traditions see it", "Who we read",
    "Next to its neighbours", "What might surprise you", "Where they agree, and where they don't",
    "Where to start reading",
]
COLUMNS = ["Page ID", "Type", "Title", "Header", "Path", "Theme", "Society topic", "Thought IDs",
           *SECTION_COLS, "Sources", "Status", "Source doc", "Note"]


def unescape(md):
    return re.sub(r"\\([\\_\[\]*#()`.!-])", r"\1", md).strip()


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def thought_ids(text):
    ids = set()
    for a, b in re.findall(r"#(\d+)\s*[–-]\s*(?:#)?(\d+)", text):
        ids.update(range(int(a), int(b) + 1))
    ids.update(int(n) for n in re.findall(r"#(\d+)", text))
    return ",".join(str(i) for i in sorted(ids))


def parse(md_text, doc_name):
    pages = []
    for block in re.split(r"(?m)^## ", md_text)[1:]:
        title_line, _, body = block.partition("\n")
        title = title_line.strip()
        if title.lower() in SKIP:
            continue
        kind = None
        m = re.match(r"(Thinker|Topic) page: (.+)", title)
        if m:
            kind, title = m.group(1).lower(), m.group(2)
        society = title.endswith("(society)")
        title = title.replace(" (society)", "")
        sections, header, cur = {}, "", None
        for line in body.splitlines():
            h = re.match(r"### (.+)", line)
            if h:
                cur = h.group(1).strip()
                sections[cur] = []
            elif cur:
                sections[cur].append(line)
            elif line.strip() and not header:
                header = line.strip()
        sections = {k: unescape("\n".join(v)) for k, v in sections.items()}
        if kind is None:
            if title in PATHS:
                kind = "path"
            elif "What this text is" in sections or "What these texts are" in sections:
                kind = "text"
            elif "How the traditions see it" in sections:
                kind = "topic"
            else:
                kind = "thinker"
        header = unescape(header)
        path = ""
        if kind in ("thinker", "text"):
            last = header.split("·")[-1].strip()
            path = PATH_ALIASES.get(last, last)
            if path in PATH_ALIASES.values():
                header = " · ".join(header.split(" · ")[:-1] + [path])
        elif kind == "path":
            path = title
        theme = ""
        if kind == "topic":
            tm = re.search(r"theme: ([^·]+?)(?:, plus hand-picked thoughts)?\s*·", header)
            theme = tm.group(1).strip() if tm else ""
        notes_text = sections.get("Your thoughts and notes", "")
        row = {
            "Page ID": f"{kind}-{slug(title)}",
            "Type": kind,
            "Title": title,
            "Header": header,
            "Path": path,
            "Theme": theme,
            "Society topic": "yes" if society else "",
            "Thought IDs": thought_ids(notes_text) if kind == "topic" and "#" in notes_text else "",
            "Sources": sections.get("Sources", ""),
            "Status": "Draft",
            "Source doc": doc_name,
            "Note": "",
        }
        for col in SECTION_COLS:
            row[col] = sections.get(col, "")
        extra = set(sections) - set(SECTION_COLS) - {"Sources", "Your thoughts and notes"}
        if extra:
            row["Note"] = "Unmapped sections: " + ", ".join(sorted(extra))
        pages.append(row)
    return pages


def sources_rows(page):
    rows = []
    for line in page["Sources"].splitlines():
        line = line.lstrip("- ").strip()
        for part in line.split(" · "):
            m = re.match(r"(.+?):\s*(https?://\S+)$", part.strip())
            if m:
                rows.append([page["Page ID"], m.group(1).strip(), m.group(2)])
            elif part.strip():
                rows.append([page["Page ID"], part.strip(), ""])
    return rows


def main(out, inputs):
    out = Path(out)
    existing = {}
    if out.exists():
        ws = openpyxl.load_workbook(out)["Pages"]
        hdr = [c.value for c in ws[1]]
        for r in ws.iter_rows(min_row=2, values_only=True):
            if r[0]:
                existing[r[0]] = dict(zip(hdr, r))
    for p in inputs:
        for page in parse(Path(p).read_text(encoding="utf-8"), Path(p).stem):
            old = existing.get(page["Page ID"])
            if old and old.get("Status") not in (None, "", "Draft"):
                page["Status"] = old["Status"]  # keep a status Théo set by hand
            existing[page["Page ID"]] = page

    order = {"path": 0, "thinker": 1, "text": 1, "topic": 2}
    pages = sorted(existing.values(), key=lambda r: (order.get(r["Type"], 9), r["Title"]))

    wb = openpyxl.Workbook()
    readme = wb.active
    readme.title = "Read me"
    for line in [
        ["pages.xlsx: thinker, text, path, and topic pages"],
        ["One row per page. Text is markdown: **bold**, *italic*, '- ' bullets, blank line between paragraphs."],
        ["Built from exported Claude Docs by tools/import_pages.py. Edit the doc, re-export, re-run; or edit here and keep Status other than Draft."],
        ["Thought IDs: only for topic pages that pick thoughts by hand. Theme and path pages pick thoughts by theme or path."],
        ["The app shows only thoughts the reader has already met, counted as '[n] thoughts so far'."],
        ["Status: Draft until Théo marks a page Ready. Only Ready pages ship."],
    ]:
        readme.append(line)
    readme.column_dimensions["A"].width = 120

    ws = wb.create_sheet("Pages")
    ws.append(COLUMNS)
    for p in pages:
        ws.append([p.get(c, "") for c in COLUMNS])
    for c in ws[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill("solid", fgColor="E7F1FB")
    widths = {"Page ID": 28, "Type": 9, "Title": 26, "Header": 40, "Path": 22, "Theme": 26, "Society topic": 8,
              "Thought IDs": 18, "Sources": 60, "Status": 9, "Source doc": 24, "Note": 30}
    for i, col in enumerate(COLUMNS, 1):
        letter = openpyxl.utils.get_column_letter(i)
        ws.column_dimensions[letter].width = widths.get(col, 50)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = "D2"

    src = wb.create_sheet("Sources")
    src.append(["Page ID", "Source", "Link"])
    for p in pages:
        for r in sources_rows(p):
            src.append(r)
    for c in src[1]:
        c.font = Font(bold=True)
    src.column_dimensions["A"].width = 28
    src.column_dimensions["B"].width = 70
    src.column_dimensions["C"].width = 70

    wb.save(out)
    print(f"{out}: {len(pages)} pages, {src.max_row - 1} source rows")
    for p in pages:
        if p["Note"]:
            print("  note:", p["Page ID"], p["Note"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
