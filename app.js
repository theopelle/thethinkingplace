// The Thinking Place — one thought a day, the same for everyone.
(() => {
  "use strict";

  const APP_NAME = "The Thinking Place";
  const DAY = 86400000;
  const PAGE_DAYS = 10;  // past thoughts shown at a time

  // Where feedback and donations go. Fill these in before launch.
  const CONTACT_EMAIL = "hello@example.com";           // TODO: real address
  const FEEDBACK_FORM_URL = "https://example.com/form"; // TODO: the feedback form
  const DONATE_URL = "https://buymeacoffee.com/";      // TODO: your Buy Me a Coffee page

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

  // Apple doesn't allow App Store apps to point to outside payment pages, so the
  // support section is hidden inside the native iOS app (wrapped with Capacitor).
  // Safari and home-screen installs from the website still show it.
  const IN_IOS_APP = !!(window.Capacitor && window.Capacitor.getPlatform &&
                        window.Capacitor.getPlatform() === "ios");
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const plugin = (name) => NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[name];

  const $ = (id) => document.getElementById(id);
  let entries = [];
  let entriesById = {};
  let calendar = { start: "2026-10-20", days: [] };
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
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const keyToUTC = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const utcToKey = (t) => new Date(t).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((keyToUTC(b) - keyToUTC(a)) / DAY);
  const formatDate = (key) =>
    new Date(keyToUTC(key)).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

  // ---------- the calendar ----------
  // calendar.json lists one thought per day from its start date, with the teaser shown
  // that evening about the next day. Past its end it starts again from the top; before
  // its start (only while testing) it shows the first day.
  function dayInfo(key) {
    const n = calendar.days.length;
    const i = Math.max(0, daysBetween(calendar.start, key));
    const [id, teaser, revisit] = calendar.days[i % n];
    return { id, teaser, revisit: !!revisit };
  }
  const entryFor = (key) => entriesById[dayInfo(key).id];

  // ---------- notes ----------
  // Each note is stored with the id of the thought it was written about, so the pair
  // stays together even if the calendar ever changes.
  function readNote(key) {
    const raw = store.get("note:" + key);
    if (!raw) return null;
    try {
      const n = JSON.parse(raw);
      if (n && typeof n.text === "string") return n;
    } catch {}
    return { text: raw, id: null };  // older plain-text note
  }

  function writeNote(key, text, id) {
    if (!text.trim()) { store.remove("note:" + key); return true; }
    countDay(key);
    store.set("noteChanged", todayKey());
    return store.set("note:" + key, JSON.stringify({ text, id }));
  }

  // The thought to show for a day: the one its note was written about, if any.
  function entryShown(key) {
    const note = readNote(key);
    return (note && note.id != null && entriesById[note.id]) || entryFor(key);
  }

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

    markTerms(e.path, ["day-text", "day-path", "day-source", "day-context-text"]);
    renderGreeting(key === today);
    // In the evening, a word about tomorrow.
    const teaser = key === today && new Date().getHours() >= 20 ? dayInfo(today).teaser : "";
    $("teaser").textContent = teaser;
    $("teaser").hidden = !teaser;

    showContext(false);
    countAfterReading(key);

    const note = (readNote(key) || { text: "" }).text;
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
    const text = `“${e.text.replace(/\n/g, " / ")}”\n— ${e.source}\n\nvia ${APP_NAME}`;
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
  const journal = { path: "", theme: "", shown: PAGE_DAYS };
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
    for (let t = keyToUTC(today); t >= keyToUTC(calendar.start); t -= DAY) keys.add(utcToKey(t));
    return [...keys].sort().reverse().filter((key) => {
      const e = entryShown(key);
      return (!journal.path || e.path === journal.path) && (!journal.theme || (e.themes || []).includes(journal.theme));
    });
  }

  function renderJournal() {
    const n = dayCount();
    $("journal-count").textContent = n === 1 ? "You've sat with 1 thought so far." : `You've sat with ${n} thoughts so far.`;
    $("journal-count").hidden = n < 1;
    renderBackupNudge();
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
      const note = (readNote(key) || { text: "" }).text;
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
    $("journal-more").hidden = days.length <= journal.shown;
  }

  function setJournalFilter(change) {
    Object.assign(journal, change, { shown: PAGE_DAYS });
    renderJournal();
  }

  // ---------- notes: export, import, erase ----------
  async function exportNotes(btn) {
    const keys = store.keys("note:").map((k) => k.slice(5)).sort();
    if (!keys.length) return flash(btn, "nothing yet");
    const body = keys.map((key) => {
      const e = entryShown(key);
      return `${key} — ${e.source} (${e.path})\n“${e.text}”\n${e.prompt}\n\n${readNote(key).text}\n`;
    }).join("\n---\n\n");
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
        const key = (block.trim().match(/^(\d{4}-\d{2}-\d{2}) —/) || [])[1];
        const gap = block.indexOf("\n\n");
        if (!key || gap < 0) continue;
        const note = block.slice(gap + 2).trim();
        if (!note) continue;
        const old = (readNote(key) || { text: "" }).text.trim();
        if (old === note || old.includes(note)) continue;
        writeNote(key, old ? old + "\n\n" + note : note, entryShown(key).id);
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

  // ---------- reminder ----------
  // A gentle daily (or weekly) notification, only in the installed app. Scheduled on the
  // device itself: nothing is sent to or from a server.
  const REMINDER_ID = 1;
  function reminderPrefs() {
    let r = null;
    try { r = JSON.parse(store.get("reminder", "null")); } catch {}
    return Object.assign({ freq: "daily", hour: 8, weekday: 2 }, r || {});
  }

  async function applyReminder(ask) {
    const LN = plugin("LocalNotifications");
    if (!LN) return;
    const r = reminderPrefs();
    try {
      await LN.cancel({ notifications: [{ id: REMINDER_ID }] });
      if (r.freq === "off") return renderReminder("");
      let perm = await LN.checkPermissions();
      if (perm.display !== "granted" && ask) { store.set("reminderAsked", "1"); perm = await LN.requestPermissions(); }
      if (perm.display !== "granted") return renderReminder("Notifications are turned off for this app in your phone's settings.");
      const on = r.freq === "weekly" ? { weekday: r.weekday, hour: r.hour, minute: 0 } : { hour: r.hour, minute: 0 };
      await LN.schedule({ notifications: [{
        id: REMINDER_ID, title: APP_NAME, body: "Today's thought is waiting for you.",
        schedule: { on, allowWhileIdle: true }, isExactNotification: false,
        smallIcon: "ic_stat_well", iconColor: "#4E7378",
      }] });
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
    const breath = $("breath"), cue = $("breath-cue");
    const cycle = () => {
      if (!silence || silence.completed) return;
      breath.classList.remove("out"); breath.classList.add("in"); cue.textContent = "breathe in";
      silence.timers.push(setTimeout(() => {
        breath.classList.add("out"); breath.classList.remove("in"); cue.textContent = "breathe out";
      }, 4000));
    };
    silence.timers.push(setTimeout(cycle, 80));  // after the circle is on screen, so it eases in
    silence.breathing = setInterval(cycle, 10000);
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
    clearInterval(silence.breathing);
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
    clearInterval(silence.breathing);
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
    $("term-wiki").href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(wiki).replace(/%2F/g, "/");
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
      store.set("welcomed", "1");
      setOverlay($("welcome"), false);
      route();
      prepareReveal();
      startReveal(200);
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
    document.querySelectorAll(".support-block").forEach((el) => (el.hidden = IN_IOS_APP));
    document.querySelectorAll(".donate-link").forEach((a) => (a.href = DONATE_URL));
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
    if (!$("note").hidden) showClosing.collapse = setTimeout(() => setWriting(false), 3600);
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
    const hash = location.hash.replace(/^#\/?/, "");
    let view = "day";
    if (hash === "journal") { view = "journal"; renderJournal(); }
    else if (hash === "about") { view = "about"; renderLinks(); renderOfflineStatus(); }
    else if (hash === "settings") {
      view = "settings";
      $("name-setting").value = store.get("name", "");
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
  const QUESTION_PARTS = ["#pause-2", "#view-day .question", "#view-day .actions", "#note-preview"];
  let questionHeld = false, questionObserver = null;

  function holdQuestion() {
    const view = $("view-day");
    if (view.hidden) return;
    const prompt = $("day-prompt");
    const barTop = document.querySelector(".nav").getBoundingClientRect().top;
    const lineH = parseFloat(getComputedStyle(prompt).lineHeight) || 24;
    const fits = prompt.getBoundingClientRect().top + lineH <= barTop - 8;
    questionHeld = !fits;
    // Hide at once (no fade-out), so the question never flashes before stepping aside.
    const parts = QUESTION_PARTS.map((q) => view.querySelector(q));
    parts.forEach((el) => { el.style.transition = "none"; el.classList.toggle("held", questionHeld); });
    void view.offsetHeight;
    parts.forEach((el) => el.style.removeProperty("transition"));
    if (questionObserver) questionObserver.disconnect();
    if (questionHeld) {
      questionObserver = new IntersectionObserver((list) => {
        if (list.some((x) => x.isIntersecting)) showQuestion();
      }, { rootMargin: "0px 0px -15% 0px" });
      questionObserver.observe(view.querySelector(".question"));
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

  // ---------- Android back button ----------
  // Closes whatever is open first, then goes back to today, then leaves the app.
  function onBack() {
    if (!$("welcome").hidden) return;
    if (!$("term-card").hidden) return closeTerm();
    if (!$("picker").hidden) return closePicker();
    if (silence) return finishSilence();
    if (!$("closing").hidden) return hideClosing();
    if (!$("note").hidden) return setWriting(false);
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
    window.addEventListener("resize", () => { if (questionHeld) holdQuestion(); });
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

    document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => openPicker(b)));
    $("picker-back").addEventListener("click", closePicker);
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

  // The first opening of the day is slow on purpose: greeting and date line by line, then
  // the thought with its source, then the question and the actions. Later openings that
  // day simply fade in. A tap anywhere shows everything at once.
  const STEP_S = 1.4, RISE_S = 2.2;
  function prepareReveal() {
    const view = $("view-day");
    if (view.hidden || store.get("revealed") === todayKey()) return false;
    holdQuestion();
    const groups = [["#greeting"], ["#day-date"], ["#teaser"],
      ["#pause-1", "#day-path", ".passage", "#view-day .source", "#context-toggle"],
      ["#pause-2", ".question-label"], ["#day-prompt"], ["#view-day .actions", "#note-preview"]];
    let step = 0;
    for (const group of groups) {
      const els = group.map((q) => view.querySelector(q))
        .filter((el) => el && !el.hidden && !el.classList.contains("held") && !el.closest(".held"));
      if (!els.length) continue;
      for (const el of els) { el.dataset.step = ""; el.style.setProperty("--step", step); }
      step++;
    }
    view.style.setProperty("--step-s", STEP_S + "s");
    view.style.setProperty("--rise-s", RISE_S + "s");
    // Hide everything at once: the question block has its own fade (for scrolling into
    // view), which would otherwise let it linger while the rest is already hidden.
    const parts = QUESTION_PARTS.map((q) => view.querySelector(q));
    parts.forEach((el) => (el.style.transition = "none"));
    view.classList.add("reveal");
    void view.offsetHeight;
    parts.forEach((el) => el.style.removeProperty("transition"));
    prepareReveal.steps = step;
    store.set("revealed", todayKey());
    return true;
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
    updateHint();
  }

  async function init() {
    setTimeout(() => $("launch")?.classList.add("done"), 5000);  // never leave it up if loading fails
    applyTheme(store.get("theme", "auto"));
    setMinutes(store.get("minutes", "3"));
    setSitMode(sitMode());
    setSound(store.get("sound", "off"));
    setBackupEvery(store.get("backupEvery", "30"));
    fillBlocks();
    const [e, c] = await Promise.all([
      fetch("entries.json", { cache: "no-cache" }).then((r) => r.json()),
      fetch("calendar.json", { cache: "no-cache" }).then((r) => r.json()),
    ]);
    entries = e;
    entriesById = Object.fromEntries(entries.map((x) => [x.id, x]));
    calendar = c;
    upgradeNotes();
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
