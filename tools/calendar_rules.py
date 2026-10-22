"""The looping calendar: its rules, and the checks the build runs before writing it.

The calendar is a cycle of 728 days (104 weeks) from Tuesday 20 October 2026: a date shows
cycle day (days since the start) mod 728, so weekdays never move. Every thought appears
once per cycle; the other days are revisits of a thought first shown at least six months
earlier. A few pinned thoughts sit outside the cycle and come back on their date every
year. On a pinned date, the cycle's thought of that day moves to the next revisit day if
there is one within a week (that revisit is skipped), otherwise it waits for the next cycle.
The app applies the same rules (dayInfo in app.js).
"""
import collections, datetime as dt, re

START = dt.date(2026, 10, 20)
CYCLE = 728            # 104 weeks
SIX_MONTHS = 182       # no thought within this many days of another appearance of itself
REVISIT_GAP = 189      # revisits keep a week more, so a thought moved by a pinned date stays clear
MOVE_WITHIN = 7        # how far a thought displaced by a pinned date may move
WINDOW = 4             # no same path or author within any 4 days in a row
LAUNCH_DAYS = 62       # the first days (to 20 December 2026) as the content team planned them

REVISIT_TEASER = "Tomorrow: a thought you may have met before."


def author(source):
    """'Confucius, Analects 14.36' -> 'Confucius'; 'Dhammapada 228' -> 'Dhammapada'."""
    return re.sub(r"\s+[\dIVXLC]+[.\d]*$", "", source.split(",")[0].strip())


def hard(t):
    return t["difficulty"] >= 4


def date_of(k):
    return START + dt.timedelta(k)


def pinned_on(k, pinned):
    return pinned.get(date_of(k).strftime("%m-%d"))


def shown(k, cycle, pinned):
    """(thought id, kind) shown on day k (days since START): kind is 'pinned', 'moved',
    'revisit' or 'new'. cycle: list of (id, is_revisit)."""
    if pinned_on(k, pinned):
        return pinned_on(k, pinned), "pinned"
    for s in range(1, MOVE_WITHIN + 1):
        kk = k - s
        if kk < 0 or not pinned_on(kk, pinned) or cycle[kk % CYCLE][1]:
            continue
        j = kk % CYCLE
        nxt = next((t for t in range(1, MOVE_WITHIN + 1) if j + t < CYCLE and cycle[j + t][1]), None)
        if nxt == s:
            return cycle[j][0], "moved"
    i, rev = cycle[k % CYCLE]
    return i, "revisit" if rev else "new"


def check(cycle, pinned, thoughts, years=40):
    """Every rule, over `years` years of dates. Returns (problems, stats)."""
    T = thoughts
    problems, stats = [], {}
    ids = [i for i, _ in cycle]
    firsts = [i for i, rev in cycle if not rev]
    if len(cycle) != CYCLE:
        problems.append(f"the cycle has {len(cycle)} days, not {CYCLE}")
    live = {i for i, t in T.items() if not t.get("retired")}
    if len(firsts) != len(set(firsts)):
        problems.append("a thought is new twice in the cycle")
    both = set(firsts) & set(pinned.values())
    if both:
        problems.append(f"pinned thoughts also in the cycle: {sorted(both)}")
    missing = live - set(firsts) - set(pinned.values())
    if missing:
        problems.append(f"thoughts missing from the calendar: {sorted(missing)[:10]}")
    pos = {i: k for k, (i, rev) in enumerate(cycle) if not rev}
    for k, (i, rev) in enumerate(cycle):
        if rev and (i not in pos or not REVISIT_GAP <= k - pos[i] <= CYCLE - REVISIT_GAP):
            problems.append(f"revisit of #{i} on {date_of(k)} is too close to its first showing")
    # Pinned dates: real dates, and far enough apart that their moves never meet.
    days = sorted(dt.date(2027, int(md[:2]), int(md[3:])).timetuple().tm_yday for md in pinned)
    if any(b - a <= MOVE_WITHIN for a, b in zip(days, days[1:] + [days[0] + 365])):
        problems.append("two pinned dates are less than 8 days apart")
    # The team's rules, around the whole cycle (the last days run into the first).
    for k in range(CYCLE):
        a = T[cycle[k][0]]
        for d in range(1, WINDOW):
            b = T[cycle[(k + d) % CYCLE][0]]
            if a["path"] == b["path"] or author(a["source"]) == author(b["source"]):
                problems.append(f"{date_of(k)} and {date_of(k + d)}: same path or author within {WINDOW} days")
        wd = date_of(k).weekday()
        if hard(a) and not (wd == 5 and not cycle[k][1] or wd == 6 and cycle[k][1]):
            problems.append(f"{date_of(k)}: a difficult thought outside Saturday (new) or Sunday (revisit)")
        if hard(a) and hard(T[cycle[(k + 1) % CYCLE][0]]):
            problems.append(f"{date_of(k)}: two difficult days in a row")
        if k < LAUNCH_DAYS and cycle[k][1]:
            problems.append(f"{date_of(k)}: a revisit in the launch days")
    # Six months apart, in both directions, across cycle boundaries, with pinned dates and
    # the moves they cause, day by day for `years` years.
    seen = collections.defaultdict(list)
    kinds = collections.Counter()
    for k in range(round(years * 365.25)):
        i, kind = shown(k, cycle, pinned)
        seen[i].append(k)
        kinds[kind] += 1
        if kind == "pinned":
            kinds["pinned on a new day" if not cycle[k % CYCLE][1] else "pinned on a revisit"] += 1
    gaps = [(b - a, i, date_of(a), date_of(b)) for i, v in seen.items() for a, b in zip(v, v[1:])]
    worst = min(gaps)
    if worst[0] < SIX_MONTHS:
        problems.append(f"#{worst[1]} shown on {worst[2]} and again on {worst[3]}: under six months")
    kinds["skipped (waits for the next cycle)"] = kinds["pinned on a new day"] - kinds["moved"]
    stats.update(shortest_gap=worst, years=years, kinds=dict(kinds))
    return problems, stats
