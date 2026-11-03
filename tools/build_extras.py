"""The Library extras: content/path-pairs.xlsx and content/conversation-questions.xlsx -> extras.json.

    python3 tools/build_extras.py        (also run at the end of build_content.py)

"Compare two paths" (a page per pair of paths: In one line, where they agree, where they part
ways, and a few thoughts from each) and "Questions for good conversations" (questions to take to a
dinner, grouped by who you're with, each from a thought). Design: exports/handovers/
handover-path-pairs-and-questions-2026-11-01.md. Every row is written with its Status; the app
shows only "Ready" ones (drafts only in test APKs). Checked:
  - every thought is live in entries.json and comes up in the calendar, so its link opens one day;
  - a pair's thoughts belong to the path they are listed under;
  - a pair names two of the twelve paths, and no pair appears twice (in either order);
  - every pair has 2-3 points on each side and 1-2 thoughts per path;
  - no question repeats a thought, and every group key is known.
"""
import json, os, re, sys

import openpyxl

from content_io import ROOT, read_calendar, read_pinned

PATHS = ["Stoicism", "Epicureanism", "Classical Greek Philosophy", "Enlightenment Ethics", "Existential Thought",
         "Humanists and Essayists", "Buddhist Philosophy", "Indian Philosophy", "Taoism", "Confucianism",
         "Japanese Aesthetics", "Persian and Sufi Poetry"]  # as app.js PATH_ORDER


def slug(p):
    return re.sub(r"[^a-z]+", "-", p.lower()).strip("-")


def rows(path, sheet):
    ws = openpyxl.load_workbook(os.path.join(ROOT, path), data_only=True)[sheet]
    head, *body = list(ws.iter_rows(values_only=True))
    return [dict(zip(head, (str(c).strip() if c is not None else "" for c in r))) for r in body if any(r)]


def main():
    entries = {e["id"]: e for e in json.load(open(os.path.join(ROOT, "entries.json"), encoding="utf-8"))}
    in_cycle = {d["id"] for d in read_calendar()} | {p["id"] for p in read_pinned().values()}
    problems = []

    def thought(tid, where):
        try:
            tid = int(float(tid))
        except ValueError:
            problems.append(f"{where}: thought id {tid!r} is not a number")
            return None
        e = entries.get(tid)
        if not e or e.get("retired"):
            problems.append(f"{where}: #{tid} is not a live thought")
            return None
        if tid not in in_cycle:
            problems.append(f"{where}: #{tid} never comes up in the calendar")
            return None
        return tid

    # ---- Compare two paths
    pairs, seen = {}, {}
    for r in rows("content/path-pairs.xlsx", "Pairs"):
        pid, a, b = r["Pair ID"], r["Path A"], r["Path B"]
        if a not in PATHS or b not in PATHS or a == b:
            problems.append(f"{pid}: {a!r} and {b!r} are not two of the twelve paths")
            continue
        if pid != f"{slug(a)}--{slug(b)}":
            problems.append(f"{pid}: the Pair ID should be {slug(a)}--{slug(b)}")
        both = frozenset((a, b))
        if both in seen:
            problems.append(f"{pid}: the same pair as {seen[both]}")
            continue
        seen[both] = pid
        side = lambda k: [[r[f"{k} {i}: heading"], r[f"{k} {i}: text"]] for i in (1, 2, 3) if r.get(f"{k} {i}: heading")]
        p = {"id": pid, "a": a, "b": b, "line": r["In one line"], "agree": side("Agree"), "part": side("Part ways"),
             "thoughts": [], "status": r["Status"] or "Draft"}
        for k, pts in (("agree", p["agree"]), ("part ways", p["part"])):
            if not 2 <= len(pts) <= 3 or any(not h or not t for h, t in pts):
                problems.append(f"{pid}: {len(pts)} '{k}' points, each needs a heading and a text (2 to 3)")
        if not p["line"]:
            problems.append(f"{pid}: no 'In one line'")
        pairs[pid] = p
    for r in rows("content/path-pairs.xlsx", "Thoughts"):
        pid, path = r["Pair ID"], r["Path"]
        if pid not in pairs:
            problems.append(f"Thoughts: {pid!r} is not a pair")
            continue
        p = pairs[pid]
        tid = thought(r["Thought ID"], f"{pid} ({path})")
        if tid is None:
            continue
        if path not in (p["a"], p["b"]):
            problems.append(f"{pid}: #{tid} is listed under {path!r}, not one of the pair's paths")
        elif entries[tid]["path"] != path:
            problems.append(f"{pid}: #{tid} is a {entries[tid]['path']} thought, listed under {path}")
        p["thoughts"].append({"path": path, "order": int(float(r["Order"] or 0)), "id": tid,
                              "gloss": r["Gloss (our words)"]})
    for p in pairs.values():
        # Path A's thoughts first, then path B's, each in their order
        p["thoughts"].sort(key=lambda t: (t["path"] != p["a"], t["order"]))
        for path in (p["a"], p["b"]):
            n = sum(t["path"] == path for t in p["thoughts"])
            if not 1 <= n <= 2:
                problems.append(f"{p['id']}: {n} thoughts for {path} (1 to 2)")
        for t in p["thoughts"]:
            del t["order"]

    # ---- Questions for good conversations
    conv = "content/conversation-questions.xlsx"
    intro = rows(conv, "Intro")[0]["Intro"]
    groups = sorted(rows(conv, "Groups"), key=lambda g: int(float(g["Order"])))
    keys = [g["Key"] for g in groups]
    questions, used = [], {}
    for r in sorted(rows(conv, "Questions"), key=lambda q: int(float(q["Order"]))):
        q = r["Question"]
        tid = thought(r["Thought ID"], f"question {q!r}")
        gs = [g.strip() for g in r["Groups"].split(",") if g.strip()]
        for g in gs:
            if g not in keys:
                problems.append(f"question {q!r}: unknown group {g!r}")
        if not gs:
            problems.append(f"question {q!r}: no group")
        if tid is not None and tid in used:
            problems.append(f"question {q!r}: #{tid} is already used by {used[tid]!r}")
        used[tid] = q
        questions.append({"question": q, "id": tid, "groups": gs, "status": r["Status"] or "Draft"})

    if problems:
        sys.exit("library extras:\n" + "\n".join(problems))
    out = {"pairs": list(pairs.values()),
           "conversation": {"intro": intro, "groups": [{"key": g["Key"], "label": g["Label"]} for g in groups],
                            "questions": questions}}
    json.dump(out, open(os.path.join(ROOT, "extras.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ready = lambda xs: sum(x["status"] == "Ready" for x in xs)
    print(f"{len(pairs)} path pairs ({ready(pairs.values())} ready), {len(questions)} conversation questions "
          f"({ready(questions)} ready) -> extras.json")


if __name__ == "__main__":
    main()
