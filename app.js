// The Thinking Place — one thought a day.
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

  // Easing in lives inside the first five days: its last day is the window's last day.
  const easyLastDay = () => addDays(store.get("installed", todayKey()), EASY_DAYS - 1);
  function startEasy() {
    const today = todayKey(), left = unusedEasy();
    const daysLeft = Math.max(1, daysBetween(today, easyLastDay()) + 1);
    const ids = (left && left.length ? left : pickEasy(today)).slice(0, daysLeft);
    store.set("easy", JSON.stringify([...easySegments(), { start: today, ids }]));
  }

  function renderEasySetting() {
    const today = todayKey(), a = easyAt(today), left = unusedEasy();
    const offer = !a && inFirstDays() && (left === null || left.length > 0);
    $("easy-setting").hidden = !a && !offer;
    checkChoice("[data-easy]", "easy", a ? "on" : "off");
    // One date in both texts: the last day of the first five. No number of days on purpose.
    const until = formatDate(easyLastDay());
    if (a) $("easy-status").textContent = `Easier thoughts first, until ${until}.`;
    else if (offer) $("easy-status").textContent = `Want a softer start? Until ${until}, you can switch to easier thoughts first.`;
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
    if (text.trim()) { countDay(key); store.set("noteChanged", todayKey()); askToKeep(); }
    const [main, other] = keep;
    return store.set("note:" + key, JSON.stringify(other ? { ...main, other } : main));
  }

  // In a browser, ask once, with the first note, that the browser never clears this site's
  // data on its own when space runs low. A safety net, not a guarantee; the Android app
  // doesn't need it. Firefox may ask the reader, which makes sense right after writing.
  function askToKeep() {
    if (NATIVE || store.get("persistAsked") || !navigator.storage || !navigator.storage.persist) return;
    store.set("persistAsked", "1");
    navigator.storage.persisted().then((yes) => yes || navigator.storage.persist()).catch(() => {});
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
    growNote();
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
    $("day-context-text").textContent = e.about || e.context;
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
    $("back-to-today").textContent = dayFromPage ? "← back" : "← today";
    renderQuestionLine(key);
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
    if (open) { showQuestion(); growNote(); $("note-text").focus(); }
  }

  // The note box is as tall as its text (Safari can't do this in CSS yet), up to the space
  // visible above the keyboard less three lines; past that it scrolls inside, where browsers
  // keep the line being typed in view. The text is measured in a hidden copy of the box, so
  // the real one never shrinks while typing (that made the page jump). When the box first
  // reaches its cap, the page scrolls once to show it whole; after that only the box scrolls.
  let noteMirror = null, noteCapped = false;
  function growNote() {
    const ta = $("note-text");
    if (ta.offsetParent === null) return;
    if (!noteMirror) {
      noteMirror = document.createElement("textarea");
      noteMirror.className = "note-mirror";
      noteMirror.tabIndex = -1;
      noteMirror.setAttribute("aria-hidden", "true");
      ta.after(noteMirror);
    }
    noteMirror.style.width = ta.offsetWidth + "px";
    noteMirror.value = ta.value;
    const cs = getComputedStyle(ta), em = parseFloat(cs.fontSize) || 16;
    const visible = window.visualViewport ? visualViewport.height : window.innerHeight;
    const min = parseFloat(cs.minHeight) || 0, cap = Math.max(min, visible - 5 * em);
    const full = noteMirror.scrollHeight + 2, capped = full > cap;
    const height = Math.round(Math.min(Math.max(full, min), cap));
    if (Math.abs(ta.offsetHeight - height) > 1) ta.style.height = height + "px";
    ta.style.overflowY = capped ? "auto" : "hidden";
    if (capped && !noteCapped && document.activeElement === ta) {
      const top = ta.getBoundingClientRect().top - (window.visualViewport ? visualViewport.offsetTop : 0);
      window.scrollBy(0, top - em);
    }
    noteCapped = capped;
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

  // "tell a friend" (About): just a link to the phone's share sheet, never a prompt. It
  // points to the website, which sends each device to the right place.
  async function tellFriend() {
    const text = `${APP_NAME}: one short passage of philosophy a day. https://${SITE}`;
    const Share = plugin("Share");
    if (Share || navigator.share) {
      try { await (Share ? Share.share({ text }) : navigator.share({ text })); } catch {}  // closed: nothing to say
      return;
    }
    toast(await copyText(text) ? "Copied. Paste it anywhere you like." : "Couldn't copy on this device.");
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
  // ten at a time, optionally narrowed to some paths and some themes.
  const journal = { path: [], theme: [], saved: false, questions: false, shown: PAGE_DAYS };
  const FILTER_ALL = { path: "all paths", theme: "all themes" };
  const FILTER_SOME = { path: "paths", theme: "themes" };
  let filterLists = { path: [], theme: [] };

  function fillFilters() {
    const live = entries.filter((e) => !e.retired);
    filterLists = { path: [...new Set(live.map((e) => e.path))], theme: [...new Set(live.flatMap((e) => e.themes))].sort() };
  }

  // A short list under the filter (at most two thirds of the screen), instead of the
  // phone's full-screen picker. Several can be ticked; "all" clears them and closes.
  // A tap outside or the back button closes it.
  function openPicker(btn) {
    const kind = btn.dataset.filter, ul = $("picker");
    ul.textContent = "";
    ul.setAttribute("aria-multiselectable", "true");
    const mark = () => {
      for (const li of ul.children) li.setAttribute("aria-selected", String(li.dataset.value ? journal[kind].includes(li.dataset.value) : !journal[kind].length));
    };
    for (const [value, label] of [["", FILTER_ALL[kind]], ...filterLists[kind].map((v) => [v, v])]) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.dataset.value = value;
      li.tabIndex = 0;
      li.textContent = label;
      const pick = () => {
        if (!value) { closePicker(); return setJournalFilter({ [kind]: [] }); }
        const now = journal[kind];
        setJournalFilter({ [kind]: now.includes(value) ? now.filter((v) => v !== value) : [...now, value] });
        mark();
      };
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      ul.appendChild(li);
    }
    mark();
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
      return (!journal.path.length || journal.path.includes(e.path)) &&
        (!journal.theme.length || (e.themes || []).some((t) => journal.theme.includes(t))) &&
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
      const picked = journal[kind];
      btn.textContent = !picked.length ? FILTER_ALL[kind] : picked.length === 1 ? picked[0] : `${picked.length} ${FILTER_SOME[kind]}`;
      btn.classList.toggle("active", picked.length > 0);
    }
    // Monthly questions sit among the days, on the day each appeared (above that day's thought);
    // their filter shows only them. The filter appears once there is one.
    const today = todayKey(), qMonths = appearedQuestions(today);
    // One path or one theme picked, with a Library page: "More about Stoicism →".
    const one = (kind, find) => !journal.questions && journal[kind].length === 1 ? library.pages.find((p) => find(p, journal[kind][0]) && pageShown(p.id)) : null;
    const topics = [one("path", (p, v) => p.type === "path" && p.title === v), one("theme", (p, v) => p.type === "topic" && p.theme === v)].filter(Boolean);
    $("journal-topic").hidden = !topics.length;
    $("journal-topic").replaceChildren(...topics.map((p) => pageLink(p.id, `More about ${p.type === "path" ? p.title : pageTitle(p).toLowerCase()} →`)));
    if (!qMonths.length) journal.questions = false;
    $("filter-questions").hidden = $("filter-questions-dot").hidden = !qMonths.length;
    $("filter-questions").classList.toggle("active", journal.questions);
    $("filter-questions").setAttribute("aria-pressed", String(journal.questions));
    const items = journal.questions ? [] : journalDays().map((key) => ({ key }));
    if (journal.questions || (!journal.path.length && !journal.theme.length && !journal.saved))
      for (const m of qMonths) items.push({ key: questionAppeared(m, today), m });
    items.sort((a, b) => (a.key !== b.key ? (a.key < b.key ? 1 : -1) : a.m ? -1 : 1));
    const list = $("journal-list");
    list.textContent = "";
    for (const item of items.slice(0, journal.shown)) {
      if (item.m) { list.appendChild(questionItem(item)); continue; }
      const key = item.key, e = entryShown(key);
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
    $("journal-empty").hidden = items.length > 0;
    $("journal-empty").textContent = journal.saved ? "Nothing saved yet. Tap “save” under a thought to keep it here." : "No past thoughts here yet.";
    $("journal-more").hidden = items.length <= journal.shown;
  }

  // A monthly question in Past thoughts: its day, the question, and the reader's pick and note.
  function questionItem({ key, m }) {
    const d = questionData(m), li = document.createElement("li"), a = document.createElement("a");
    a.href = "#/question/" + m;
    a.append(make("div", "j-date", `${formatDate(key)} · A question for ${monthName(m)}`), make("p", "j-text", questions[m].question));
    if (d.pick) a.append(make("p", "j-pick", `Closest to: ${d.pick}`));
    if ((d.note || "").trim()) a.append(make("p", "j-note", d.note.trim()));
    li.appendChild(a);
    return li;
  }

  function setJournalFilter(change) {
    if (!("questions" in change)) change = { ...change, questions: false };  // the other filters are for thoughts
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
    const qMonths = store.keys("question:").map((k) => k.slice(9)).sort();
    if (!keys.length && !read.length && !qMonths.length) return flash(btn, "nothing yet");
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
    // Then the monthly questions: the pick and the note, with the date.
    for (const m of qMonths) {
      const d = questionData(m), q = questions[m];
      blocks.push(`Monthly question ${m} (${d.date || m}) — A question for ${monthName(m)}\n` +
        (q ? `“${q.question}”\n` : "") + (d.pick ? `Closest to: ${d.pick}\n` : "") +
        ((d.note || "").trim() ? `\n${d.note.trim()}\n` : ""));
    }
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
        // A monthly question: the pick (if none here yet) and the note, added like any note.
        const mq = block.trim().match(/^Monthly question (\d{4}-\d{2}) \((\d{4}-\d{2}-\d{2})?/);
        if (mq) {
          const body = block.trim(), split = body.indexOf("\n\n"), head = split < 0 ? body : body.slice(0, split);
          const pick = (head.match(/^Closest to: (.+)$/m) || [])[1], note = split < 0 ? "" : body.slice(split + 2).trim();
          const had = questionData(mq[1]), change = {};
          if (pick && !had.pick) change.pick = pick;
          const old = (had.note || "").trim();
          if (note && old !== note && !old.includes(note)) change.note = old ? old + "\n\n" + note : note;
          if (Object.keys(change).length) {
            saveQuestion(mq[1], Object.assign(change, had.date ? {} : { date: mq[2] || todayKey() }));
            added++;
          }
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
    store.keys("question:").forEach((k) => store.remove(k));  // monthly question picks and notes too
    flash($("clear-notes"), "erased");
  }

  // ---------- monthly questions ----------
  // Once a month, one question that 2-4 of that month's thoughts answer differently (content in
  // questions.json, built and checked from content/monthly-questions.xlsx). It appears on the
  // month's last day and stays at the top of Today for a week, then lives in Past thoughts.
  // Every voice shows, whether or not the reader opened the app that day. The pick and the note
  // stay on the phone, saved per month. Only "Ready" months show; test APKs show drafts too,
  // and the next one at once.
  const QUESTION_PREVIEW = false;  // make_apk.sh turns this on in test APKs, never in the Play bundle
  const questionPreview = () => QUESTION_PREVIEW || !!(TEST && TEST.get("question"));
  const NUMBER_WORDS = ["", "One", "Two", "Three", "Four", "Five"];
  let questions = {}, questionMonth = null, questionFrom = "day", lastView = "day";
  const make = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const monthName = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 15))
    .toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  function questionDay(m) {  // the month's last day
    const y = +m.slice(0, 4), mo = +m.slice(5, 7);
    return addDays(`${mo === 12 ? y + 1 : y}-${String(mo % 12 + 1).padStart(2, "0")}-01`, -1);
  }
  const questionShown = (m) => !!questions[m] && (questions[m].status === "Ready" || questionPreview());
  function currentQuestion(today) {
    const months = Object.keys(questions).filter(questionShown).sort();
    const live = months.find((m) => today >= questionDay(m) && today <= addDays(questionDay(m), 6));
    if (live || !questionPreview()) return live || null;
    return months.find((m) => addDays(questionDay(m), 6) >= today) || null;
  }
  function questionData(m) {
    try { return JSON.parse(store.get("question:" + m, "null")) || {}; } catch { return {}; }
  }
  function saveQuestion(m, change) {
    const d = Object.assign(questionData(m), change);
    d.date = d.date || todayKey();
    if ((d.note || "").trim()) askToKeep();
    if (!d.pick && !(d.note || "").trim()) { store.remove("question:" + m); return true; }
    return store.set("question:" + m, JSON.stringify(d));
  }

  // When a month's question appeared (its last day). Test APKs show the current one at once,
  // so it is listed from today.
  function questionAppeared(m, today) {
    if (questionDay(m) <= today) return questionDay(m);
    return questionPreview() && m === currentQuestion(today) ? today : null;
  }
  const appearedQuestions = (today) => Object.keys(questions).filter((m) => questionShown(m) && questionAppeared(m, today));

  function renderQuestionLine(key) {
    const m = key === todayKey() ? currentQuestion(key) : null;
    $("mq-line").hidden = !m;
    if (!m) return;
    const q = questions[m], n = q.voices.length;
    $("mq-line").href = "#/question/" + m;
    $("mq-line-label").textContent = `A question for ${monthName(m)}`;
    $("mq-line-question").textContent = q.question;
    $("mq-line-go").textContent = `${NUMBER_WORDS[n] || n} thinkers disagree. Where do you stand?`;
  }

  // One voice: its path, name, our one-line summary, its own words, then the passage and the
  // reader's note on it (from any day that month), both folded.
  function voiceItem(m, v, withNote) {
    const e = entriesById[v.id], li = make("li", "mq-voice"), links = make("div", "mq-voice-links");
    // A voice's name opens its Library page.
    const page = library.pages.find((p) => (p.type === "thinker" || p.type === "text") && (p.thoughts || []).includes(v.id) && pageShown(p.id));
    const name = make("p", "mq-voice-name");
    if (page) name.append(pageLink(page.id, v.voice, "mq-voice-link")); else name.textContent = v.voice;
    li.append(make("p", "mq-voice-path", e.path), name,
      make("p", "mq-voice-line", v.line), make("p", "mq-voice-words", `“${v.words}”`), links);
    const fold = (label, box) => {
      const b = make("button", "mq-fold", label);
      b.type = "button";
      b.setAttribute("aria-expanded", "false");
      box.hidden = true;
      b.addEventListener("click", () => { box.hidden = !box.hidden; b.setAttribute("aria-expanded", String(!box.hidden)); });
      links.append(b);
      li.append(box);
    };
    if (v.whole) links.append(make("p", "mq-source-small", e.source));  // nothing more to read
    else {
      const passage = make("div", "mq-folded");
      passage.append(make("p", "mq-passage", e.text), make("p", "mq-source", e.source));
      fold("read the passage", passage);
    }
    if (withNote) {
      const day = store.keys("note:").map((k) => k.slice(5)).sort()
        .find((d) => d.startsWith(m) && ((noteAbout(d, v.id) || {}).text || "").trim());
      if (day) {
        const box = make("div", "mq-folded");
        box.append(make("p", "mq-past-note", noteAbout(day, v.id).text.trim()));
        fold("your note", box);
      }
    }
    return li;
  }

  function renderQuestion(m) {
    const q = questions[m], name = monthName(m), n = q.voices.length;
    questionMonth = m;
    $("mq-back").textContent = questionFrom === "journal" ? "← past thoughts" : "← today";
    $("mq-label").textContent = `A question for ${name}`;
    $("mq-question").textContent = q.question;
    $("mq-intro").textContent = `${NUMBER_WORDS[n] || n} thinkers from ${name}'s thoughts answer it differently. Read them, then see where you stand.`;
    $("mq-voices").replaceChildren(...q.voices.map((v) => voiceItem(m, v, true)));
    $("mq-ask").textContent = q.question;
    $("mq-way-in").textContent = q.wayIn;
    $("mq-note-status").textContent = "";
    $("mq-picks").replaceChildren(...q.voices.map((v) => v.voice).map((c) => {
      const b = make("button", "", c);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.dataset.pick = c;
      return b;
    }));
    const saved = questionData(m);
    showPick(m, saved.pick);
    $("mq-note").value = saved.note || "";
  }

  // After a pick (optional): the voice furthest from it, in its own words. Never a word written
  // in a thinker's voice. (The month's sharpest pair stays in the data, unshown, for later.)
  function showPick(m, pick) {
    const q = questions[m], byName = Object.fromEntries(q.voices.map((v) => [v.voice, v]));
    document.querySelectorAll("#mq-picks [data-pick]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.pick === pick)));
    $("mq-pushback").replaceChildren();
    const v = byName[pick];
    if (!v) return;
    const wrap = make("div", "mq-pushback"), list = make("ol", "mq-voices"), other = byName[v.pushedBy];
    wrap.append(make("h3", "", `Furthest from ${v.voice}: ${other.voice}`),
      make("p", "mq-why", `Of this month's voices, ${other.voice} disagrees most with ${v.voice}. See if it changes your mind.`));
    list.append(voiceItem(m, other, false));
    wrap.append(list);
    $("mq-pushback").append(wrap);
  }

  // ---------- the Library ----------
  // Pages about the thinkers, texts, paths, eras and themes behind each day's thought (pages.json,
  // built and checked from content/pages.xlsx). The words are the content team's, shown as written:
  // light Markdown only (bold, italic, bullets, paragraphs), never rewritten here. Only "Ready" pages
  // show; test APKs show drafts too. Every page is open to everyone: no locks, no "met" marks.
  const LIBRARY_PREVIEW = false;  // make_apk.sh turns this on in test APKs, never in the Play bundle
  const libraryPreview = () => LIBRARY_PREVIEW || !!(TEST && TEST.get("library"));
  let library = { pages: [], related: {}, links: {}, cards: {}, glossaryLinks: {} }, pageById = {}, routeCount = 0, dayFromPage = false, libraryAnchor = null,
    libSection = null, mapFromWorld = false;
  const pageShown = (id) => !!pageById[id] && (pageById[id].status === "Ready" || libraryPreview());
  const KIND = { thinker: "Thinker", text: "Text", path: "Path", topic: "Theme", era: "Era", essay: "" };
  const LIB_SECTIONS = [["time", "In their time", "Where history meets philosophy"],
    ["paths", "Paths", "The twelve schools of thought"], ["people", "Thinkers and texts", "From A to Z"],
    ["topics", "Themes and topics", "The big questions, across traditions"], ["maps", "Maps and timelines", "Where and when they lived"]];
  // Maps and timelines: today's About maps and timeline, moved here (more come later).
  const LIB_MAPS = [["world", "The world", "Every place our thinkers lived and wrote"],
    ["europe", "Europe and the Mediterranean, closer", "From Athens and Rome to Paris and London"],
    ["asia", "Asia, closer", "China, Japan, India and Persia"],
    ["paths-in-time", "The paths through time", "Each path from when it began"],
    ["thinkers-in-time", "The thinkers through time", "Every thinker on one line, from the Upanishads to Simone Weil"]];
  const libraryOn = () => library.pages.some((p) => pageShown(p.id));
  const pageTitle = (p) => p.title.replace(/ \(society\)$/, "");
  const PATH_ORDER = ["Stoicism", "Epicureanism", "Classical Greek Philosophy", "Enlightenment Ethics", "Existential Thought",
    "Humanists and Essayists", "Buddhist Philosophy", "Indian Philosophy", "Taoism", "Confucianism", "Japanese Aesthetics",
    "Persian and Sufi Poetry"];  // as on the About timeline
  const pageOf = (type, title) => library.pages.find((p) => p.type === type && p.title === title && pageShown(p.id));
  const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  // A to Z by surname: Kant under K, du Châtelet under C, the texts by their main word.
  const SORT_AS = { "Émilie du Châtelet": "Chatelet", "Jean de La Bruyère": "La Bruyere", "Kamo no Chōmei": "Chomei",
    "Ibn Arabi": "Ibn Arabi", "Omar Khayyam": "Khayyam", "Sei Shōnagon": "Shonagon", "Questions of King Milinda": "Milinda",
    "Al-Ghazali": "Ghazali", "Bhagavad Gita": "Bhagavad Gita", "Okakura Kakuzō": "Okakura" };  // family name first
  function sortKey(p) {
    const t = p.title.replace(/^The /, "");
    return plain(SORT_AS[t] || (p.type === "thinker" ? t.split(" ").pop() : t));
  }

  const stripMd = (md) => md.replace(/\*\*|\*/g, "").replace(/^\s*- /gm, "");
  // The opening words of a page: its "In one line", or its first paragraph.
  function firstWords(p) {
    const one = p.sections.find(([t]) => t === "In one line");
    return stripMd((one || p.sections[0] || ["", ""])[1]).split(/\n\s*\n/)[0];
  }
  // Every page comes round in turn, a new one each Monday (from Monday 19 October 2026), in a
  // fixed shuffled order.
  function weeklyPage(today) {
    const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
    const list = library.pages.filter((p) => p.type !== "essay" && pageShown(p.id)).sort((a, b) => hash(a.id) - hash(b.id));
    if (!list.length) return null;
    const week = Math.floor(daysBetween("2026-10-19", today) / 7);
    return list[((week % list.length) + list.length) % list.length];
  }

  // Search: accents and case ignored; a title match first, then keywords, then other names, then
  // the text. Each result says why it matched.
  const foldText = (t) => [...t].map((c) => c.normalize("NFD")[0]).join("").toLowerCase();  // one character for each
  let searchIndex = null;
  function search(q) {
    const f = foldText(q.trim());
    if (f.length < 2) return [];
    searchIndex = searchIndex || library.pages.filter((p) => p.type !== "essay" && pageShown(p.id)).map((p) => {
      const text = stripMd(p.sections.map(([, md]) => md).join("\n\n"));
      return { p, title: foldText(pageTitle(p)), tags: p.tags.map(foldText), aliases: p.aliases.map(foldText), text, folded: foldText(text) };
    });
    // A match at the start of a word ("passions") counts before one inside a word ("compassion").
    const wordAt = (t) => { const m = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(f)}`, "u").exec(t); return m ? m.index + m[1].length : -1; };
    const hits = [];
    for (const x of searchIndex) {
      let rank, why;
      const tag = (inside) => x.tags.findIndex((t) => (inside ? t.includes(f) : wordAt(t) >= 0));
      const at = wordAt(x.folded);
      if (x.title.includes(f)) { rank = x.title.startsWith(f) ? 0 : 1; why = firstWords(x.p); }
      else if (tag(false) >= 0) { rank = 2 + tag(false) / 100; why = "Keywords: " + x.p.tags.filter((t, i) => wordAt(x.tags[i]) >= 0).join(", "); }  // an earlier keyword counts more
      else if (x.aliases.some((t) => t.includes(f))) { rank = 3; why = "Also known as " + x.p.aliases.find((t, i) => x.aliases[i].includes(f)); }
      else if (at >= 0) { rank = 4; why = { text: x.text, at, len: f.length }; }
      else if (tag(true) >= 0) { rank = 5 + tag(true) / 100; why = "Keywords: " + x.p.tags[tag(true)]; }
      else {
        const i = x.folded.indexOf(f);
        if (i < 0) continue;
        rank = 6;
        why = { text: x.text, at: i, len: f.length };
      }
      hits.push({ p: x.p, rank, why });
    }
    return hits.sort((a, b) => a.rank - b.rank || pageTitle(a.p).localeCompare(pageTitle(b.p))).slice(0, 30);
  }
  // A few words around a match in the text, cut on word boundaries, the match in bold.
  function snippet({ text, at, len }) {
    let from = Math.max(0, at - 60), to = Math.min(text.length, at + len + 80);
    if (from > 0) from = text.indexOf(" ", from) + 1;
    if (to < text.length) to = text.lastIndexOf(" ", to);
    const span = make("span", "d");
    span.append((from > 0 ? "…" : "") + text.slice(from, at).replace(/\s+/g, " "), make("mark", "", text.slice(at, at + len)),
      text.slice(at + len, to).replace(/\s+/g, " ") + (to < text.length ? "…" : ""));
    return span;
  }
  function renderSearch() {
    const body = $("lib-body"), q = $("lib-search").value;
    body.replaceChildren();
    if (!q.trim()) return renderLibrary(null);
    const hits = search(q), ul = make("ul", "lib-list two");
    for (const { p, why } of hits) {
      const li = libRow("#/page/" + p.id, pageTitle(p), typeof why === "string" ? why : null, KIND[p.type]);
      if (typeof why !== "string") li.querySelector("a > span").append(snippet(why));
      ul.append(li);
    }
    body.append(hits.length ? ul : make("p", "lib-end", "Nothing in the Library matches that yet."));
  }

  // With the Library, About leaves the bottom bar: its maps and timeline move into the Library,
  // and its own words, the notes section and the small links move to the bottom of Settings.
  const mapNodes = {};
  function moveAbout() {
    const about = $("view-about"), h2s = [...about.querySelectorAll("h2")];
    const group = (startText) => {  // an h2 and everything up to the next h2
      const h = h2s.find((x) => x.textContent.startsWith(startText));
      const out = [];
      for (let n = h && h.nextElementSibling; n && n.tagName !== "H2"; n = n.nextElementSibling) out.push(n);
      return [h, out];
    };
    const [, maps] = group("Where our thinkers lived");
    const intro = maps.find((n) => n.tagName === "P"), fig = (id) => about.querySelector(`.map-figure[data-map="${id}"]`);
    const hint = make("p", "lib-map-hint", "Tap Europe or Asia on the map to see it closer.");
    if (fig("world")) mapNodes.world = [intro, fig("world"), hint];
    if (fig("europe")) mapNodes.europe = [intro.cloneNode(true), fig("europe")];
    if (fig("asia")) mapNodes.asia = [intro.cloneNode(true), fig("asia")];
    mapNodes["thinkers-in-time"] = [];  // drawn when opened
    const [, time] = group("The paths through time");
    if (time.length) mapNodes["paths-in-time"] = time;
    const box = $("settings-about"), lead = [...about.children].slice(1, about.querySelector("h2") ? [...about.children].indexOf(about.querySelector("h2")) : 1);
    const [whyH, why] = group("Why The Thinking Place"), [notesH, notes] = group("Your notes are yours alone");
    box.append(make("h2", "", "About The Thinking Place"), ...lead, ...(whyH ? [whyH, ...why] : []),
      ...(notesH ? [notesH, ...notes.filter((n) => !n.dataset.block)] : []), about.querySelector(".fine"));
    box.hidden = false;
  }

  // The thinkers through time: one line down the page, oldest first by birth (texts at the start
  // of their span, in italics), a label for each century, and a dashed stretch where two or more
  // centuries pass with nobody.
  const NUMBERS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  function thinkersInTime() {
    const century = (y) => (y < 0 ? -Math.ceil(-y / 100) : Math.ceil(y / 100));
    const step = (c) => (c < 0 ? c + 1 : c);  // 1st century BCE and 1st century CE are neighbours
    const people = library.pages.filter((p) => (p.type === "thinker" || p.type === "text") && pageShown(p.id))
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
    const ol = make("ol", "ttl");
    let last = null;
    for (const p of people) {
      const c = century(p.start);
      if (c !== last) {
        if (last !== null && step(c) - step(last) >= 3) {
          const n = step(c) - step(last), gap = make("li", "ttl-gap");
          gap.append(make("span", "", `${NUMBERS[n] || n} centuries later`));
          ol.append(gap);
        }
        const li = make("li", "ttl-century");
        li.append(make("span", "", `${ordinal(Math.abs(c))} century${c < 0 ? " BCE" : ""}`));
        ol.append(li);
        last = c;
      }
      const li = make("li", "ttl-row" + (p.type === "text" ? " soft" : "")), a = make("a");
      a.href = "#/page/" + p.id;
      a.append(make("span", "t", p.title), make("span", "d", p.header[1] || ""), make("span", "k", p.path));
      li.append(a);
      ol.append(li);
    }
    return [make("p", "ttl-note", "The texts of ancient India, in italics, grew over centuries in the hands of many authors, so they appear at the start of their span."), ol];
  }

  // Dots closer than their 44px tap area (Rome, beside Florence) get smaller tap areas, so each
  // catches only taps on itself; the dot drawn stays the same size.
  function fitDots(root) {
    const dots = [...root.querySelectorAll(".map-dot")], at = dots.map((d) => d.getBoundingClientRect());
    dots.forEach((d, i) => {
      const near = Math.min(44, ...at.map((r, j) => (j === i ? 44 : Math.hypot(r.x - at[i].x, r.y - at[i].y))));
      const size = Math.max(14, Math.floor(near));
      Object.assign(d.style, { width: size + "px", height: size + "px", margin: `${-size / 2}px 0 0 ${-size / 2}px` });
      d.style.setProperty("--dot-inset", (size - 10) / 2 + "px");
    });
  }

  function libRow(href, title, sub, side) {
    const li = make("li"), a = make("a");
    a.href = href;
    const left = make("span");
    left.append(make("span", "t", title));
    if (sub) left.append(make("span", "d", sub));
    a.append(left);
    if (side) a.append(make("span", "k", side));
    li.append(a);
    return li;
  }

  function renderLibrary(section) {
    const body = $("lib-body");
    body.replaceChildren();
    $("lib-back").hidden = !section;
    $("lib-search").hidden = !!section;
    const map = LIB_MAPS.find(([id]) => id === section);
    const toWorld = map && mapFromWorld;
    $("lib-back").href = toWorld ? "#/library/world" : map ? "#/library/maps" : "#/library";
    $("lib-back").textContent = toWorld ? "← the world" : map ? "← maps and timelines" : "← library";
    if (!section) {
      $("lib-title").textContent = "Library";
      $("lib-sub").textContent = "A well of knowledge behind each day's thought: the thinkers, their paths, their times, and the big questions.";
      if ($("lib-search").value.trim()) return renderSearch();
      const ul = make("ul", "lib-list two");
      for (const [id, title, sub] of LIB_SECTIONS) ul.append(libRow("#/library/" + id, title, sub));
      body.append(ul);
      // The weekly highlight: one page, the same all week, every page in turn.
      const hl = weeklyPage(todayKey());
      if (hl) {
        const a = make("a", "lib-hl");
        a.href = "#/page/" + hl.id;
        a.append(make("span", "kind", KIND[hl.type] || ""), make("span", "t", pageTitle(hl)), make("p", "d", firstWords(hl)), make("span", "go", "read"));
        body.append(make("p", "lib-hl-label", "Weekly highlight"), a);
      }
      return;
    }
    if (map) {
      $("lib-title").textContent = map[1];
      $("lib-sub").textContent = map[2];
      body.append(...(map[0] === "thinkers-in-time" ? thinkersInTime() : mapNodes[map[0]] || []));
      setTimeout(() => fitDots(body), 0);
      return;
    }
    const [, title, sub] = LIB_SECTIONS.find(([id]) => id === section);
    $("lib-title").textContent = title;
    $("lib-sub").textContent = sub;
    const shown = (type) => library.pages.filter((p) => p.type === type && pageShown(p.id));
    const firstLine = (p) => (p.sections.find(([t]) => t === "In one line") || [])[1] || "";
    if (section === "time") {
      // "Before you read": the essay, open on the first visit and folded after (it can be folded there too).
      const essay = shown("essay")[0];
      if (essay) {
        const seen = store.get("essaySeen"), fold = make("button", "lib-fold"), text = make("div", "lib-text");
        fold.type = "button";
        fold.setAttribute("aria-expanded", String(!seen));
        const t = make("span", "t", "Before you read ");
        t.append(make("span", "lib-chev"));
        fold.append(t, make("span", "d", "Why it helps to know the world a thinker lived in."));
        renderMd(text, essay.sections[0][1], makeLinker(essay.id));
        text.hidden = !!seen;
        fold.addEventListener("click", () => { text.hidden = !text.hidden; fold.setAttribute("aria-expanded", String(!text.hidden)); });
        store.set("essaySeen", "1");
        body.append(fold, text);
      }
      // The eras, in order of time, each with its dates.
      body.append(make("h2", "", "The eras"));
      const ul = make("ul", "lib-list two");
      for (const p of shown("era").sort((a, b) => a.start - b.start || a.eraOrder - b.eraOrder)) ul.append(libRow("#/page/" + p.id, p.title, p.header[0]));
      body.append(ul);
      // Last, why some voices are missing (from the About page).
      const about = [...document.querySelectorAll("#view-about h2")].find((h) => h.textContent.startsWith("About the voices"));
      if (about) {
        const h = make("h2", "", about.textContent), text = make("div", "lib-text");
        h.id = "lib-voices";
        text.append(make("p", "", about.nextElementSibling.textContent));
        body.append(h, text);
      }
    }
    if (section === "paths") {
      const ul = make("ul", "lib-list two");
      for (const p of shown("path").sort((a, b) => PATH_ORDER.indexOf(a.title) - PATH_ORDER.indexOf(b.title))) ul.append(libRow("#/page/" + p.id, p.title, firstLine(p)));
      body.append(ul);
    }
    if (section === "topics") {
      const ul = make("ul", "lib-list");
      for (const p of shown("topic").sort((a, b) => pageTitle(a).localeCompare(pageTitle(b)))) ul.append(libRow("#/page/" + p.id, pageTitle(p)));
      body.append(ul);
    }
    if (section === "maps") {
      const ul = make("ul", "lib-list two");
      for (const [id, t, d] of LIB_MAPS) if (mapNodes[id]) ul.append(libRow("#/library/" + id, t, d));
      body.append(ul);
    }
    if (section === "people") {
      const people = library.pages.filter((p) => (p.type === "thinker" || p.type === "text") && pageShown(p.id))
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      let letter = "", ul = null;
      for (const p of people) {
        const L = sortKey(p)[0].toUpperCase();
        if (L !== letter) { body.append(make("p", "lib-letter", L)); ul = make("ul", "lib-list"); body.append(ul); letter = L; }
        ul.append(libRow("#/page/" + p.id, p.title, null, p.path));
      }
      if (shown("essay").length || shown("era").length) {
        const end = make("p", "lib-end", "Missing a voice you expected? ");
        end.append(make("a", "", "Here's why →"));
        end.lastChild.href = "#/library/time/voices";
        body.append(end);
      }
    }
  }

  // Inside a page's text, the first mention of another thinker, text or path links to its page
  // (never eras or themes, never the page itself, never a page that doesn't show). A name that is
  // part of someone else's ("James Mill", "Seneca Falls") is left alone: a capitalised word right
  // before or after it must belong to the page's own title (common sentence openers aside).
  const OPENERS = new Set(["The", "A", "An", "In", "On", "At", "For", "And", "But", "Yet", "So", "Then", "When", "While",
    "After", "Before", "As", "Like", "By", "To", "From", "With", "Of", "His", "Her", "Their", "Its", "Both", "Only", "Even",
    "Unlike", "Later", "Where", "Here", "There", "Today", "Read", "Start"]);
  function partOfAnotherName(text, m, id) {
    const own = new Set(pageById[id].title.split(/\s+/));
    const before = /([A-Z][\p{L}'’-]*)\s$/u.exec(text.slice(Math.max(0, m.index - 30), m.index));
    const after = /^\s([A-Z][\p{L}'’-]*)/u.exec(text.slice(m.index + m[1].length, m.index + m[1].length + 30));
    return (before && !own.has(before[1]) && !OPENERS.has(before[1])) || (after && !own.has(after[1]));
  }
  function makeLinker(selfId) {
    const names = Object.keys(library.links).sort((a, b) => b.length - a.length);
    if (!names.length) return (t) => [t];
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(${names.map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "gu");
    const used = new Set([selfId]);
    return (text) => {
      const out = [];
      let last = 0;
      for (const m of text.matchAll(re)) {
        const id = library.links[m[1]];
        if (used.has(id) || !pageShown(id) || partOfAnotherName(text, m, id)) continue;
        used.add(id);
        out.push(text.slice(last, m.index), pageLink(id, m[1], "lib-in"));
        last = m.index + m[1].length;
      }
      out.push(text.slice(last));
      return out.filter((x) => x !== "");
    };
  }
  function pageLink(id, label, cls) {
    const a = make("a", cls || "", label);
    a.href = "#/page/" + id;
    return a;
  }
  // Light Markdown, built as elements (never as HTML): **bold**, *italic*, bare links.
  function inline(el, text, linker) {
    for (const part of text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|https?:\/\/[^\s)]+)/)) {
      if (!part) continue;
      if (/^\*\*.+\*\*$/.test(part)) { const b = make("strong"); inline(b, part.slice(2, -2), linker); el.append(b); }
      else if (/^\*.+\*$/.test(part)) { const i = make("em"); inline(i, part.slice(1, -1), linker); el.append(i); }
      else if (/^https?:\/\//.test(part)) { const a = make("a", "", part); a.href = part; a.target = "_blank"; a.rel = "noopener"; el.append(a); }
      else el.append(...linker(part));
    }
  }
  function renderMd(el, md, linker) {
    for (const block of md.split(/\n\s*\n/)) {
      const lines = block.split("\n").filter((l) => l.trim());
      if (lines.length && lines.every((l) => /^\s*- /.test(l))) {
        const ul = make("ul");
        for (const l of lines) { const li = make("li"); inline(li, l.replace(/^\s*- /, ""), linker); ul.append(li); }
        el.append(ul);
      } else if (lines.length) {
        const para = make("p");
        inline(para, lines.join(" "), linker);
        el.append(para);
      }
    }
  }

  // Every thought of a page shown on a calendar day so far, whether or not the app was opened.
  function pageThoughts(ids) {
    const want = new Set(ids), out = [], today = todayKey();
    for (let k = calendar.start; k <= today; k = addDays(k, 1)) {
      const e = entryShown(k);
      if (want.has(e.id)) out.push([k, e]);
    }
    return out.reverse();
  }

  // Thinkers and texts as links (every one, met or not), in the order a sentence names them.
  function peopleList(match, order) {
    const at = (x) => {
      const names = [x.title, x.title.replace(/^The /, ""), ...x.aliases, x.title.split(" ").pop()];
      const i = Math.min(...names.map((n) => { const k = order.toLowerCase().indexOf(n.toLowerCase()); return k < 0 ? Infinity : k; }));
      return i;
    };
    const ul = make("ul", "lib-list two");
    library.pages.filter((x) => (x.type === "thinker" || x.type === "text") && pageShown(x.id) && match(x))
      .sort((a, b) => at(a) - at(b))
      .forEach((x) => ul.append(libRow("#/page/" + x.id, x.title, x.header[1] || "")));
    return ul;
  }

  function renderPage(id) {
    const p = pageById[id], linker = makeLinker(id);
    $("page-kind").textContent = KIND[p.type] || "";
    $("page-title").textContent = pageTitle(p);
    const header = $("page-header");
    header.replaceChildren();
    (p.type === "era" ? p.header.slice(0, 1) : p.header).forEach((part, i) => {
      if (i) header.append(" · ");
      const path = part === p.path && p.type !== "path" && pageOf("path", part);
      header.append(path ? pageLink(path.id, part) : part);
    });
    header.hidden = !p.header.length;
    $("page-also").hidden = !p.tags.length;
    $("page-also").textContent = "Keywords: " + p.tags.slice(0, 6).join(", ");
    const text = $("page-text");
    text.replaceChildren();
    p.sections.forEach(([title, md], i) => {
      if (title === "In one line" && i === 0) { const one = make("p", "lib-one-line"); inline(one, md, linker); text.append(one); return; }
      text.append(make("h2", "", title));
      // A path's "Who we read" is its thinkers as links, in the order the sentence names them.
      if (p.type === "path" && title === "Who we read") text.append(peopleList((x) => x.path === p.title, md));
      else renderMd(text, md, linker);
    });
    if (p.type === "era") {
      text.append(make("h2", "", "The thinkers of this era"), peopleList((x) => x.era === p.title, p.header[1] || ""));
    }

    const extra = $("page-extra");
    extra.replaceChildren();
    const era = (p.type === "thinker" || p.type === "text") && pageOf("era", p.era);
    if (era) {
      const box = make("p", "lib-era");
      box.append(make("span", "k", "In their time"), pageLink(era.id, era.title + " →"));
      extra.append(box);
    }
    // The thoughts so far, newest first: 5, then more on request; a note folded under its thought.
    const met = p.thoughts ? pageThoughts(p.thoughts) : [];
    if (met.length) {
      extra.append(make("h2", "", p.type === "topic" ? `Thoughts on ${pageTitle(p).toLowerCase()} so far` : `Thoughts from ${p.title} so far`));
      const list = make("ol", "lib-met"), more = make("button", "link quiet journal-more", "show earlier thoughts");
      let shown = 0;
      const add = () => {
        for (const [day, e] of met.slice(shown, shown + 5)) {
          const li = make("li"), a = make("a");
          a.href = "#/day/" + day;
          a.append(make("span", "date", formatDate(day)), make("p", "q", e.text.replace(/ \/ /g, "\n")));
          li.append(a);
          const note = ((noteAbout(day, e.id) || {}).text || "").trim();
          if (note) {
            const box = make("div", "mq-folded"), b = make("button", "mq-fold", "your note");
            box.append(make("p", "mq-past-note", note));
            box.hidden = true;
            b.type = "button";
            b.setAttribute("aria-expanded", "false");
            b.addEventListener("click", () => { box.hidden = !box.hidden; b.setAttribute("aria-expanded", String(!box.hidden)); });
            li.append(b, box);
          }
          list.append(li);
        }
        shown += 5;
        more.hidden = shown >= met.length;
      };
      more.type = "button";
      more.addEventListener("click", add);
      add();
      extra.append(list, more);
    }
    const related = (library.related[id] || []).filter(pageShown);
    if (related.length) {
      extra.append(make("h2", "", "Related"));
      const box = make("p", "lib-related");
      box.append(...related.map((r) => pageLink(r, pageTitle(pageById[r]))));
      extra.append(box);
    }
    if (p.sources.length) {
      extra.append(make("h2", "", "Sources"));
      const ul = make("ul", "lib-sources");
      for (const [label, url] of p.sources) {
        const li = make("li"), a = make(url ? "a" : "span");
        inline(a, label, (t) => [t]);  // titles in italics, as written
        if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; }
        li.append(a);
        ul.append(li);
      }
      extra.append(ul);
    }
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
    const tomorrow = addDays(today, 1), said = thoughtTeaser(tomorrow);
    // The evening before a monthly question appears: "…, and a question for November."
    const m = Object.keys(questions).find((x) => questionShown(x) && questionDay(x) === tomorrow);
    if (!m) return said;
    return said ? `${said.replace(/\.$/, "")}, and a question for ${monthName(m)}.` : `Tomorrow: a question for ${monthName(m)}.`;
  }
  function thoughtTeaser(tomorrow) {
    if (easyIndex(tomorrow) >= 0) {
      const kind = thoughtKind(entryFor(tomorrow), true);
      return kind ? `Tomorrow: ${kind}.` : "Tomorrow: another gentle thought.";
    }
    const info = dayInfo(tomorrow), kind = thoughtKind(entryFor(tomorrow));
    const said = info.pinned ? info.pinned.teaser
      : info.revisit ? calendar.revisitTeaser || "Tomorrow: a thought you may have met before."
      : calendar.teasers[info.id] || (kind ? `Tomorrow: ${kind}.` : "");
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
    // Settings shows what is really on; the reader's wish ("every day", "once a week") is kept
    // apart, so a reminder blocked by the phone starts by itself once notifications are allowed.
    const r = reminderPrefs();
    if (r.freq !== "off") store.set("reminderWanted", JSON.stringify(r));
    let wanted = null;
    try { wanted = JSON.parse(store.get("reminderWanted", "null")); } catch {}
    try {
      await LN.cancel({ notifications: [REMINDER_ID, ...Array.from({ length: AHEAD_DAYS + 1 }, (_, i) => DAY_IDS + i)].map((id) => ({ id })) });
      if (!wanted) return renderReminder("");
      let perm = await LN.checkPermissions();
      if (perm.display !== "granted" && ask) {
        store.set("reminderAsked", "1");
        perm = await LN.requestPermissions();  // asked on every tap: Android shows its prompt when it still can
      }
      // Declined, now or before: "off" is shown, with a way to the phone's own settings.
      if (perm.display !== "granted") {
        store.set("reminder", JSON.stringify(Object.assign({}, wanted, { freq: "off" })));
        return renderReminder(BLOCKED);
      }
      store.set("reminder", JSON.stringify(wanted));
      await LN.schedule({ notifications: reminderSchedule(wanted) });
      renderReminder("");
    } catch { renderReminder("The reminder couldn't be set on this device."); }
  }

  const BLOCKED = "blocked";
  function renderReminder(status) {
    const r = reminderPrefs();
    $("reminder").hidden = !NATIVE;
    checkChoice("[data-reminder-freq]", "reminderFreq", r.freq);
    checkChoice("[data-reminder-hour]", "reminderHour", r.hour);
    checkChoice("[data-reminder-day]", "reminderDay", r.weekday);
    $("reminder-time").hidden = r.freq === "off";
    $("reminder-days").hidden = r.freq !== "weekly";
    if (status === BLOCKED) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "link inline-link";
      link.textContent = "open phone settings";
      link.addEventListener("click", () => {
        const PS = plugin("PhoneSettings") || (NATIVE && window.Capacitor.registerPlugin && window.Capacitor.registerPlugin("PhoneSettings"));
        if (PS) PS.openNotifications().catch(() => {});
      });
      $("reminder-status").replaceChildren("Notifications are blocked for The Thinking Place on this phone. Allow them in your phone's settings and your reminder will start. ", link);
    } else if (status !== undefined) $("reminder-status").textContent = status;
  }

  function setReminder(change) {
    const r = Object.assign(reminderPrefs(), change);
    store.set("reminder", JSON.stringify(r));
    if (r.freq === "off") store.remove("reminderWanted");
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
    $("breath-help").textContent = "Used whenever you breathe. " + BREATHS[kind].help;
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
    $("sit-question").textContent = silence.question || entryShown(currentKey || todayKey()).prompt;
    $("sit-question").hidden = !think || !started;
    $("breath-box").hidden = think || !started;
  }

  // A soft start: "Let's think" (or breathe) for a few seconds, then the time begins.
  // At the end: welcome back, then write, share, or done for today.
  const INTRO_MS = 3500;
  // With a question (from a monthly question's page), that question is shown instead of the day's.
  function openSilence(question) {
    const minutes = Number(store.get("minutes", "3"));
    silence = { timers: [], question: typeof question === "string" ? question : null };
    $("sit-share").hidden = $("sit-share").previousElementSibling.hidden = !!silence.question;
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
      // Punctuation right after the word stays on its line (", and others are not." never
      // starts a line on its own): the word is a button, so the browser could break there.
      const next = btn.nextSibling, punct = next && next.nodeType === 3 && next.data.match(/^[,.;:!?…’”)\]]+/);
      if (punct) {
        const glue = document.createElement("span");
        glue.className = "term-glue";
        next.data = next.data.slice(punct[0].length);
        btn.replaceWith(glue);
        glue.append(btn, punct[0]);
      }
      return true;
    }
    return false;
  }

  // The two actions in the tour's example open a short card about the feature.
  const TOUR_FEATURES = {
    write: ["Write about this", "Opens a notepad right under the question. Your notes stay on this phone, and you'll find them again in past thoughts."],
    sit: ["Sit and think", "A few quiet minutes with the question on screen, to think or simply to breathe. In Settings, choose how long it lasts, and add a sound if you like: rain, waves or wind."],
  };

  function openTerm(btn) {
    if (btn.dataset.feature) return showCard(btn, ...TOUR_FEATURES[btn.dataset.feature]);
    const g = glossary[+btn.dataset.term];
    if (!g) return;
    const page = g.school ? (pageOf("path", g.term) || {}).id : g.concept ? library.glossaryLinks[g.term] : library.cards[g.term];
    showCard(btn, g.term, g.def, g.wiki, g.school && schoolDetails(g), pageShown(page) ? page : null, g.concept ? "More in: " : "More about ");
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

  function showCard(btn, title, text, wiki, more, page, lead = "More about ", down = false) {
    const card = $("term-card");
    $("term-title").textContent = title;
    $("term-def").textContent = text;
    // The Library pages behind the card: "More about Seneca →", one line each.
    const pages = [].concat(page || []);
    $("term-page").hidden = !pages.length;
    $("term-page").replaceChildren(...pages.map((id) => {
      const a = make("a", "", `${lead}${pageTitle(pageById[id])} →`);
      a.href = "#/page/" + id;
      return a;
    }));
    page = pages.length ? pages[0] : null;
    $("term-more").replaceChildren(...(more ? [more] : []));
    $("term-more").hidden = !more;
    $("term-wiki").hidden = !wiki || !!page;  // the Library page replaces Wikipedia
    if (wiki) $("term-wiki").href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(wiki).replace(/%2F/g, "/");
    card.hidden = false;
    // Place the card just below the word, or above it if there is no room.
    const r = btn.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), window.innerWidth - w - 16);
    const below = r.bottom + 10, above = r.top - h - 10;
    card.style.left = left + "px";
    const y = window.scrollY;
    // Map cards always open downwards (the page scrolls to read them); others stay on screen.
    const top = down || below + h < window.innerHeight - 64 || above < 16 ? below : above;
    card.style.top = y + (down ? top : Math.max(16, Math.min(top, window.innerHeight - h - 16))) + "px";
    openTerm.from = btn;
    // Move focus into the card so screen readers announce the definition.
    card.focus({ preventScroll: true });
  }

  // A dot on the About page maps: who lived there.
  function openPlace(btn) {
    // In the Library, a place's card leads to each thinker or text it names.
    const named = [];
    if (libraryOn()) {
      for (const [name, id] of Object.entries(library.links).sort((a, b) => b[0].length - a[0].length)) {
        const p = pageById[id];
        if ((p.type === "thinker" || p.type === "text") && pageShown(id) && !named.includes(id)
          && new RegExp(`(?<![\\p{L}])${escapeRe(name)}(?![\\p{L}])`, "u").test(btn.dataset.text)) named.push(id);
      }
    }
    showCard(btn, btn.dataset.title, btn.dataset.text, btn.dataset.wiki, null, named, "More about ", true);
    btn.setAttribute("aria-expanded", "true");
  }

  // A path on the About page timeline: its card, as on the daily page.
  function openPath(btn) {
    const g = glossary.find((t) => t.school && t.term === btn.dataset.path);
    if (!g) return;
    showCard(btn, g.term, g.def, g.wiki, schoolDetails(g), (pageOf("path", g.term) || {}).id);
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
    const h = hourNow();
    const part = h >= 5 && h < 12 ? "Good morning" : h >= 12 && h < 18 ? "Good afternoon" : "Good evening";
    $("greeting").textContent = name ? `${part}, ${name}` : part;
    $("greeting").hidden = !show;
  }

  // ---------- first launch: a short tour, then a name ----------
  // Five cards (welcome, a day in miniature, space to think, where it comes from, privacy), then the name.
  // Back, the dots and next sit at the bottom, skip in the top corner; Android's back
  // gesture goes back a card.
  // Cards change in two beats: the old one fades out (0.2 s), then the new one fades in
  // (0.3 s), drifting 8px from the side it comes from.
  let tourStep = 0, tourSwap = null;
  function showTourStep(i) {
    const steps = [...document.querySelectorAll("#welcome .tour-step")];
    const from = tourStep;
    tourStep = Math.max(0, Math.min(i, steps.length - 1));
    const old = steps.find((s) => !s.hidden), next = steps[tourStep];
    clearTimeout(tourSwap);
    steps.forEach((s) => s.classList.remove("tour-out", "tour-in-next", "tour-in-back"));
    const enter = () => {
      steps.forEach((s) => { s.hidden = s !== next; s.style.transform = ""; });
      next.classList.add(tourStep >= from ? "tour-in-next" : "tour-in-back");
      if (tourStep === 0) restartTourMark();
      if (tourStep === steps.length - 1) $("welcome-name").focus({ preventScroll: true });
    };
    if (old && old !== next) { old.classList.add("tour-out"); tourSwap = setTimeout(enter, 200); }
    else enter();
    const last = tourStep === steps.length - 1;
    $("tour-back").classList.toggle("hide", tourStep === 0);  // hidden, but the dots stay put
    $("tour-next").classList.toggle("hide", last);
    $("tour-dots").classList.toggle("hide", last);
    $("tour-skip").hidden = last;
    $("tour-dots").textContent = steps.slice(0, -1).map((_, n) => (n === tourStep ? "●" : "○")).join(" ");
    closeTerm();
  }

  // The example day: always thought #97 (Plato, Theaetetus 155d), from entries.json,
  // underlined like any day.
  const TOUR_SAMPLE = 97;
  function fillTourSample() {
    const e = entriesById[TOUR_SAMPLE];
    if (!e) return;
    $("tour-path").textContent = e.path;
    $("tour-text").textContent = e.text;
    $("tour-source").textContent = e.source;
    $("tour-context-text").textContent = e.about || e.context;
    $("tour-prompt").textContent = e.prompt;
    markTerms(e.path, ["tour-text", "tour-path", "tour-source", "tour-context-text"]);
  }

  // The welcome mark: the launch logo, its twelve rays turning teal one at a time, clockwise
  // from the top, with the path's name underneath (About page order). One path every 2.6 s;
  // the ray takes 0.9 s to change, the name fades 0.6 s in and out. Still with reduced motion.
  const TOUR_PATHS = ["Stoicism", "Epicureanism", "Classical Greek Philosophy", "Enlightenment Ethics",
    "Existential Thought", "Humanists and Essayists", "Buddhist Philosophy", "Indian Philosophy",
    "Taoism", "Confucianism", "Japanese Aesthetics", "Persian and Sufi Poetry"];
  let tourClock = null;  // when the mark's clock started; null until the overlay has faded in
  const restartTourMark = () => { if (tourClock !== null) tourClock = performance.now(); };
  function startTourMark() {
    const svg = $("launch").querySelector("svg").cloneNode(true);
    svg.removeAttribute("class");
    svg.querySelector("mask").id = "tour-cut";
    svg.querySelector("[mask]").setAttribute("mask", "url(#tour-cut)");
    $("tour-mark").prepend(svg);
    const rays = [...svg.querySelectorAll("path")].slice(0, 12), name = $("tour-ray-name");
    const P = 2.6, RAY = 0.9, NAME = 0.6;
    const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    function renderAt(t) {
      const i = Math.floor(t / P) % 12, u = t % P, prev = (i + 11) % 12, k = ease(u / RAY);
      rays.forEach((r, n) => {
        const amt = n === i ? k : n === prev && t >= P ? 1 - k : 0;
        r.style.fill = `color-mix(in srgb, var(--logo-accent) ${Math.round(amt * 100)}%, var(--fg))`;
      });
      name.textContent = TOUR_PATHS[i];
      name.style.opacity = Math.min(ease(u / NAME), ease((P - u) / NAME));
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { renderAt(RAY + .1); name.style.opacity = 1; return; }
    // The clock starts once the overlay has faded in, so nobody misses Stoicism, and starts
    // again from it each time card 1 comes back.
    renderAt(0);
    $("welcome").addEventListener("animationend", (ev) => {
      if (ev.target === $("welcome") && tourClock === null) tourClock = performance.now();
    });
    const tick = (now) => {
      if ($("welcome").hidden) return;
      if (tourClock !== null) renderAt((now - tourClock) / 1000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Swipe left for the next card, right for the one before. The card follows the finger with
  // some resistance and snaps back if the swipe doesn't count; vertical drags still scroll.
  function bindTourSwipe() {
    const el = $("welcome");
    let start = null, swiped = false;
    const card = () => el.querySelector(".tour-step:not([hidden])");
    const last = () => el.querySelectorAll(".tour-step").length - 1;
    el.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("input, .term-card") || !ev.isPrimary) return;
      start = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      swiped = false;
    });
    el.addEventListener("pointermove", (ev) => {
      if (!start) return;
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      const blocked = (dx > 0 && tourStep === 0) || (dx < 0 && tourStep === last());
      const c = card();
      if (c) { c.style.transition = "none"; c.style.transform = blocked ? "" : `translateX(${Math.max(-40, Math.min(40, dx * 0.3))}px)`; }
    });
    const end = (ev) => {
      if (!start) return;
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y, dt = performance.now() - start.t;
      start = null;
      const c = card();
      const counts = ev.type === "pointerup" &&
        ((Math.abs(dx) > 50 && Math.abs(dx) > 1.5 * Math.abs(dy)) || (Math.abs(dx) > 20 && Math.abs(dx) / dt > 0.3 && Math.abs(dx) > Math.abs(dy)));
      if (counts && dx < 0 && tourStep < last()) showTourStep(tourStep + 1);
      else if (counts && dx > 0 && tourStep > 0) showTourStep(tourStep - 1);
      else if (c) { c.style.transition = "transform .2s ease"; c.style.transform = ""; }
      if (Math.abs(dx) > 10) { swiped = true; setTimeout(() => (swiped = false), 50); }  // only the tap that ends it
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    // A swipe that starts on a link or an underlined word doesn't also tap it.
    el.addEventListener("click", (ev) => { if (swiped) { ev.stopPropagation(); ev.preventDefault(); swiped = false; } }, true);
  }

  function maybeWelcome() {
    if (store.get("welcomed")) return false;
    setOverlay($("welcome"), true);
    fillTourSample();
    startTourMark();
    bindTourSwipe();
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
    else if (hash === "about" && libraryOn()) { location.replace("#/library"); return; }  // About now lives in the Library and Settings
    else if (hash === "about") { view = "about"; renderLinks(); renderOfflineStatus(); }
    else if (hash === "settings") {
      view = "settings";
      $("name-setting").value = store.get("name", "");
      renderEasySetting();
      renderKeepsake();
      renderLinks(); renderReminder(); renderOfflineStatus();
    }
    else if (hash === "terms") view = "terms";
    else if (/^library(\/[\w-]+){0,2}$/.test(hash) && libraryOn()) {
      view = "library";
      const [, section, anchor] = hash.split("/");
      // Europe or Asia opened from the world map goes back to the world map.
      if (section !== libSection) mapFromWorld = (section === "europe" || section === "asia") && libSection === "world" && lastView === "library";
      libSection = section;
      renderLibrary([...LIB_SECTIONS, ...LIB_MAPS].some(([id]) => id === section) ? section : null);
      if (anchor === "voices") libraryAnchor = "lib-voices";
    }
    else if (/^page\/[\w-]+$/.test(hash) && pageShown(hash.slice(5))) { view = "page"; renderPage(hash.slice(5)); }
    else if (/^question\/\d{4}-\d{2}$/.test(hash) && questionShown(hash.slice(9))) {
      view = "question";
      if (lastView !== "question") questionFrom = lastView === "journal" ? "journal" : "day";
      renderQuestion(hash.slice(9));
    }
    else {
      const m = hash.match(/^day\/(\d{4}-\d{2}-\d{2})$/);
      if (!m) dayFromPage = false;
      else if (lastView !== "day") dayFromPage = lastView === "page";
      renderDay(m ? m[1] : todayKey());
    }
    if (view !== "day") { endReveal(); $("view-day").style.animation = ""; }  // normal fade-in again next time
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    updateHint();  // the "more below" arrow belongs to Today only
    const navView = view === "page" ? "library" : view;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === navView) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    routeCount++;
    lastView = view;
    window.scrollTo(0, 0);
    if (libraryAnchor) {  // "Here's why →": down to that paragraph, once the page has settled
      const a = $(libraryAnchor);
      libraryAnchor = null;
      if (a) setTimeout(() => window.scrollTo(0, a.getBoundingClientRect().top + window.scrollY - 24), 60);
    }
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
    // On iPhone, Safari may erase a tab's data after about a week without a visit, and notes
    // written in a tab may not carry over to the home-screen version.
    const keep = store.keys("note:").length
      ? " Notes written here may not carry over, so export them first (in Settings) and import them there."
      : " Best done now, before you write.";
    $("home-note-text").innerHTML = (steps ? steps + " " : "") +
      (IOS ? "It then opens like an app, full screen, and keeps your notes safe: in a normal browser tab, they may be erased if you don't visit for a week." + keep
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
    if (!$("term-card").hidden) return closeTerm();
    if (!$("welcome").hidden) { if (tourStep > 0) showTourStep(tourStep - 1); return; }
    if (!$("picker").hidden) return closePicker();
    if (silence) return finishSilence();
    if (!$("closing").hidden) return hideClosing();
    if (!$("note").hidden) return setWriting(false);
    if (!$("home-note").hidden) return closeHomeNote();
    const hash = location.hash.replace(/^#\/?/, "");
    if (hash === "terms") { location.hash = libraryOn() ? "#/settings" : "#/about"; return; }
    if (hash.startsWith("page/")) { $("page-back").click(); return; }
    if (mapFromWorld && /^library\/(europe|asia)$/.test(hash)) { location.hash = "#/library/world"; return; }
    if (LIB_MAPS.some(([id]) => hash === "library/" + id)) { location.hash = "#/library/maps"; return; }
    if (hash.startsWith("library/")) { location.hash = "#/library"; return; }
    if (hash.startsWith("question/")) { location.hash = questionFrom === "journal" ? "#/journal" : "#/"; return; }
    if (hash.startsWith("day/") && dayFromPage) { history.back(); return; }  // back to the Library page it came from
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
    $("note-text").addEventListener("input", growNote);
    window.addEventListener("resize", growNote);
    if (window.visualViewport) visualViewport.addEventListener("resize", growNote);
    // While writing, the bottom bar steps aside; "I'm done for today" or back still leave.
    $("note-text").addEventListener("focus", () => document.body.classList.add("typing"));
    $("note-text").addEventListener("blur", () => document.body.classList.remove("typing"));
    $("share").addEventListener("click", share);
    $("back-to-today").addEventListener("click", () => (dayFromPage ? history.back() : (location.hash = "#/")));
    $("terms-back").addEventListener("click", () => (location.hash = libraryOn() ? "#/settings" : "#/about"));

    $("open-silence").addEventListener("click", () => openSilence());
    $("close-silence").addEventListener("click", finishSilence);
    $("sit-write").addEventListener("click", () => {
      const fromQuestion = silence && silence.question;
      finishSilence();
      if (fromQuestion) $("mq-note").focus(); else setWriting(true);
    });
    $("lib-search").addEventListener("input", renderSearch);
    // The Library: "← back" goes back like a browser, or to the Library when opened directly.
    $("page-back").addEventListener("click", () => (routeCount > 1 ? history.back() : (location.hash = "#/library")));
    // Monthly questions
    $("mq-back").addEventListener("click", () => (location.hash = questionFrom === "journal" ? "#/journal" : "#/"));
    $("mq-picks").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-pick]");
      if (!b || !questionMonth) return;
      saveQuestion(questionMonth, { pick: b.dataset.pick });
      showPick(questionMonth, b.dataset.pick);
    });
    let mqTimer;
    $("mq-note").addEventListener("input", () => {
      clearTimeout(mqTimer);
      $("mq-note-status").textContent = "";
      const m = questionMonth;
      if (!m) return;
      saveQuestion(m, { note: $("mq-note").value });
      mqTimer = setTimeout(() => ($("mq-note-status").textContent = "saved"), 600);
    });
    $("filter-questions").addEventListener("click", () =>
      setJournalFilter(journal.questions ? { questions: false } : { questions: true, path: [], theme: [], saved: false }));
    $("mq-sit").addEventListener("click", () => questionMonth && openSilence(questions[questionMonth].question));
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
    $("tour-back").addEventListener("click", () => showTourStep(tourStep - 1));
    $("tour-skip").addEventListener("click", () => showTourStep(99));
    $("tour-about").addEventListener("click", () => {
      const open = $("tour-context").hidden;
      $("tour-context").hidden = !open;
      $("tour-about").setAttribute("aria-expanded", String(open));
      $("tour-about").textContent = open ? "hide note" : "about this thought";
    });

    document.addEventListener("click", (ev) => {
      if (ev.target.closest(".tell-friend")) { ev.preventDefault(); tellFriend(); return; }
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
    // Back from the phone's settings: if notifications are now allowed, the reminder is set.
    if (App) App.addListener("resume", () => applyReminder(false));

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
    const groups = [["#mq-line", "#greeting", "#day-date", "#teaser"],
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

  // The slow first reveal waits for Literata (roman and italic), so the question never
  // switches typeface as it appears; at most 1.5 s, then it goes ahead anyway.
  const fontsReady = Promise.race([
    document.fonts ? Promise.all([document.fonts.load("1em Literata"), document.fonts.load("italic 1em Literata")]) : null,
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  let revealTimers = [];
  async function startReveal(delay) {
    const view = $("view-day");
    if (!view.classList.contains("reveal")) return;
    await fontsReady;
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
    // Where the notes live, and what would lose them, worded for where the app runs.
    if (NATIVE) $("notes-help").textContent = "Your notes live only in this app. If you uninstall the app or lose your phone, they're gone. Export them now and then to keep a copy, or to move them: export here, then import the file there.";
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
    try { questions = await fetch("questions.json", { cache: "no-cache" }).then((r) => r.json()); } catch {}
    try {
      library = await fetch("pages.json", { cache: "no-cache" }).then((r) => r.json());
      pageById = Object.fromEntries(library.pages.map((p) => [p.id, p]));
    } catch {}
    if (libraryOn()) {
      // The bottom bar: today · past thoughts · library · settings. About leaves it.
      $("nav-library").hidden = $("nav-library-dot").hidden = false;
      const about = document.querySelector('.nav [data-nav="about"]');
      about.hidden = about.nextElementSibling.hidden = true;
      moveAbout();
    }
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
