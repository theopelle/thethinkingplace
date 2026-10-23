// The Thinking Place — which thought each day shows. Shared by the app and the website, so
// both always agree. tools/calendar_rules.py applies the same rules and checks them all at
// build time.
//
// A cycle of 728 days (104 weeks) loops forever from calendar.start, so weekdays never
// move. Each thought appears once per cycle; the other days revisit a thought shown at
// least six months before. Pinned thoughts come back on their date every year; the cycle's
// thought of that day moves to the next revisit day within a week, or waits for the next
// cycle. Before the start (test builds only) come a few preview days.
(function (root) {
  "use strict";
  const DAY = 86400000, MOVE_WITHIN = 7;
  const keyToUTC = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const utcToKey = (t) => new Date(t).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((keyToUTC(b) - keyToUTC(a)) / DAY);
  const addDays = (key, n) => utcToKey(keyToUTC(key) + n * DAY);
  // The reader's own date: the day changes at their local midnight.
  const localKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  function pinnedOn(calendar, key) {
    const p = (calendar.pinned || {})[key.slice(5)];
    return p ? { id: p[0], occasion: p[1], teaser: p[2] } : null;
  }

  function dayInfo(calendar, key) {
    const k = daysBetween(calendar.start, key), cyc = calendar.cycle, n = cyc.length;
    if (k < 0) {
      const pv = calendar.preview, j = pv ? daysBetween(pv.start, key) : -1;
      return { id: pv && j >= 0 && j < pv.ids.length ? pv.ids[j] : cyc[0][0], revisit: false };
    }
    const pin = pinnedOn(calendar, key);
    if (pin) return { id: pin.id, revisit: false, pinned: pin };
    for (let s = 1; s <= MOVE_WITHIN && s <= k; s++) {
      const j = (k - s) % n;
      if (!pinnedOn(calendar, addDays(key, -s)) || cyc[j][1]) continue;
      let t = 1;
      while (t <= MOVE_WITHIN && !(j + t < n && cyc[j + t][1])) t++;
      if (t === s) return { id: cyc[j][0], revisit: false, moved: true };
    }
    const [id, rev] = cyc[k % n];
    return { id, revisit: !!rev };
  }

  // One date format everywhere, in English whatever the phone's language: "Friday, 23 October"
  // (with the year when asked, "Friday, 23 October 2026").
  function formatDate(key, withYear) {
    const part = (o) => new Date(keyToUTC(key)).toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
    return `${part({ weekday: "long" })}, ${part({ day: "numeric" })} ${part({ month: "long" })}` + (withYear ? ` ${key.slice(0, 4)}` : "");
  }

  root.ThinkingCalendar = { DAY, keyToUTC, utcToKey, daysBetween, addDays, localKey, pinnedOn, dayInfo, formatDate };
})(typeof window !== "undefined" ? window : globalThis);
