// The Thinking Place — one thought a day, the same for everyone.
(() => {
  "use strict";

  // calendar.js comes first in index.html. Right after an update, a browser can briefly pair
  // an older cached page (without it) with this newer file: load it, then start again.
  if (!window.ThinkingCalendar) {
    const cal = document.createElement("script");
    cal.src = "calendar.js";
    cal.onload = () => { const again = document.createElement("script"); again.src = "app.js?again"; document.body.appendChild(again); };
    document.head.appendChild(cal);
    return;
  }

  const APP_NAME = "The Thinking Place";
  const DAY = 86400000;
  const PAGE_DAYS = 10;  // past thoughts shown at a time

  // Where feedback goes.
  const SITE = "thinkingplace.app";
  const CONTACT_EMAIL = "hello@thinkingplace.app";
  const FEEDBACK_FORM_URL = "https://forms.gle/CvrYFMvvinddBWut9";  // a Google Form

  // The goodbye on the closing screen depends on the moment. Edit freely.
  function goodbyeLine() {
    const d = new Date(), h = d.getHours(), wd = d.getDay();
    if ((wd === 5 && h >= 17) || wd === 6) return "Enjoy the weekend! Take some time for yourself.";
    if (wd === 0 && h >= 5 && h < 18) return "Enjoy your Sunday! See you tomorrow.";
    if (h >= 5 && h < 12) return "Have a lovely day! See you tomorrow.";
    if (h >= 12 && h < 18) return "Enjoy the rest of your day! See you tomorrow.";
    if (h >= 18 && h < 23) return "Have a nice evening! See you next time.";
    return "Sleep well! See you tomorrow.";
  }

  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plugin = (name) => NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[name];

  const $ = (id) => document.getElementById(id);
  let entries = [];
  let entriesById = {};
  let calendar = { start: "2026-10-20", cycle: [[1]], teasers: {}, pinned: {} };
  let glossary = [];

  // ---------- storage (always guarded) ----------
  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem("reflect:" + key); return v === null ? fallback : v; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem("reflect:" + key, value); return true; } catch { return false; }
    },
    remove(key) { try { localStorage.removeItem("reflect:" + key); } catch {} },
    keys(prefix) {
      try { return Object.keys(localStorage).filter((k) => k.startsWith("reflect:" + prefix)).map((k) => k.slice(8)); }
      catch { return []; }
    },
  };

  // ---------- dates ----------
  // On a local preview only (never on the site or in the app), ?today=2028-01-01&hour=21
  // pretends to be another day and time, to check the calendar years ahead.
  const TEST = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? new URLSearchParams(location.search) : null;
  const testToday = TEST && /^\d{4}-\d{2}-\d{2}$/.test(TEST.get("today") || "") ? TEST.get("today") : null;
  const hourNow = () => (TEST && TEST.get("hour") ? Number(TEST.get("hour")) : new Date().getHours());
  // Dates and the calendar's rules live in calendar.js, shared with the website.
  const { keyToUTC, utcToKey, daysBetween, addDays, formatDate } = window.ThinkingCalendar;
  const todayKey = () => testToday || window.ThinkingCalendar.localKey();

  // ---------- the calendar ----------
  // Which thought each day shows: see calendar.js (shared with the website).
  const pinnedOn = (key) => window.ThinkingCalendar.pinnedOn(calendar, key);
  const dayInfo = (key) => window.ThinkingCalendar.dayInfo(calendar, key);
  const entryFor = (key) => {
    const a = easyAt(key);
    return (a && entriesById[a.seg.ids[a.i]]) || entriesById[dayInfo(key).id];
  };

  // ---------- easing in ----------
  // A new reader can choose five easier thoughts before joining the shared calendar. They
  // are picked once, at that moment: easy and valuable, from different paths, and shown
  // nowhere in the calendar within six months before or after the easy days, so nobody
  // meets one twice soon.
  // Readers can switch easing in on and off during their first five days. Each stretch of
  // easy days is kept (start, thoughts, and the day it stopped) so past days keep showing
  // the thought that was read then; switching back on continues with the unused thoughts.
  const EASY_DAYS = 5;
  function easySegments() {
    let v = null;
    try { v = JSON.parse(store.get("easy", "null")); } catch {}
    return !v ? [] : Array.isArray(v) ? v : [v];  // older builds stored one plan
  }
  function easyAt(key) {
    for (const seg of easySegments()) {
      const i = daysBetween(seg.start, key);
      if (i >= 0 && i < seg.ids.length && !(seg.stop && key >= seg.stop)) return { seg, i };
    }
    return null;
  }
  const easyIndex = (key) => { const a = easyAt(key); return a ? a.i : -1; };
  function unusedEasy() {
    const segs = easySegments(), last = segs[segs.length - 1];
    if (!last) return null;  // never eased in
    const used = last.stop ? Math.max(0, daysBetween(last.start, last.stop)) : last.ids.length;
    return last.ids.slice(used);
  }
  const inFirstDays = () => daysBetween(store.get("installed", todayKey()), todayKey()) < EASY_DAYS;

  function pickEasy(today) {
    const shownBetween = (from, to) => {
      const ids = new Set();
      for (let key = from < calendar.start ? calendar.start : from; key <= to; key = addDays(key, 1)) ids.add(dayInfo(key).id);
      return ids;
    };
    const around = (days) => shownBetween(addDays(today, -days), addDays(today, EASY_DAYS - 1 + days));
    const sixMonths = around(182);
    const tries = [
      [sixMonths, (e) => e.difficulty === 1 && e.value >= 4],
      [sixMonths, (e) => e.difficulty <= 2 && e.value === 5],
      [around(60), (e) => e.difficulty <= 2 && e.value >= 4],
    ];
    // East and West in turn; within a path, the most valuable and then the shortest.
    const order = ["Stoicism", "Buddhist Philosophy", "Classical Greek Philosophy", "Taoism",
      "Humanists and Essayists", "Confucianism", "Epicureanism", "Japanese Aesthetics",
      "Enlightenment Ethics", "Indian Philosophy", "Existential Thought", "Persian and Sufi Poetry"];
    const live = entries.filter((e) => !e.retired).sort((a, b) => b.value - a.value || a.text.length - b.text.length);
    const picks = [];
    for (const path of order) {
      if (picks.length === EASY_DAYS) break;
      for (const [blocked, ok] of tries) {
        const e = live.find((x) => x.path === path && ok(x) && !blocked.has(x.id));
        if (e) { picks.push(e); break; }
      }
    }
    return picks.map((e) => e.id);
  }

  function startEasy() {
    const today = todayKey(), left = unusedEasy();
    const ids = left && left.length ? left : pickEasy(today);
    store.set("easy", JSON.stringify([...easySegments(), { start: today, ids }]));
  }

  function renderEasySetting() {
    const today = todayKey(), a = easyAt(today), left = unusedEasy();
    const offer = !a && inFirstDays() && (left === null || left.length > 0);
    $("easy-setting").hidden = !a && !offer;
    checkChoice("[data-easy]", "easy", a ? "on" : "off");
    if (a) {
      const until = utcToKey(keyToUTC(a.seg.start) + a.seg.ids.length * DAY);
      $("easy-status").textContent = `Day ${a.i + 1} of ${a.seg.ids.length}: easier thoughts first. From ${formatDate(until)}, you'll get the same thought as everyone.`;
    } else if (offer) {
      $("easy-status").textContent = "You're reading the same thought as everyone. During your first days, you can switch to easier thoughts first.";
    }
  }

  // Today's thought changes with the switch: the text fades out and back in, so the
  // change is felt.
  function setEasy(on) {
    if (on === !!easyAt(todayKey())) return;
    flushNote();
    const status = $("easy-status");
    status.classList.add("changing");
    clearTimeout(setEasy.timer);
    setEasy.timer = setTimeout(() => {
      if (on) startEasy();
      else {
        const segs = easySegments();
        segs[segs.length - 1].stop = todayKey();
        store.set("easy", JSON.stringify(segs));
      }
      renderEasySetting();
      status.classList.remove("changing");
      applyReminder(false);  // the coming reminders follow the change
    }, 350);
    checkChoice("[data-easy]", "easy", on ? "on" : "off");
  }

  // ---------- notes ----------
  // Each note is stored with the id of the thought it was written about, so the pair
  // stays together even if the calendar ever changes. A day can hold a second note
  // (`other`): during the first days a reader can switch between the gentle thought and
  // everyone's, and write about both.
  function readNote(key) {
    const raw = store.get("note:" + key);
    if (!raw) return null;
    try {
      const n = JSON.parse(raw);
      if (n && typeof n.text === "string") return n;
    } catch {}
    return { text: raw, id: null };  // older plain-text note
  }

  // The note a day holds about one thought, if any.
  function noteAbout(key, id) {
    const n = readNote(key);
    if (!n) return null;
    if (n.id == null || n.id === id) return n;
    return n.other && n.other.id === id ? n.other : null;
  }

  function writeNote(key, text, id) {
    const old = readNote(key), keep = [];
    if (text.trim()) keep.push({ text, id });
    for (const n of old ? [old, old.other] : [])
      if (n && n.id != null && n.id !== id && n.text.trim() && keep.length < 2) keep.push({ text: n.text, id: n.id });
    if (!keep.length) { store.remove("note:" + key); return true; }
    if (text.trim()) { countDay(key); store.set("noteChanged", todayKey()); }
    const [main, other] = keep;
    return store.set("note:" + key, JSON.stringify(other ? { ...main, other } : main));
  }

  // The thought to show for a day: the one its note was written about, if any. Today,
  // while the gentle start can still be switched, the switch decides.
  function entryShown(key) {
    if (key === todayKey() && inFirstDays()) return entryFor(key);
    const note = readNote(key);
    return (note && note.id != null && entriesById[note.id]) || entryFor(key);
  }
  const noteText = (key) => (noteAbout(key, entryShown(key).id) || { text: "" }).text;

  // Notes from the first version point at old text ids: move them to the new numbers.
  // Plain-text notes get the id of the thought shown that day.
  function upgradeNotes() {
    const legacy = {};
    for (const e of entries) if (e.legacy) legacy[e.legacy] = e.id;
    for (const k of store.keys("note:")) {
      const key = k.slice(5);
      const note = readNote(key);
      if (!note) continue;
      if (note.id == null) store.set(k, JSON.stringify({ text: note.text, id: entryFor(key).id }));
      else if (legacy[note.id] != null) store.set(k, JSON.stringify({ text: note.text, id: legacy[note.id] }));
    }
  }

  // ---------- moon ----------
  // Worked out on the device from a known new moon; no network or location needed.
  const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  const LUNATION = 29.530588853;

  function moonPhase(key) {
    const days = (keyToUTC(key) + DAY / 2 - NEW_MOON) / DAY;
    const phase = ((days / LUNATION) % 1 + 1) % 1; // 0 new, 0.5 full
    const label =
      phase < 0.03 || phase > 0.97 ? "new moon" :
      phase < 0.22 ? "moon growing" :
      phase < 0.28 ? "half moon" :
      phase < 0.47 ? "almost full" :
      phase < 0.53 ? "full moon" :
      phase < 0.72 ? "moon shrinking" :
      phase < 0.78 ? "half moon" : "moon shrinking";
    return { phase, label };
  }

  // A small line drawing of tonight's moon (as seen from the northern hemisphere).
  function moonIcon(phase) {
    const r = 10, c = Math.cos(2 * Math.PI * phase), rx = (r * Math.abs(c)).toFixed(2);
    const waxing = phase < 0.5;
    const limb = waxing ? 1 : 0;
    const term = waxing ? (c > 0 ? 0 : 1) : (c > 0 ? 1 : 0);
    const lit = phase < 0.03 || phase > 0.97 ? "" :
      `<path d="M0 ${-r} A${r} ${r} 0 0 ${limb} 0 ${r} A${rx} ${r} 0 0 ${term} 0 ${-r}Z"/>`;
    return `<svg viewBox="-11 -11 22 22" aria-hidden="true"><circle r="${r}"/>${lit}</svg>`;
  }

  // ---------- theme ----------
  function applyTheme(choice) {
    if (choice === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", choice);
    checkChoice("[data-theme-choice]", "themeChoice", choice);
  }

  // Marks the chosen option in a row of radio-like text buttons.
  function checkChoice(selector, key, value) {
    document.querySelectorAll(selector).forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset[key] === String(value))));
  }

  // ---------- saved thoughts ----------
  // "save" keeps a thought (with the day it was read) to find it again in past thoughts.
  function savedList() {
    try { return JSON.parse(store.get("saved", "[]")) || []; } catch { return []; }
  }
  const isSaved = (id) => savedList().some((x) => x.id === id);
  function toggleSaved() {
    const e = entryShown(currentKey), list = savedList();
    const next = isSaved(e.id) ? list.filter((x) => x.id !== e.id) : [...list, { id: e.id, key: currentKey }];
    store.set("saved", JSON.stringify(next));
    renderSaved(e);
    if (!isSaved(e.id)) return;
    toast("Saved. Find it again in past thoughts.");
  }
  function renderSaved(e) {
    const on = isSaved(e.id);
    $("save").textContent = on ? "saved" : "save";
    $("save").setAttribute("aria-pressed", String(on));
  }

  // ---------- meeting a thought again ----------
  // When a thought comes back (a revisit, the next cycle, or a day reread), the page recalls
  // when you first met it, and everything you wrote on it since, oldest first.
  function meetings(key, id) {
    let days = [];
    try { days = JSON.parse(store.get("days", "[]")) || []; } catch {}
    const dates = [...new Set([...days, ...store.keys("note:").map((k) => k.slice(5))])].filter((d) => d < key).sort();
    return dates.filter((d) => entryShown(d).id === id || noteAbout(d, id));
  }
  function renderMemory(key, e) {
    const met = meetings(key, e.id);
    $("memory").hidden = !met.length;
    if (!met.length) return;
    const when = (d) => formatDate(d, d.slice(0, 4) !== key.slice(0, 4));
    const notes = met.map((d) => [d, (noteAbout(d, e.id) || { text: "" }).text.trim()]).filter(([, t]) => t);
    $("memory-when").textContent = (met.length === 1 ? `You first met this thought on ${when(met[0])}.`
      : `You've met this thought ${met.length === 2 ? "twice" : met.length + " times"}, first on ${when(met[0])}.`) +
      (notes.length === 1 ? " You wrote:" : notes.length ? " What you wrote:" : "");
    const list = $("memory-notes");
    list.textContent = "";
    for (const [d, text] of notes) {
      const item = document.createElement("div");
      item.className = "memory-item";
      const date = document.createElement("p"), note = document.createElement("p"), link = document.createElement("a");
      date.className = "memory-date";
      date.textContent = when(d);
      note.className = "memory-note";
      note.textContent = text.length > 280 ? text.slice(0, 280).trimEnd() + "…" : text;
      link.className = "memory-link";
      link.href = "#/day/" + d;
      link.textContent = "read it all";
      if (notes.length > 1) item.append(date);
      item.append(note, link);
      list.append(item);
    }
    $("memory-link").hidden = notes.length > 0;
    $("memory-link").href = "#/day/" + met[0];
  }

  // ---------- text size ----------
  function setTextSize(v) {
    store.set("textSize", String(v));
    document.documentElement.style.fontSize = Number(v) === 1 ? "" : `${Number(v) * 100}%`;
    checkChoice("[data-text-size]", "textSize", v);
  }

  // ---------- day view ----------
  let currentKey = null;

  function renderDay(key) {
    flushNote();  // save any pending typing to the day it belongs to before switching
    const today = todayKey();
    // No peeking ahead.
    if (key > today) key = today;
    currentKey = key;
    const e = entryShown(key);

    const moon = moonPhase(key);
    $("day-date").innerHTML =
      (key === today ? "Today · " : "") + formatDate(key) +
      ` · <span class="moon">${moonIcon(moon.phase)}${moon.label}</span>`;
    // Verse arrives with line breaks (or " / " between lines): one block per line.
    const textEl = $("day-text");
    textEl.textContent = "";
    const lines = e.text.includes("\n") ? e.text.split("\n") : e.text.includes(" / ") ? e.text.split(" / ") : null;
    if (lines) {
      for (const line of lines) {
        const span = document.createElement("span");
        span.className = "verse-line";
        span.textContent = line;
        textEl.appendChild(span);
      }
    } else {
      textEl.textContent = e.text;
    }
    // Short passages stay centred; longer ones switch to left-aligned for easier reading.
    const passage = textEl.parentElement;
    passage.classList.toggle("long", e.text.length > 160);
    passage.classList.toggle("very-long", e.text.length > 320);
    passage.classList.toggle("verse", !!lines);
    $("day-source").textContent = e.source;
    $("day-path").textContent = e.path;
    $("day-context-text").textContent = e.context;
    const tr = $("day-translation");
    tr.textContent = (/^(Written in English|Translated)/.test(e.translation) ? "" : "Translation: ") + e.translation + " · ";
    const link = document.createElement("a");
    link.href = e.source_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "source";
    tr.appendChild(link);
    $("day-prompt").textContent = e.prompt;
    renderSaved(e);
    renderMemory(key, e);

    markTerms(e.path, ["day-text", "day-path", "day-source", "day-context-text"]);
    renderGreeting(key === today);
    // In the evening, a word about tomorrow.
    const teaser = key === today && hourNow() >= 20 ? teaserFor(today) : "";
    $("teaser").textContent = teaser;
    $("teaser").hidden = !teaser;

    showContext(false);
    countAfterReading(key);

    const note = noteText(key);
    $("note-text").value = note;
    $("note-done").hidden = !(note.trim() && key === today);
    $("note-status").textContent = "";
    setWriting(false);
    $("back-to-today").hidden = key === today;
  }

  // The note box is open only while writing; otherwise a saved note shows as a one-line preview.
  function setWriting(open) {
    if (!open) flushNote();
    const text = $("note-text").value.trim();
    $("note").hidden = !open;
    $("note-preview").hidden = open || !text;
    $("note-preview-text").textContent = text.split("\n")[0];
    $("open-note").setAttribute("aria-pressed", String(open));
    document.querySelector("#view-day .actions").classList.toggle("writing", open);
    if (open) { showQuestion(); $("note-text").focus(); }
  }

  function flushNote() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    writeNote(currentKey, $("note-text").value, entryShown(currentKey).id);
  }

  let saveTimer;
  function onNoteInput() {
    clearTimeout(saveTimer);
    $("note-done").hidden = !($("note-text").value.trim() && currentKey === todayKey());
    $("note-status").textContent = "";
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const text = $("note-text").value;
      const ok = writeNote(currentKey, text, entryShown(currentKey).id);
      $("note-status").textContent = ok ? "saved" : "could not save on this device";
    }, 600);
  }

  // Copies the thought, its author and the app's name, ready to paste anywhere; the
  // question stays personal.
  async function share() {
    const e = entryShown(currentKey || todayKey());
    const text = `“${e.text.replace(/\n/g, " / ")}”\n— ${e.source}\n\nvia ${APP_NAME} · ${SITE}`;
    if (await copyText(text)) toast("Copied. Paste it anywhere you like.");
    else toast("Couldn't copy on this device.");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API needs a secure context; fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      ta.remove();
      return ok;
    }
  }

  let toastTimer;
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 400);
    }, 2800);
  }

  function flash(btn, label) {
    const original = btn.textContent;
    btn.textContent = label;
    setTimeout(() => (btn.textContent = original), 1600);
  }

  // ---------- past thoughts ----------
  // Every day since the calendar began (plus any older day with a note), newest first,
  // ten at a time, optionally narrowed to one path or one theme.
  const journal = { path: "", theme: "", saved: false, shown: PAGE_DAYS };
  const FILTER_ALL = { path: "all paths", theme: "all themes" };
  let filterLists = { path: [], theme: [] };

  function fillFilters() {
    const live = entries.filter((e) => !e.retired);
    filterLists = { path: [...new Set(live.map((e) => e.path))], theme: [...new Set(live.flatMap((e) => e.themes))].sort() };
  }

  // A short list under the filter (at most two thirds of the screen), instead of the
  // phone's full-screen picker. A tap outside or the back button closes it.
  function openPicker(btn) {
    const kind = btn.dataset.filter, ul = $("picker");
    ul.textContent = "";
    for (const [value, label] of [["", FILTER_ALL[kind]], ...filterLists[kind].map((v) => [v, v])]) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(journal[kind] === value));
      li.tabIndex = 0;
      li.textContent = label;
      const pick = () => { closePicker(); setJournalFilter({ [kind]: value }); };
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      ul.appendChild(li);
    }
    ul.hidden = false;
    $("picker-back").hidden = false;
    const r = btn.getBoundingClientRect(), w = ul.offsetWidth, h = ul.offsetHeight;
    ul.style.left = Math.min(Math.max(16, r.left), window.innerWidth - w - 16) + "px";
    ul.style.top = (r.bottom + 8 + h < window.innerHeight - 16 ? r.bottom + 8 : Math.max(16, window.innerHeight - h - 16)) + "px";
    btn.setAttribute("aria-expanded", "true");
    openPicker.from = btn;
    (ul.querySelector('[aria-selected="true"]') || ul.firstChild).focus({ preventScroll: true });
  }

  function closePicker() {
    $("picker").hidden = true;
    $("picker-back").hidden = true;
    if (openPicker.from) { openPicker.from.setAttribute("aria-expanded", "false"); openPicker.from.focus({ preventScroll: true }); }
  }

  function journalDays() {
    const today = todayKey();
    const keys = new Set(store.keys("note:").map((k) => k.slice(5)).filter((k) => k <= today));
    const first = calendar.preview ? calendar.preview.start : calendar.start;
    for (let t = keyToUTC(today); t >= keyToUTC(first); t -= DAY) keys.add(utcToKey(t));
    return [...keys].sort().reverse().filter((key) => {
      const e = entryShown(key);
      return (!journal.path || e.path === journal.path) && (!journal.theme || (e.themes || []).includes(journal.theme)) &&
        (!journal.saved || isSaved(e.id));
    }).filter((key, i, all) => !journal.saved || all.findIndex((k) => entryShown(k).id === entryShown(key).id) === i);
  }

  function renderJournal() {
    const n = dayCount();
    $("journal-count").textContent = n === 1 ? "You've sat with 1 thought so far." : `You've sat with ${n} thoughts so far.`;
    $("journal-count").hidden = n < 1;
    renderBackupNudge();
    renderKeepsake();
    $("filter-saved").classList.toggle("active", journal.saved);
    $("filter-saved").setAttribute("aria-pressed", String(journal.saved));
    for (const kind of ["path", "theme"]) {
      const btn = $("filter-" + kind);
      btn.textContent = journal[kind] || FILTER_ALL[kind];
      btn.classList.toggle("active", !!journal[kind]);
    }
    const days = journalDays();
    const list = $("journal-list");
    list.textContent = "";
    for (const key of days.slice(0, journal.shown)) {
      const e = entryShown(key);
      const note = noteText(key);
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#/day/" + key;
      a.innerHTML = `<div class="j-date"></div><p class="j-text"></p>`;
      a.querySelector(".j-date").textContent = `${formatDate(key)} · ${e.path}`;
      a.querySelector(".j-text").textContent = e.text.replace(/ \/ /g, "\n");
      if (note) {
        const p = document.createElement("p");
        p.className = "j-note";
        p.textContent = note;
        a.appendChild(p);
      }
      li.appendChild(a);
      list.appendChild(li);
    }
    $("journal-empty").hidden = days.length > 0;
    $("journal-empty").textContent = journal.saved ? "Nothing saved yet. Tap “save” under a thought to keep it here." : "No past thoughts here yet.";
    $("journal-more").hidden = days.length <= journal.shown;
  }

  function setJournalFilter(change) {
    Object.assign(journal, change, { shown: PAGE_DAYS });
    renderJournal();
  }

  // ---------- notes: export, import, erase ----------
  async function exportNotes(btn) {
    // Notes, and saved thoughts (marked "· saved"), so both survive a new phone.
    const saved = savedList();
    const keys = [...new Set([...store.keys("note:").map((k) => k.slice(5)), ...saved.map((x) => x.key)])].sort();
    let read = [];
    try { read = JSON.parse(store.get("days", "[]")) || []; } catch {}
    if (!keys.length && !read.length) return flash(btn, "nothing yet");
    const blocks = keys.flatMap((key) => {
      // A day's thought, then (rarely) the other thought written about that day.
      const n = readNote(key), shown = entryShown(key);
      const pairs = [[shown, noteText(key)]];
      for (const x of n ? [n, n.other] : []) if (x && x.id != null && x.id !== shown.id && entriesById[x.id]) pairs.push([entriesById[x.id], x.text]);
      return pairs.map(([e, text]) => {
        const mark = saved.some((x) => x.key === key && x.id === e.id) ? " · saved" : "";
        return `${key} — ${e.source} (${e.path})${mark}\n“${e.text}”\n${e.prompt}\n\n${text}\n`;
      });
    });
    // Last, every day a thought was read (with or without a note), so the count and
    // "you first met this thought" carry over to a new phone.
    if (read.length) blocks.push(`Days you read: ${[...read].sort().join(", ")}\n`);
    const body = blocks.join("\n---\n\n");
    const name = `thinking-place-notes-${todayKey()}.txt`;
    if (NATIVE) {
      // Inside the app there are no browser downloads: write the file, then open the share
      // sheet so it can be saved to Files or Drive, or sent to yourself.
      try {
        const { Filesystem, Share } = window.Capacitor.Plugins;
        const { uri } = await Filesystem.writeFile({ path: name, data: body, directory: "CACHE", encoding: "utf8" });
        await Share.share({ title: "Your notes", files: [uri] });
        store.set("lastExport", todayKey());
      } catch { flash(btn, "not saved"); }
      renderBackupNudge();
      return;
    }
    // In a phone browser, the same share sheet as the app (Save to Files, Drive, mail to
    // yourself) is clearer than a download; a computer downloads the file as usual.
    const file = typeof File === "function" ? new File([body], name, { type: "text/plain" }) : null;
    if ((IOS || ANDROID) && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: "Your notes", files: [file] });
        store.set("lastExport", todayKey());
      } catch (e) {
        if (e && e.name !== "AbortError") flash(btn, "not saved");  // closing the sheet is fine
      }
      renderBackupNudge();
      return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    store.set("lastExport", todayKey());
    renderBackupNudge();
  }

  // Reads a file made by export: entries separated by "---", each starting with its date;
  // the note is everything after the first blank line. Existing notes are never overwritten:
  // a different note for the same day is kept, with the imported one added below it.
  async function importNotes(file) {
    let added = 0;
    try {
      const text = (await file.text()).replace(/\r\n/g, "\n");
      for (const block of text.split(/\n---\n/)) {
        const read = block.trim().match(/^Days you read: (.*)$/);
        if (read) {
          const before = dayCount();
          for (const day of read[1].match(/\d{4}-\d{2}-\d{2}/g) || []) countDay(day);
          added += dayCount() - before;
          continue;
        }
        const key = (block.trim().match(/^(\d{4}-\d{2}-\d{2}) —/) || [])[1];
        const gap = block.indexOf("\n\n");
        if (!key || gap < 0) continue;
        // The thought is recognised by its quoted text, so notes and saves
        // stay with the right thought even when that day's calendar thought differs.
        const head = block.slice(0, gap);
        const match = entries.find((e) => head.includes(`“${e.text}”`));
        const id = match ? match.id : entryShown(key).id;
        if (/^[^\n]* · saved\n/.test(block.trim()) && !isSaved(id)) {
          store.set("saved", JSON.stringify([...savedList(), { id, key }]));
          added++;
        }
        const note = block.slice(gap + 2).trim();
        if (!note) continue;
        const old = (noteAbout(key, id) || { text: "" }).text.trim();
        if (old === note || old.includes(note)) continue;
        writeNote(key, old ? old + "\n\n" + note : note, id);
        added++;
      }
    } catch {}
    flash($("import-notes"), added ? `imported ${added}` : "nothing new");
  }

  function clearNotes() {
    if (!confirm("Erase all your notes from this device? This cannot be undone.")) return;
    store.keys("note:").forEach((k) => store.remove(k));
    flash($("clear-notes"), "erased");
  }

  // ---------- your year: a keepsake ----------
  // A little book of the year, made on the phone as a PDF: a cover, then month by month
  // the thoughts you sat with and what you wrote, the thoughts you saved, and a closing
  // line. The PDF tool and its fonts load only when asked for. Nothing leaves the device
  // until you choose where to save or send the file.
  const keepsakeYear = () => { const d = new Date(); return d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear(); };

  function yearDays(year) {
    let days = [];
    try { days = JSON.parse(store.get("days", "[]")) || []; } catch {}
    const all = [...days, ...store.keys("note:").map((k) => k.slice(5)), ...savedList().map((x) => x.key)];
    return [...new Set(all)].filter((k) => k.startsWith(String(year)) && k <= todayKey()).sort();
  }

  const KEEPSAKE_ON = false;  // built and tested; hidden until we decide to show it
  function renderKeepsake() {
    document.querySelectorAll(".keepsake-row").forEach((el) => (el.hidden = !KEEPSAKE_ON));
    if (!KEEPSAKE_ON) { $("keepsake-nudge").hidden = true; return; }
    const year = keepsakeYear(), month = new Date().getMonth();
    document.querySelectorAll("#keepsake-setting").forEach((b) => (b.textContent = `make your ${year} keepsake`));
    // From December to the end of January, a quiet line in past thoughts.
    const show = (month === 11 || month === 0) && yearDays(year).length > 0;
    $("keepsake-nudge").hidden = !show;
    $("keepsake-nudge-btn").textContent = `Your ${year} in a little book: make your keepsake →`;
  }

  const loadScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src; el.onload = resolve; el.onerror = reject;
    document.head.appendChild(el);
  });

  async function base64Of(url, asDataUrl) {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
    return asDataUrl ? data : data.split(",")[1];
  }

  async function makeKeepsake(btn) {
    const year = keepsakeYear(), days = yearDays(year);
    if (!days.length) return flash(btn, "nothing yet this year");
    const label = btn.textContent;
    btn.textContent = "making your book…";
    try {
      await loadScript("vendor/jspdf.umd.min.js");
      const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a5" });
      doc.addFileToVFS("Literata-Regular.ttf", await base64Of("fonts/literata-regular.ttf"));
      doc.addFont("Literata-Regular.ttf", "Literata", "normal");
      doc.addFileToVFS("Literata-Italic.ttf", await base64Of("fonts/literata-italic.ttf"));
      doc.addFont("Literata-Italic.ttf", "Literata", "italic");
      const mark = await base64Of("mark-400.png", true);
      const blob = buildKeepsake(doc, year, days, mark);
      const name = `the-thinking-place-${year}.pdf`;
      if (NATIVE) {
        const { Filesystem, Share } = window.Capacitor.Plugins;
        const { uri } = await Filesystem.writeFile({ path: name, data: await base64Of(URL.createObjectURL(blob)), directory: "CACHE" });
        await Share.share({ title: `Your ${year}`, files: [uri] });
      } else {
        doc.save(name);
      }
      btn.textContent = label;
    } catch (err) {
      console.error("keepsake", err);
      btn.textContent = label;
      flash(btn, "couldn't make it here");
    }
  }

  function buildKeepsake(doc, year, days, mark) {
    const W = 148, H = 210, M = 18, TW = W - 2 * M, BOTTOM = H - 18;
    const PAPER = [251, 250, 247], INK = [38, 38, 38], MUTED = [107, 104, 98], TEAL = [78, 115, 120], STONE = [227, 223, 215];
    const lh = (pt) => pt * 0.3528 * 1.45;
    let y = 0, page = 0;
    const paper = () => { doc.setFillColor(...PAPER); doc.rect(0, 0, W, H, "F"); };
    const folio = () => {
      doc.setFont("Literata", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text(String(page), W / 2, H - 9, { align: "center" });
    };
    const newPage = () => { doc.addPage(); page++; paper(); folio(); y = 22; };
    const text = (str, { size = 10, style = "normal", color = INK, font = "Literata", gap = 0, indent = 0, center = false } = {}) => {
      doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color);
      const lines = doc.splitTextToSize(str, TW - indent);
      for (const line of lines) {
        if (y + lh(size) > BOTTOM) newPage();
        y += lh(size);
        doc.text(line, center ? W / 2 : M + indent, y, center ? { align: "center" } : undefined);
      }
      y += gap;
      return lines.length;
    };
    const caps = (str, color = MUTED) => {
      doc.setCharSpace(0.35);
      text(str.toUpperCase(), { size: 6.5, font: "helvetica", color, gap: 1 });
      doc.setCharSpace(0);
    };

    // Cover
    paper();
    doc.addImage(mark, "PNG", W / 2 - 17, 46, 34, 34);
    y = 102;
    text("Your year", { size: 24, center: true, gap: 2 });
    text(String(year), { size: 30, center: true, color: TEAL, gap: 6 });
    const name = (store.get("name", "") || "").trim();
    if (name) text(name, { size: 12, style: "italic", center: true, color: MUTED, gap: 2 });
    y = 176;
    doc.setCharSpace(0.6);
    text("THE THINKING PLACE", { size: 6.5, font: "helvetica", color: MUTED, center: true });
    doc.setCharSpace(0);

    // Month by month
    let month = "";
    const fmt = (key) => formatDate(key);
    for (const key of days) {
      const m = new Date(keyToUTC(key)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
      if (m !== month) {
        month = m;
        newPage();
        text(m, { size: 18, gap: 2 });
        doc.setDrawColor(...STONE); doc.setLineWidth(0.3); doc.line(M, y, M + 24, y);
        y += 7;
      }
      const e = entryShown(key), note = noteText(key).trim();
      if (y + 30 > BOTTOM) newPage();
      caps(`${fmt(key)} · ${e.path}`);
      text(e.text, { size: 10.5, gap: 1 });
      text(e.source, { size: 7.5, color: MUTED, gap: note ? 2.5 : 6 });
      if (note) {
        const top = y + 1;
        text(note, { size: 9.5, style: "italic", indent: 4, gap: 0 });
        doc.setDrawColor(...TEAL); doc.setLineWidth(0.5); doc.line(M + 0.5, top, M + 0.5, y + 1);
        y += 6;
      }
    }

    // Saved thoughts
    const saved = savedList().filter((x) => x.key.startsWith(String(year)));
    if (saved.length) {
      newPage();
      text("Thoughts you saved", { size: 18, gap: 2 });
      doc.setDrawColor(...STONE); doc.setLineWidth(0.3); doc.line(M, y, M + 24, y);
      y += 7;
      for (const x of saved) {
        const e = entriesById[x.id];
        if (!e) continue;
        if (y + 22 > BOTTOM) newPage();
        text(e.text, { size: 10.5, gap: 1 });
        text(e.source, { size: 7.5, color: MUTED, gap: 6 });
      }
    }

    // Closing
    newPage();
    y = 92;
    const n = days.length;
    text(n === 1 ? "You sat with one thought this year." : `You sat with ${n} thoughts this year.`, { size: 13, style: "italic", center: true, gap: 3 });
    text(`See you in ${year + 1}.`, { size: 11, color: MUTED, center: true });
    return doc.output("blob");
  }

  // ---------- backup reminder ----------
  // Notes live on one device only, so now and then the app suggests saving a copy:
  // when there are notes newer than the last export and a month (or three) has passed.
  // It shows on past thoughts and on the closing screen, never as a notification.
  function backupDue() {
    const every = store.get("backupEvery", "30");
    if (every === "off") return false;
    const notes = store.keys("note:").map((k) => k.slice(5)).sort();
    if (!notes.length) return false;
    const today = todayKey(), last = store.get("lastExport", "");
    const changed = store.get("noteChanged", notes[notes.length - 1]);
    if (last && changed <= last) return false;
    if ((store.get("backupSnooze", "") || "") > today) return false;
    const since = last || notes[0];
    return daysBetween(since, today) >= Number(every);
  }

  function renderBackupNudge() {
    const due = backupDue();
    $("backup-card").hidden = !due;
    $("closing-backup").hidden = !due;
  }

  function snoozeBackup() {
    store.set("backupSnooze", utcToKey(keyToUTC(todayKey()) + 7 * DAY));
    renderBackupNudge();
  }

  function setBackupEvery(v) {
    store.set("backupEvery", v);
    checkChoice("[data-backup]", "backup", v);
  }

  // ---------- the evening teaser ----------
  // "A Stoic thought on meaning", in the content team's words; "a gentle Stoic thought…"
  // for the easier thoughts of a gentle start.
  function thoughtKind(e, gentle) {
    const w = calendar.words || {};
    let who = (w.paths || {})[e.path];
    const on = (w.themes || {})[(e.themes || [])[0]];
    if (!who || !on) return "";
    if (gentle) who = who.replace(/^an? /, "a gentle ");
    return `${who} on ${on}`;
  }

  // Each thought has its teaser, in the content team's words; pinned dates have their own,
  // revisits share one. Gentle days, and thoughts without one, get theirs from the thought.
  function teaserFor(today) {
    const tomorrow = addDays(today, 1);
    if (easyIndex(tomorrow) >= 0) {
      const kind = thoughtKind(entryFor(tomorrow), true);
      return kind ? `Tomorrow: ${kind}.` : "Tomorrow: another gentle thought.";
    }
    const info = dayInfo(tomorrow), kind = thoughtKind(entryFor(tomorrow));
    const said = info.pinned ? info.pinned.teaser
      : info.revisit ? calendar.revisitTeaser || "Tomorrow: a thought you may have met before."
      : calendar.teasers[info.id] || (kind ? `Tomorrow: ${kind}.` : "");
    // The last gentle evening says that tomorrow everyone reads the same thought.
    if (easyIndex(today) >= 0) return said ? said.replace(/^Tomorrow: /, "Tomorrow, the same thought as everyone: ") : "Tomorrow: the same thought as everyone.";
    return said;
  }

  // ---------- reminder ----------
  // A gentle daily (or weekly) notification, only in the installed app. Scheduled on the
  // device itself: nothing is sent to or from a server.
  const REMINDER_ID = 1;
  function reminderPrefs() {
    let r = null;
    try { r = JSON.parse(store.get("reminder", "null")); } catch {}
    return Object.assign({ freq: "daily", hour: 8, weekday: 2 }, r || {});
  }

  // Each reminder says what kind of thought is waiting, in the content team's words:
  // "A Buddhist thought on pride and humility, and on emotions." They are scheduled on the
  // phone for the next 60 days (rescheduled at every opening); after that comes one last
  // plain reminder, then quiet until the app is opened again.
  const AHEAD_DAYS = 60, DAY_IDS = 100;
  function reminderText(key) {
    if (easyIndex(key) >= 0) {
      const kind = thoughtKind(entryFor(key), true);
      return kind ? `${kind[0].toUpperCase()}${kind.slice(1)}.` : "A gentle thought for today.";
    }
    const info = dayInfo(key), e = entryFor(key), w = calendar.words || {};
    if (info.pinned) return `A thought for ${info.pinned.occasion}.`;
    if (info.revisit) return "A thought you may have met before.";
    const who = (w.paths || {})[e.path];
    const [t1, t2] = (e.themes || []).map((t) => (w.themes || {})[t]);
    if (!who || !t1) return "Today's thought is waiting for you.";
    const on = !t2 || t2 === t1 ? t1 : t1.includes(" and ") || t2.includes(" and ") ? `${t1}, and on ${t2}` : `${t1} and ${t2}`;
    return `${who[0].toUpperCase()}${who.slice(1)} on ${on}.`;
  }

  function reminderSchedule(r) {
    const now = new Date(), list = [];
    const note = (id, at, body) => ({ id, title: APP_NAME, body, schedule: { at, allowWhileIdle: true },
      isExactNotification: false, smallIcon: "ic_stat_well", iconColor: "#4E7378" });
    for (let d = 0; d <= AHEAD_DAYS; d++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, r.hour, 0, 0);
      if (at <= now || (r.freq === "weekly" && at.getDay() + 1 !== r.weekday)) continue;  // weekday: 1 = Sunday
      const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
      list.push(note(DAY_IDS + d, at, d === AHEAD_DAYS ? "Today's thought is waiting for you." : reminderText(key)));
    }
    return list;
  }

  async function applyReminder(ask) {
    const LN = plugin("LocalNotifications");
    if (!LN) return;
    const r = reminderPrefs();
    try {
      await LN.cancel({ notifications: [REMINDER_ID, ...Array.from({ length: AHEAD_DAYS + 1 }, (_, i) => DAY_IDS + i)].map((id) => ({ id })) });
      if (r.freq === "off") return renderReminder("");
      let perm = await LN.checkPermissions();
      if (perm.display !== "granted" && ask) {
        store.set("reminderAsked", "1");
        perm = await LN.requestPermissions();
        // Declined when asked: the reminder is off, and Settings says so.
        if (perm.display !== "granted") {
          store.set("reminder", JSON.stringify(Object.assign(reminderPrefs(), { freq: "off" })));
          return renderReminder("");
        }
      }
      if (perm.display !== "granted") return renderReminder("Notifications are turned off for this app in your phone's settings.");
      await LN.schedule({ notifications: reminderSchedule(r) });
      renderReminder("");
    } catch { renderReminder("The reminder couldn't be set on this device."); }
  }

  function renderReminder(status) {
    const r = reminderPrefs();
    $("reminder").hidden = !NATIVE;
    checkChoice("[data-reminder-freq]", "reminderFreq", r.freq);
    checkChoice("[data-reminder-hour]", "reminderHour", r.hour);
    checkChoice("[data-reminder-day]", "reminderDay", r.weekday);
    $("reminder-time").hidden = r.freq === "off";
    $("reminder-days").hidden = r.freq !== "weekly";
    if (status !== undefined) $("reminder-status").textContent = status;
  }

  function setReminder(change) {
    store.set("reminder", JSON.stringify(Object.assign(reminderPrefs(), change)));
    renderReminder();
    applyReminder(true);
  }

  // ---------- sit and think ----------
  let silence = null;

  function setMinutes(m) {
    store.set("minutes", String(m));
    checkChoice("[data-minutes]", "minutes", m);
  }

  function audioCtx() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      silence.audio = silence.audio || new Ctx();
      return silence.audio;
    } catch { return null; }
  }

  function bell() {
    const ctx = silence && audioCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    [528, 792].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(i ? 0.04 : 0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 4.1);
    });
  }

  // Background sound while sitting, made on the device from filtered noise: no audio
  // files, nothing to download, works offline. Off unless chosen in Settings.
  function setSound(kind) {
    store.set("sound", kind);
    checkChoice("[data-sound]", "sound", kind);
  }

  function startSound() {
    const kind = store.get("sound", "off");
    const ctx = kind !== "off" && audioCtx();
    if (!ctx) return;
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "waves") { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5; }  // brown noise: deep and soft
      else d[i] = white;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter(), out = ctx.createGain(), t = ctx.currentTime;
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    if (kind === "rain") {
      filter.type = "bandpass"; filter.frequency.value = 2500; filter.Q.value = 0.4;
      lfo.frequency.value = 0.13; depth.gain.value = 600; lfo.connect(depth).connect(filter.frequency);
    } else if (kind === "waves") {
      filter.type = "lowpass"; filter.frequency.value = 500;
      lfo.frequency.value = 0.1; depth.gain.value = 350; lfo.connect(depth).connect(filter.frequency);
    } else {  // wind
      filter.type = "bandpass"; filter.frequency.value = 600; filter.Q.value = 1.2;
      lfo.frequency.value = 0.07; depth.gain.value = 300; lfo.connect(depth).connect(filter.frequency);
    }
    const swell = ctx.createGain();  // waves and wind rise and fall
    swell.gain.value = kind === "rain" ? 1 : 0.65;
    if (kind !== "rain") {
      const slow = ctx.createOscillator(), amt = ctx.createGain();
      slow.frequency.value = kind === "waves" ? 0.1 : 0.05; amt.gain.value = 0.35;
      slow.connect(amt).connect(swell.gain); slow.start(t);
      silence.soundStops = [slow];
    }
    const level = { rain: 0.05, waves: 0.12, wind: 0.08 }[kind];
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + 4);  // fades in slowly
    src.connect(filter).connect(swell).connect(out).connect(ctx.destination);
    src.start(t); lfo.start(t);
    silence.sound = { out, nodes: [src, lfo, ...(silence.soundStops || [])] };
  }

  function stopSound(fade = 2) {
    const s = silence && silence.sound;
    if (!s) return;
    const ctx = silence.audio, t = ctx.currentTime;
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setValueAtTime(s.out.gain.value, t);
    s.out.gain.linearRampToValueAtTime(0, t + fade);
    s.nodes.forEach((n) => { try { n.stop(t + fade + 0.1); } catch {} });
    silence.sound = null;
  }

  // Full-screen moments (sit and think, closing, welcome): hide the page behind from screen
  // readers and keyboards, move focus in, and give it back when the moment ends.
  let overlayReturn = null;
  function setOverlay(el, open, focusTarget) {
    el.hidden = !open;
    $("app").inert = open;
    if (open) {
      overlayReturn = document.activeElement;
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    } else if (overlayReturn && document.contains(overlayReturn)) {
      overlayReturn.focus({ preventScroll: true });
    }
  }

  // Sit and think has two modes: thinking time with the day's question shown softly, or
  // guided breathing. Each sitting starts in the default mode from Settings; switching on
  // the screen changes only that sitting.
  let sitNow = "think";

  // Breathing patterns: [cue, seconds, circle open?] in turn. 5-5 is the default.
  const BREATHS = {
    "5-5": { help: "Five seconds in, five out. Steady and easy, a good place to start.",
      steps: [["breathe in", 5, true], ["breathe out", 5, false]] },
    "box": { help: "In for four, hold for four, out for four, hold for four. Even and focusing.",
      steps: [["breathe in", 4, true], ["hold", 4, true], ["breathe out", 4, false], ["hold", 4, false]] },
    "4-7-8": { help: "In for four, hold for seven, out for eight. A long out-breath for winding down.",
      steps: [["breathe in", 4, true], ["hold", 7, true], ["breathe out", 8, false]] },
  };
  const breathPattern = () => BREATHS[store.get("breath", "5-5")] || BREATHS["5-5"];
  function setBreath(kind) {
    if (!BREATHS[kind]) kind = "5-5";
    store.set("breath", kind);
    checkChoice("[data-breath]", "breath", kind);
    $("breath-help").textContent = BREATHS[kind].help;
  }
  function sitMode() { return store.get("sitMode", "think"); }
  function setSitMode(mode) {
    store.set("sitMode", mode);
    checkChoice("[data-sit-mode]", "sitMode", mode);
  }
  function setSitNow(mode) {
    sitNow = mode;
    checkChoice("[data-sit-now]", "sitNow", mode);
    if (silence) showSitMode();
  }
  function showSitMode() {
    const think = sitNow === "think", started = !!silence.started;
    $("sit-intro").textContent = think ? "Let's think." : "Let's breathe.";
    $("sit-question").textContent = entryShown(currentKey || todayKey()).prompt;
    $("sit-question").hidden = !think || !started;
    $("breath-box").hidden = think || !started;
  }

  // A soft start: "Let's think" (or breathe) for a few seconds, then the time begins.
  // At the end: welcome back, then write, share, or done for today.
  const INTRO_MS = 3500;
  function openSilence() {
    const minutes = Number(store.get("minutes", "3"));
    silence = { timers: [] };
    $("silence").classList.remove("done", "bye", "leaving");
    $("sit-goodbye").hidden = true;
    $("sit-intro").hidden = false;
    $("sit-done").hidden = true;
    $("sit-mode").hidden = false;
    $("remaining").textContent = "";
    setOverlay($("silence"), true, $("close-silence"));
    setSitNow(sitMode());
    startSound();
    silence.timers.push(setTimeout(() => begin(minutes), INTRO_MS));
  }

  function begin(minutes) {
    if (!silence) return;
    silence.started = true;
    silence.end = Date.now() + minutes * 60000;
    $("sit-intro").hidden = true;
    showSitMode();
    bell();
    // The circle opens on the in-breath, stays still while holding, closes on the out-breath.
    const breath = $("breath"), cue = $("breath-cue"), steps = breathPattern().steps;
    let step = 0;
    const next = () => {
      if (!silence || silence.completed) return;
      const [say, secs, open] = steps[step];
      step = (step + 1) % steps.length;
      breath.style.transitionDuration = secs + "s";
      breath.classList.toggle("in", open);
      breath.classList.toggle("out", !open);
      cue.textContent = say;
      silence.breathing = setTimeout(next, secs * 1000);
    };
    silence.timers.push(setTimeout(next, 80));  // after the circle is on screen, so it eases in
    const tick = () => {
      const left = Math.max(0, silence.end - Date.now());
      const s = Math.ceil(left / 1000);
      $("remaining").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (left <= 0) complete();
    };
    tick();
    silence.ticker = setInterval(tick, 250);
  }

  function complete() {
    clearInterval(silence.ticker);
    clearTimeout(silence.breathing);
    silence.completed = true;
    bell();
    stopSound(6);
    $("breath").classList.remove("in", "out");
    // The question and breathing fade away; under the finished timer, welcome back,
    // then the choices (both brought in slowly by CSS).
    $("silence").classList.add("done");
    $("sit-mode").hidden = true;
    $("sit-done").hidden = false;
    setTimeout(() => silence && $("sit-finish").focus({ preventScroll: true }), 3000);
  }

  // "I'm done for today": the goodbye replaces the choices, then the screen fades back to
  // today. One ending, not two; a tap makes it go at once.
  function sitGoodbye() {
    $("sit-goodbye").textContent = goodbyeLine();
    $("sit-goodbye").hidden = false;
    $("silence").classList.add("bye");
    silence.timers.push(setTimeout(leaveSilence, 4000));
  }

  function leaveSilence() {
    if (!silence || $("silence").classList.contains("leaving")) return;
    $("silence").classList.add("leaving");
    window.scrollTo(0, 0);
    silence.timers.push(setTimeout(finishSilence, 1200));
  }

  function finishSilence() {
    if (!silence) return;
    clearInterval(silence.ticker);
    clearTimeout(silence.breathing);
    silence.timers.forEach(clearTimeout);
    stopSound(0.8);
    $("breath").classList.remove("in", "out");
    setOverlay($("silence"), false);
    const audio = silence.audio;
    if (audio) setTimeout(() => audio.close().catch(() => {}), 1200);
    silence = null;
  }

  // ---------- glossary ----------
  // Key terms get a faint underline; tapping one opens a short explanation.
  // Each term is marked once per page, at its first appearance.
  const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function markTerms(path, ids) {
    closeTerm();
    const used = new Set();
    const terms = glossary
      .map((g, i) => ({ ...g, i }))
      .filter((g) => !g.scope || g.scope.includes(path));
    for (const id of ids) {
      const root = $(id);
      if (!root) continue;
      for (const g of terms) {
        if (used.has(g.i)) continue;
        const alts = [...g.match].sort((a, b) => b.length - a.length).map(escapeRe).join("|");
        // Whole words only, and not part of a hyphenated compound like "Self-existent".
        const re = new RegExp(`(?<![\\p{L}\\p{N}-])(${alts})(?![\\p{L}\\p{N}]|-\\p{L})`, g.exact ? "u" : "iu");
        if (wrapFirst(root, re, g.i)) used.add(g.i);
      }
    }
  }

  // Wraps the first match of `re` in a text node of `root` (outside existing terms).
  function wrapFirst(root, re, index) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => n.parentElement.closest(".term") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const m = re.exec(node.data);
      if (!m) continue;
      const word = node.splitText(m.index);
      word.splitText(m[1].length);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "term";
      btn.dataset.term = index;
      btn.setAttribute("aria-haspopup", "dialog");
      word.replaceWith(btn);
      btn.appendChild(word);
      return true;
    }
    return false;
  }

  function openTerm(btn) {
    // The tour's underlined word: a first card to try, about the cards themselves.
    if (btn.dataset.tour != null) return showCard(btn, "Like this",
      "In each day's thought, key ideas, authors and books are underlined. Tap one for a short explanation; tap anywhere else to close it.");
    const g = glossary[+btn.dataset.term];
    if (!g) return;
    showCard(btn, g.term, g.def, g.wiki, g.school && schoolDetails(g));
  }

  // A path's card is a small introduction: who we read, where it began, its key ideas
  // (the concepts scoped to it in the glossary) and a free book to start with.
  function schoolDetails(g) {
    const ideas = glossary.filter((t) => t.concept && t.scope.includes(g.term)).map((t) => t.term);
    const rows = [["We read", g.school.who], ["Began", g.school.began]];
    if (ideas.length) rows.push(["Key ideas", ideas.join(", ")]);
    const frag = document.createDocumentFragment();
    for (const [label, value] of rows) {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = label; dd.textContent = value;
      frag.append(dt, dd);
    }
    const dt = document.createElement("dt"), dd = document.createElement("dd"), a = document.createElement("a");
    dt.textContent = "Start reading";
    a.href = g.school.read.url; a.target = "_blank"; a.rel = "noopener";
    a.textContent = g.school.read.title + " (free)";
    dd.append(a);
    frag.append(dt, dd);
    return frag;
  }

  function showCard(btn, title, text, wiki, more) {
    const card = $("term-card");
    $("term-title").textContent = title;
    $("term-def").textContent = text;
    $("term-more").replaceChildren(...(more ? [more] : []));
    $("term-more").hidden = !more;
    $("term-wiki").hidden = !wiki;
    if (wiki) $("term-wiki").href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(wiki).replace(/%2F/g, "/");
    card.hidden = false;
    // Place the card just below the word, or above it if there is no room.
    const r = btn.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), window.innerWidth - w - 16);
    const below = r.bottom + 10, above = r.top - h - 10;
    card.style.left = left + "px";
    const y = window.scrollY;
    const top = below + h < window.innerHeight - 64 || above < 16 ? below : above;
    card.style.top = y + Math.max(16, Math.min(top, window.innerHeight - h - 16)) + "px";  // on screen when it opens
    openTerm.from = btn;
    // Move focus into the card so screen readers announce the definition.
    card.focus({ preventScroll: true });
  }

  // A dot on the About page maps: who lived there.
  function openPlace(btn) {
    showCard(btn, btn.dataset.title, btn.dataset.text, btn.dataset.wiki);
    btn.setAttribute("aria-expanded", "true");
  }

  // A path on the About page timeline: its card, as on the daily page.
  function openPath(btn) {
    const g = glossary.find((t) => t.school && t.term === btn.dataset.path);
    if (!g) return;
    showCard(btn, g.term, g.def, g.wiki, schoolDetails(g));
    btn.setAttribute("aria-expanded", "true");
  }

  function closeTerm() {
    const card = $("term-card");
    if (!card || card.hidden) return;
    const hadFocus = card.contains(document.activeElement);
    card.hidden = true;
    if (openTerm.from) openTerm.from.removeAttribute("aria-expanded");
    if (hadFocus && openTerm.from && document.contains(openTerm.from)) openTerm.from.focus({ preventScroll: true });
  }

  // ---------- greeting ----------
  function renderGreeting(show) {
    const name = (store.get("name", "") || "").trim();
    const h = new Date().getHours();
    const part = h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 18 ? "Good afternoon" : "Good evening";
    $("greeting").textContent = name ? `${part}, ${name}` : part;
    $("greeting").hidden = !show;
  }

  // ---------- first launch: a short tour, then a name ----------
  let tourStep = 0;
  function showTourStep(i) {
    const steps = [...document.querySelectorAll("#welcome .tour-step")];
    tourStep = Math.min(i, steps.length - 1);
    steps.forEach((s, n) => (s.hidden = n !== tourStep));
    const last = tourStep === steps.length - 1;
    $("tour-foot").hidden = last;
    $("tour-dots").textContent = steps.slice(0, -1).map((_, n) => (n === tourStep ? "●" : "○")).join(" ");
    if (last) $("welcome-name").focus({ preventScroll: true });
  }

  function maybeWelcome() {
    if (store.get("welcomed")) return false;
    setOverlay($("welcome"), true);
    showTourStep(0);
    $("welcome-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      saveName($("welcome-name").value);
      store.set("installed", todayKey());
      if (ev.submitter && ev.submitter.value === "easy") startEasy();
      store.set("welcomed", "1");
      // The name keyboard is still open: hide the page for the reveal now, but measure
      // it (does the question fit?) only once the keyboard has gone and the screen is full size.
      document.activeElement && document.activeElement.blur();
      setOverlay($("welcome"), false);
      route();
      if (prepareReveal()) {
        afterResizeSettles().then(() => { holdQuestion(); assignSteps(); startReveal(200); });
      }
      applyReminder(true);
    }, { once: true });
    return true;
  }

  function saveName(value) {
    const name = value.trim().slice(0, 40);
    if (name) store.set("name", name); else store.remove("name");
  }

  // ---------- shared blocks (About and Settings) ----------
  function fillBlocks() {
    document.querySelectorAll("[data-block]").forEach((slot) => {
      const tpl = $("block-" + slot.dataset.block);
      if (tpl) slot.replaceChildren(tpl.content.cloneNode(true));
    });
  }

  const mailto = (subject, body) =>
    `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  function renderLinks() {
    document.querySelectorAll(".feedback-form").forEach((a) => (a.href = FEEDBACK_FORM_URL));
    document.querySelectorAll(".feedback-mail").forEach((a) => (a.href = mailto(`${APP_NAME}: feedback`,
      "What would you like to tell us? (something you like, something to improve, a thought to add, or anything else)\n\n")));
    const e = entryFor(todayKey());
    $("report-link").href = mailto(`${APP_NAME}: an issue`,
      `What happened?\n\n\nWhat did you expect?\n\n\n—\nDay: ${todayKey()} (#${e.id})\nDevice: ${navigator.userAgent}`);
  }

  // ---------- timeline of the paths ----------
  // When each path began, to scale within each era; long empty stretches are cut short.
  const TIMELINE = [
    [-800, "c. 800 BCE", "Indian Philosophy"],
    [-530, "6th century BCE", "Classical Greek Philosophy"],
    [-500, "c. 500 BCE", "Confucianism"],
    [-450, "5th century BCE", "Buddhist Philosophy"],
    [-350, "4th century BCE", "Taoism"],
    [-307, "307 BCE", "Epicureanism"],
    [-300, "c. 300 BCE", "Stoicism"],
    [1000, "c. 1000 CE", "Japanese Aesthetics"],
    [1050, "11th century", "Persian and Sufi Poetry"],
    [1340, "1340s", "Humanists and Essayists"],
    [1630, "1630s", "Enlightenment Ethics"],
    [1650, "1650s", "Existential Thought"],
  ];
  const GAP_YEARS = 400;   // a longer silence than this is drawn as a break
  const REM_PER_YEAR = 0.012;

  function renderTimeline() {
    const ol = $("timeline");
    ol.textContent = "";
    TIMELINE.forEach(([year, label, path], i) => {
      const gap = i ? year - TIMELINE[i - 1][0] : 0;
      if (gap > GAP_YEARS) {
        const br = document.createElement("li");
        br.className = "tl-break";
        br.innerHTML = `<span class="tl-mark" aria-hidden="true">//</span><span class="tl-gap"></span>`;
        br.querySelector(".tl-gap").textContent = `about ${Math.round(gap / 100) * 100} years`;
        ol.appendChild(br);
      }
      const li = document.createElement("li");
      li.className = "tl-item";
      li.style.marginTop = i && gap <= GAP_YEARS ? `${Math.min(4, Math.max(0.35, gap * REM_PER_YEAR))}rem` : "";
      li.innerHTML = `<span class="tl-year"></span><button type="button" class="tl-path" aria-haspopup="dialog"></button>`;
      li.querySelector(".tl-year").textContent = label;
      const b = li.querySelector(".tl-path");
      b.textContent = path;
      b.dataset.path = path;
      ol.appendChild(li);
    });
  }

  // ---------- gentle ending ----------
  // The app has an end: after a finished note or sit, it says goodbye for the day.
  function showClosing() {
    $("note-text").blur();
    $("closing-sit").hidden = $("closing-sit-dot").hidden = currentKey !== todayKey();
    $("closing-line").textContent = goodbyeLine();
    renderBackupNudge();
    $("closing").classList.remove("leaving");
    setOverlay($("closing"), true, $("closing-back"));
    // An open note closes only once the screen has fully covered the page, so the page
    // doesn't jump (shrinking the note moves the scroll) before the goodbye appears.
    clearTimeout(showClosing.collapse);
    if (!$("note").hidden) showClosing.collapse = setTimeout(() => setWriting(false), 1800);
  }

  // Fades out softly, back to the top of today.
  function hideClosing() {
    const el = $("closing");
    if (el.hidden || el.classList.contains("leaving")) return;
    el.classList.add("leaving");
    clearTimeout(showClosing.collapse);
    if (!$("note").hidden) setWriting(false);
    window.scrollTo(0, 0);
    setTimeout(() => { el.classList.remove("leaving"); setOverlay(el, false); }, 1200);
  }

  // A quiet, guilt-free count of days with a thought read. It only grows; it never resets.
  // A day counts once its page has been open for 15 seconds, or when a note is written.
  let countTimer = 0;
  function countAfterReading(key) {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
      if (currentKey === key && !document.hidden && !$("view-day").hidden) countDay(key);
    }, 15000);
  }

  function countDay(key) {
    let days = [];
    try { days = JSON.parse(store.get("days", "[]")) || []; } catch {}
    if (!days.includes(key)) { days.push(key); store.set("days", JSON.stringify(days)); }
  }

  function dayCount() {
    try { return (JSON.parse(store.get("days", "[]")) || []).length; } catch { return 0; }
  }

  // ---------- offline ----------
  async function renderOfflineStatus() {
    const say = (t) => document.querySelectorAll(".offline-status").forEach((el) => (el.textContent = t));
    if (NATIVE) return say("Ready: everything is already on your phone.");
    if (!("serviceWorker" in navigator) || !window.caches) return say("This browser can't keep the app offline.");
    try {
      // `ready` never settles where service workers are blocked, so give up after a few seconds.
      const timeout = new Promise((_, reject) => setTimeout(reject, 4000));
      await Promise.race([navigator.serviceWorker.ready, timeout]);
      const ready = await caches.match("calendar.json", { ignoreSearch: true });
      say(ready ? "Ready: you can switch off your connection." : "Preparing… keep the app open for a moment.");
    } catch {
      say("Offline mode is unavailable in this browser.");
    }
  }

  // ---------- routing ----------
  function route() {
    closeTerm();  // an open card never follows to another page
    const hash = location.hash.replace(/^#\/?/, "");
    let view = "day";
    if (hash === "journal") { view = "journal"; renderJournal(); }
    else if (hash === "about") { view = "about"; renderLinks(); renderOfflineStatus(); }
    else if (hash === "settings") {
      view = "settings";
      $("name-setting").value = store.get("name", "");
      renderEasySetting();
      renderKeepsake();
      renderLinks(); renderReminder(); renderOfflineStatus();
    }
    else if (hash === "terms") view = "terms";
    else {
      const m = hash.match(/^day\/(\d{4}-\d{2}-\d{2})$/);
      renderDay(m ? m[1] : todayKey());
    }
    if (view !== "day") { endReveal(); $("view-day").style.animation = ""; }  // normal fade-in again next time
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    if (view === "day") holdQuestion();
    if (view === "day" && !$("view-day").classList.contains("reveal")) scheduleHomeNote();
  }

  // The note under each thought opens on request and starts closed on every visit.
  // Its button stays put above it, so closing it is always one tap away.
  function showContext(open) {
    $("day-context").hidden = !open;
    $("context-toggle").setAttribute("aria-expanded", String(open));
    $("context-toggle").textContent = open ? "hide note" : "about this thought";
    updateHint();
  }

  // ---------- the question below the fold ----------
  // If not even the first line of the question fits above the bottom bar, the question
  // (with the actions under it) waits out of sight: a faint chevron invites a scroll, and
  // the question fades in as it comes into view. Otherwise it appears with the rest.
  const QUESTION_PARTS = ["#pause-2", "#view-day .question", "#memory", "#view-day .actions", "#note-preview"];
  let questionHeld = false, questionObserver = null;

  function holdQuestion(opts = {}) {
    const view = $("view-day");
    if (view.hidden) return;
    const prompt = $("day-prompt");
    const barTop = document.querySelector(".nav").getBoundingClientRect().top;
    const lineH = parseFloat(getComputedStyle(prompt).lineHeight) || 24;
    const fits = prompt.getBoundingClientRect().top + lineH <= barTop - 8;
    if (opts.fade && questionHeld && fits) return showQuestion();  // fades in, never pops
    questionHeld = !fits;
    holdQuestion.pending = false;
    // Hide at once (no fade-out), so the question never flashes before stepping aside.
    const parts = QUESTION_PARTS.map((q) => view.querySelector(q));
    parts.forEach((el) => { el.style.transition = "none"; el.classList.toggle("held", questionHeld); });
    void view.offsetHeight;
    parts.forEach((el) => el.style.removeProperty("transition"));
    if (questionObserver) questionObserver.disconnect();
    if (questionHeld) {
      // Same rule as above: the question appears once its first line has come up above
      // the bottom bar, never while the opening reveal is still running.
      const below = Math.round(window.innerHeight - barTop + lineH + 8);
      questionObserver = new IntersectionObserver((list) => {
        if (!list.some((x) => x.isIntersecting)) return;
        if ($("view-day").classList.contains("reveal")) holdQuestion.pending = true;
        else showQuestion();
      }, { rootMargin: `0px 0px -${below}px 0px` });
      questionObserver.observe(prompt);
    }
    updateHint();
  }

  function showQuestion() {
    if (!questionHeld) return;
    questionHeld = false;
    if (questionObserver) questionObserver.disconnect();
    QUESTION_PARTS.forEach((q) => $("view-day").querySelector(q).classList.remove("held"));
    updateHint();
  }

  // The chevron shows while the question waits, once the opening reveal is over and
  // as long as the note isn't open (it would sit on top of it).
  function updateHint() {
    const view = $("view-day");
    const show = questionHeld && !view.hidden && !view.classList.contains("reveal") && $("day-context").hidden;
    $("more-below").classList.toggle("show", show);
    document.querySelector(".nav").classList.toggle("has-hint", show);
  }

  // ---------- keeping it on the home screen ----------
  // Read in a phone browser rather than from its home-screen icon, the app says once how to
  // add it there (iPhone) or offers the browser's own install (Android), after the day's
  // thought is in, never during it. The check is the browser's own description of itself:
  // nothing leaves the phone. Never shown in the Android app or once installed.
  const UA = navigator.userAgent;
  const TEST_DEVICE = TEST && TEST.get("device");
  const IOS = TEST_DEVICE ? TEST_DEVICE === "ios" : /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const ANDROID = TEST_DEVICE ? TEST_DEVICE === "android" : /Android/.test(UA);
  const INSTALLED = !TEST_DEVICE && (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true);
  const SHARE_ICON = '<svg class="share-icon" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"/></svg>';
  let installPrompt = TEST && TEST.get("prompt") ? { prompt() {}, userChoice: Promise.resolve({ outcome: "accepted" }) } : null;
  let homeNoteTimer = 0;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
  window.addEventListener("appinstalled", () => closeHomeNote());

  function scheduleHomeNote() {
    clearTimeout(homeNoteTimer);
    homeNoteTimer = setTimeout(showHomeNote, 4000);
  }
  function showHomeNote() {
    const view = $("view-day");
    if (NATIVE || INSTALLED || !(IOS || ANDROID) || store.get("homeNote") || !store.get("welcomed")) return;
    if (view.hidden || view.classList.contains("reveal") || !$("closing").hidden || silence) return;
    const install = ANDROID && !!installPrompt;
    let steps;
    if (IOS) {
      steps = /CriOS/.test(UA) ? `Tap the Share button ${SHARE_ICON} in the address bar, then <b>Add to Home Screen</b>.`
        : /FxiOS/.test(UA) ? `Open the menu, tap <b>Share</b>, then <b>Add to Home Screen</b>.`
        : `Tap the Share button ${SHARE_ICON} (in the ⋯ menu if you don't see it), then <b>Add to Home Screen</b>.`;
    } else {
      steps = install ? "" : "Open the browser menu (⋮), then <b>Install app</b> or <b>Add to Home screen</b>.";
    }
    $("home-note-title").textContent = install ? "Install The Thinking Place" : "Keep The Thinking Place on your home screen";
    $("home-note-text").innerHTML = (steps ? steps + " " : "") +
      (IOS ? "It then opens like an app, full screen, and your notes are kept safely."
        : `It ${steps ? "then " : ""}opens like an app, from its own icon, and works offline.`);
    $("home-note-install").hidden = $("home-note-dot").hidden = !install;
    $("home-note-close").textContent = install ? "not now" : "got it";
    $("home-note").hidden = false;
    requestAnimationFrame(() => $("home-note").classList.add("show"));
  }
  function closeHomeNote() {
    store.set("homeNote", "done");  // once only
    const el = $("home-note");
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 400);
  }
  async function installApp() {
    const p = installPrompt;
    installPrompt = null;
    closeHomeNote();
    if (p) { p.prompt(); await p.userChoice.catch(() => {}); }
  }

  // ---------- Android back button ----------
  // Closes whatever is open first, then goes back to today, then leaves the app.
  function onBack() {
    if (!$("welcome").hidden) return;
    if (!$("term-card").hidden) return closeTerm();
    if (!$("picker").hidden) return closePicker();
    if (silence) return finishSilence();
    if (!$("closing").hidden) return hideClosing();
    if (!$("note").hidden) return setWriting(false);
    if (!$("home-note").hidden) return closeHomeNote();
    const hash = location.hash.replace(/^#\/?/, "");
    if (hash === "terms") { location.hash = "#/about"; return; }
    if (hash) { location.hash = "#/"; return; }
    const App = plugin("App");
    if (App) App.minimizeApp();
  }

  // ---------- wire up ----------
  function bind() {
    $("more-below").addEventListener("click", () => {
      showQuestion();
      document.querySelector("#view-day .question").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // Re-measure when the screen changes size (keyboard, rotation), but not during the
    // opening reveal: that is settled when it ends.
    window.addEventListener("resize", () => {
      if (questionHeld && !$("view-day").classList.contains("reveal")) holdQuestion({ fade: true });
    });
    $("context-toggle").addEventListener("click", () => showContext($("day-context").hidden));
    $("open-note").addEventListener("click", () => setWriting($("note").hidden));
    $("note-edit").addEventListener("click", () => setWriting(true));
    $("note-text").addEventListener("input", onNoteInput);
    $("share").addEventListener("click", share);
    $("back-to-today").addEventListener("click", () => (location.hash = "#/"));
    $("terms-back").addEventListener("click", () => (location.hash = "#/about"));

    $("open-silence").addEventListener("click", openSilence);
    $("close-silence").addEventListener("click", finishSilence);
    $("sit-write").addEventListener("click", () => { finishSilence(); setWriting(true); });
    $("sit-share").addEventListener("click", share);
    $("sit-finish").addEventListener("click", sitGoodbye);
    $("silence").addEventListener("click", (ev) => {
      if ($("silence").classList.contains("bye") && !ev.target.closest("button")) leaveSilence();
    });
    $("note-done").addEventListener("click", () => { flushNote(); showClosing(); });
    // Straight from the goodbye into sit and think: the sitting screen fades in on top,
    // and the goodbye is removed behind it once covered, so today never flashes between.
    $("closing-sit").addEventListener("click", () => {
      clearTimeout(showClosing.collapse);
      openSilence();
      setTimeout(() => {
        $("closing").hidden = true;
        if (!$("note").hidden) setWriting(false);
      }, 1300);
    });

    $("closing-back").addEventListener("click", hideClosing);
    $("closing-share").addEventListener("click", share);
    // Tapping anywhere outside the links closes the moment and returns to the top of today.
    $("closing").addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      hideClosing();
    });

    document.querySelectorAll(".backup-now").forEach((b) => b.addEventListener("click", () => exportNotes(b)));
    document.querySelectorAll(".backup-later").forEach((b) => b.addEventListener("click", snoozeBackup));

    $("home-note-close").addEventListener("click", closeHomeNote);
    $("home-note-install").addEventListener("click", installApp);
    $("tour-next").addEventListener("click", () => showTourStep(tourStep + 1));
    $("tour-skip").addEventListener("click", () => showTourStep(99));

    document.addEventListener("click", (ev) => {
      const term = ev.target.closest(".term, .map-dot, .tl-path");
      if (term) {
        ev.preventDefault();
        if (openTerm.from === term && !$("term-card").hidden) closeTerm();
        else if (term.classList.contains("map-dot")) openPlace(term);
        else if (term.classList.contains("tl-path")) openPath(term);
        else openTerm(term);
        return;
      }
      if (!ev.target.closest("#term-card")) closeTerm();
    });
    $("term-close").addEventListener("click", closeTerm);
    // Cards move with the page, so a long one can be scrolled to its end; only a tap
    // outside (or close) shuts it.
    // Phones resize the page while scrolling (the address bar slides away): close the card
    // only when the width changes, e.g. when the phone turns.
    let lastWidth = window.innerWidth;
    window.addEventListener("resize", () => { if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; closeTerm(); } });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("term-card").hidden) closeTerm();
      else if (!$("picker").hidden) closePicker();
      else if (silence) finishSilence();
    });

    document.querySelectorAll("[data-theme-choice]").forEach((b) =>
      b.addEventListener("click", () => { store.set("theme", b.dataset.themeChoice); applyTheme(b.dataset.themeChoice); }));
    document.querySelectorAll("[data-minutes]").forEach((b) =>
      b.addEventListener("click", () => setMinutes(b.dataset.minutes)));
    document.querySelectorAll("[data-breath]").forEach((b) =>
      b.addEventListener("click", () => setBreath(b.dataset.breath)));
    document.querySelectorAll("[data-sit-mode]").forEach((b) =>
      b.addEventListener("click", () => setSitMode(b.dataset.sitMode)));
    document.querySelectorAll("[data-sit-now]").forEach((b) =>
      b.addEventListener("click", () => setSitNow(b.dataset.sitNow)));
    document.querySelectorAll("[data-sound]").forEach((b) =>
      b.addEventListener("click", () => setSound(b.dataset.sound)));
    document.querySelectorAll("[data-backup]").forEach((b) =>
      b.addEventListener("click", () => setBackupEvery(b.dataset.backup)));
    $("export-notes").addEventListener("click", () => exportNotes($("export-notes")));
    $("import-notes").addEventListener("click", () => $("import-file").click());
    document.querySelectorAll("[data-reminder-freq]").forEach((b) => b.addEventListener("click", () => setReminder({ freq: b.dataset.reminderFreq })));
    document.querySelectorAll("[data-reminder-hour]").forEach((b) => b.addEventListener("click", () => setReminder({ hour: +b.dataset.reminderHour })));
    document.querySelectorAll("[data-reminder-day]").forEach((b) => b.addEventListener("click", () => setReminder({ weekday: +b.dataset.reminderDay })));
    $("import-file").addEventListener("change", (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (file) importNotes(file);
      ev.target.value = "";
    });
    $("name-setting").addEventListener("change", (ev) => saveName(ev.target.value));
    $("clear-notes").addEventListener("click", clearNotes);
    document.querySelectorAll("[data-easy]").forEach((b) => b.addEventListener("click", () => setEasy(b.dataset.easy === "on")));
    document.querySelectorAll(".keepsake-make").forEach((b) => b.addEventListener("click", () => makeKeepsake(b)));

    document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => openPicker(b)));
    $("picker-back").addEventListener("click", closePicker);
    $("filter-saved").addEventListener("click", () => setJournalFilter({ saved: !journal.saved }));
    $("save").addEventListener("click", toggleSaved);
    document.querySelectorAll("[data-text-size]").forEach((b) =>
      b.addEventListener("click", () => setTextSize(b.dataset.textSize)));
    $("journal-more").addEventListener("click", () => { journal.shown += PAGE_DAYS; renderJournal(); });

    const App = plugin("App");
    if (App) App.addListener("backButton", onBack);

    window.addEventListener("hashchange", route);
    // Roll over to the new day if the app is left open past midnight.
    let lastDay = todayKey();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && todayKey() !== lastDay) { lastDay = todayKey(); route(); }
    });
  }

  // The launch screen stays for a moment on a fresh start, then fades into today's thought.
  // Within a session (a refresh, or coming back to the app) it steps aside at once.
  function endLaunch(revealDelay) {
    const el = $("launch");
    if (!el) { startReveal(0); return; }
    let seen = false;
    try { seen = sessionStorage.getItem("reflect:launched") === "1"; sessionStorage.setItem("reflect:launched", "1"); } catch {}
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = seen ? 0 : Math.max(0, (calm ? 600 : 2000) - performance.now());
    setTimeout(() => {
      el.classList.add("done");
      if (revealDelay !== null) startReveal(seen ? 0 : revealDelay);
      setTimeout(() => el.remove(), seen || calm ? 0 : 900);
    }, wait);
  }

  // The first opening of the day is slow on purpose, in three blocks: greeting and date,
  // then the thought with its source, then the question and the actions (about 4 seconds
  // in all). Later openings that day simply fade in. A tap anywhere shows everything at once.
  const STEP_S = 1.1, RISE_S = 1.8;
  function prepareReveal() {
    const view = $("view-day");
    if (view.hidden || store.get("revealed") === todayKey()) return false;
    holdQuestion();
    assignSteps();
    view.style.setProperty("--step-s", STEP_S + "s");
    view.style.setProperty("--rise-s", RISE_S + "s");
    // Hide everything at once: the question block has its own fade (for scrolling into
    // view), which would otherwise let it linger while the rest is already hidden.
    const parts = QUESTION_PARTS.map((q) => view.querySelector(q));
    parts.forEach((el) => (el.style.transition = "none"));
    view.classList.add("reveal");
    void view.offsetHeight;
    parts.forEach((el) => el.style.removeProperty("transition"));
    store.set("revealed", todayKey());
    return true;
  }

  // Which block comes in at which step. A question waiting below the fold stays out of it.
  function assignSteps() {
    const view = $("view-day");
    view.querySelectorAll("[data-step]").forEach((el) => { delete el.dataset.step; el.style.removeProperty("--step"); });
    const groups = [["#greeting", "#day-date", "#teaser"],
      ["#pause-1", "#day-path", ".passage", "#view-day .source", "#context-toggle"],
      ["#pause-2", ".question-label", "#day-prompt", "#memory", "#view-day .actions", "#note-preview"]];
    let step = 0;
    for (const group of groups) {
      const els = group.map((q) => view.querySelector(q))
        .filter((el) => el && !el.hidden && !el.classList.contains("held") && !el.closest(".held"));
      if (!els.length) continue;
      for (const el of els) { el.dataset.step = ""; el.style.setProperty("--step", step); }
      step++;
    }
    prepareReveal.steps = step;
  }

  // Resolves once the screen has stopped changing size (the keyboard closing), at most ~1s.
  function afterResizeSettles() {
    return new Promise((resolve) => {
      let timer;
      const done = () => { window.removeEventListener("resize", wait); clearTimeout(cap); resolve(); };
      const wait = () => { clearTimeout(timer); timer = setTimeout(done, 250); };
      const cap = setTimeout(done, 1000);
      window.addEventListener("resize", wait);
      timer = setTimeout(done, 400);  // give the keyboard time to start closing
    });
  }

  let revealTimers = [];
  function startReveal(delay) {
    const view = $("view-day");
    if (!view.classList.contains("reveal")) return;
    const skip = () => endReveal();
    revealTimers.push(setTimeout(() => {
      view.classList.add("go");
      document.addEventListener("pointerdown", skip, { once: true });
      revealTimers.push(setTimeout(skip, ((prepareReveal.steps - 1) * STEP_S + RISE_S) * 1000));
    }, delay));
  }

  // Once everything is in (or on a tap), drop the markers so later visits render normally.
  function endReveal() {
    const view = $("view-day");
    revealTimers.forEach(clearTimeout);
    revealTimers = [];
    if (!view.classList.contains("reveal")) return;
    view.style.animation = "none";  // so the page's own fade-in doesn't replay now
    view.classList.remove("reveal", "go");
    view.querySelectorAll("[data-step]").forEach((el) => { delete el.dataset.step; el.style.removeProperty("--step"); });
    if (holdQuestion.pending) { holdQuestion.pending = false; showQuestion(); }
    else if (questionHeld) holdQuestion({ fade: true });  // the screen may have grown meanwhile
    updateHint();
    scheduleHomeNote();
  }

  async function init() {
    setTimeout(() => $("launch")?.classList.add("done"), 5000);  // never leave it up if loading fails
    applyTheme(store.get("theme", "auto"));
    setMinutes(store.get("minutes", "3"));
    setSitMode(sitMode());
    setBreath(store.get("breath", "5-5"));
    setSound(store.get("sound", "off"));
    setBackupEvery(store.get("backupEvery", "30"));
    setTextSize(store.get("textSize", "1"));
    fillBlocks();
    const [e, c] = await Promise.all([
      fetch("entries.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("calendar.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
    entries = e;
    entriesById = Object.fromEntries(entries.map((x) => [x.id, x]));
    calendar = c;
    upgradeNotes();
    if (store.get("welcomed") && !store.get("installed")) store.set("installed", todayKey());
    try { glossary = await fetch("glossary.json", { cache: "no-cache" }).then((r) => r.json()); } catch {}
    fillFilters();
    renderTimeline();
    bind();
    route();
    const welcoming = maybeWelcome();
    const revealing = !welcoming && prepareReveal();
    endLaunch(revealing ? 400 : null);
    if (!welcoming) applyReminder(!store.get("reminderAsked"));  // ask once, never nag
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  init();
})();
