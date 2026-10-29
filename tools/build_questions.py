"""Monthly questions: content/monthly-questions.xlsx -> questions.json, with the checks.

    python3 tools/build_questions.py        (also run at the end of build_content.py)

Once a month, one question that 2-4 of that month's thoughts answer differently (design and rules:
exports/handover-monthly-questions-2026-10-29.md and the UI note of the same day). Every month is
written with its Status; the app shows only "Ready" months (drafts only in test APKs). Checked:
  - every excerpt ("Their words") is copied word for word from its thought ("…" marks a cut);
  - every voice is a thought the calendar shows in that month (a pinned date may move it, never
    out of the month);
  - "Pushed back by" and the sharpest pair name voices of the same month (the pair is kept for
    later; the app doesn't show it).
"""
import datetime as dt
import json, os, re, sys, unicodedata

from content_io import ROOT, read_questions, read_calendar, read_pinned
import calendar_rules


def norm(s):
    s = unicodedata.normalize("NFC", s.replace("\n", " "))
    s = re.sub(r"[‘’]", "'", re.sub(r"[“”]", '"', s))
    return re.sub(r"\s+", " ", s).strip()


def main():
    questions, voices = read_questions()
    by_id = {e["id"]: e for e in json.load(open(os.path.join(ROOT, "entries.json"), encoding="utf-8"))}
    days = read_calendar()
    cycle = [(d["id"], d["revisit"]) for d in days]
    pinned = {md: p["id"] for md, p in read_pinned().items()}
    problems, out = [], {}

    for q in questions:
        out[q["month"]] = {k: q[k] for k in ("question", "wayIn", "pair", "disagreement", "status")}
        out[q["month"]]["voices"] = []
    for v in voices:
        m, tid = v["month"], v["id"]
        if m not in out:
            problems.append(f"{m}: voice {v['voice']} for a month with no question")
            continue
        e = by_id.get(tid)
        if not e or e.get("retired"):
            problems.append(f"{m} {v['voice']}: #{tid} is not a live thought")
            continue
        # Word for word, in order; "…" marks a cut.
        text, pos = norm(e["text"]), 0
        for piece in (norm(p).strip() for p in v["words"].split("…")):
            if not piece.strip(" .,;:"):
                continue
            i = text.find(piece, pos)
            if i < 0:
                problems.append(f"{m} {v['voice']} (#{tid}): not word for word in the thought: {piece!r}")
            else:
                pos = i + len(piece)
        # Shown by the calendar in that month (first time round, as readers meet it).
        first = dt.date(int(m[:4]), int(m[5:]), 1)
        nxt = dt.date(first.year + first.month // 12, first.month % 12 + 1, 1)
        dates = [str(d) for d in (first + dt.timedelta(n) for n in range((nxt - first).days))
                 if calendar_rules.shown((d - calendar_rules.START).days, cycle, pinned)[0] == tid]
        if not dates:
            problems.append(f"{m} {v['voice']}: #{tid} is not shown by the calendar in that month")
        # The whole thought, give or take "…", quotation marks, punctuation and case: the app then
        # shows its source instead of "read the passage".
        bare = lambda t: re.sub(r"[\W_]+", "", t.replace("…", "")).lower()
        out[m]["voices"].append({"order": v["order"], "id": tid, "voice": v["voice"], "line": v["line"],
                                 "words": v["words"], "pushedBy": v["pushedBy"], "dates": dates,
                                 "whole": bare(v["words"]) == bare(e["text"])})
    for m, q in out.items():
        q["voices"].sort(key=lambda x: x["order"])
        names = {x["voice"] for x in q["voices"]}
        for x in q["voices"]:
            if x["pushedBy"] not in names or x["pushedBy"] == x["voice"]:
                problems.append(f"{m} {x['voice']}: 'Pushed back by' {x['pushedBy']!r} is not another voice of the month")
        for p in q["pair"]:
            if p not in names:
                problems.append(f"{m}: sharpest pair {p!r} is not a voice of the month")
        if not 2 <= len(q["voices"]) <= 4:
            problems.append(f"{m}: {len(q['voices'])} voices (2 to 4)")
    if problems:
        sys.exit("monthly questions:\n" + "\n".join(problems))
    json.dump(out, open(os.path.join(ROOT, "questions.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ready = sum(q["status"] == "Ready" for q in out.values())
    print(f"{len(out)} monthly questions ({ready} ready), {sum(len(q['voices']) for q in out.values())} voices, "
          f"every excerpt word for word -> questions.json")


if __name__ == "__main__":
    main()
