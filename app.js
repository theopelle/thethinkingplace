// Many Wells — one thought a day, the same for everyone.
(() => {
  "use strict";

  // Day 0 of the rotation. Everyone on the same calendar date sees the same entry.
  const EPOCH = Date.UTC(2026, 0, 1);

  // Which passage belongs to which day. Append-only: to add passages, append them to
  // entries.json and add a block here starting on a FUTURE date. Days before that date
  // keep the passage they always had. `start` is where in the list the block begins
  // (use the previous count so new passages come first), then it cycles through `count`.
  const SCHEDULE = [
    { from: "2026-01-01", count: 365, start: 0 },
  ];
  const DAY = 86400000;
  const JOURNAL_DAYS = 60;

  // Where feedback and donations go. Fill these in before launch.
  const CONTACT_EMAIL = "hello@example.com";          // TODO: real address
  const DONATE_URL = "https://buymeacoffee.com/";     // TODO: your Buy Me a Coffee page

  // Apple doesn't allow App Store apps to point to outside payment pages, so the
  // support section is hidden inside the native iOS app (wrapped with Capacitor).
  // Safari and home-screen installs from the website still show it.
  const IN_IOS_APP = !!(window.Capacitor && window.Capacitor.getPlatform &&
                        window.Capacitor.getPlatform() === "ios");

  const $ = (id) => document.getElementById(id);
  let entries = [];
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
  const dayNumber = (key) => Math.round((keyToUTC(key) - EPOCH) / DAY);
  const entryFor = (key) => {
    const block = SCHEDULE.filter((b) => b.from <= key).pop() || SCHEDULE[0];
    const days = Math.round((keyToUTC(key) - keyToUTC(block.from)) / DAY);
    const n = block.count;
    return entries[(((block.start + days) % n) + n) % n];
  };

  // ---------- notes ----------
  // Each note is stored with the id of the passage it was written about, so the pair
  // stays together even if the schedule ever changes.
  let entriesById = {};

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
    return store.set("note:" + key, JSON.stringify({ text, id }));
  }

  // The passage to show for a day: the one its note was written about, if any.
  function entryShown(key) {
    const note = readNote(key);
    return (note && note.id && entriesById[note.id]) || entryFor(key);
  }

  // One-time upgrade: older notes (plain text) get the id of the passage they were written on.
  function upgradeNotes() {
    for (const k of store.keys("note:")) {
      const key = k.slice(5);
      const note = readNote(key);
      if (note && !note.id) writeNote(key, note.text, entryFor(key).id);
    }
  }
  const formatDate = (key) =>
    new Date(keyToUTC(key)).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

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
    document.querySelectorAll("[data-theme-choice]").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.themeChoice === choice)));
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
    // Verse (Lucretius) arrives with line breaks: one block per line, wrapped parts indented.
    const textEl = $("day-text");
    textEl.textContent = "";
    if (e.text.includes("\n")) {
      for (const line of e.text.split("\n")) {
        const span = document.createElement("span");
        span.className = "verse-line";
        span.textContent = line;
        textEl.appendChild(span);
      }
    } else {
      textEl.textContent = e.text;
    }
    // Short passages stay centred; longer ones switch to left-aligned for easier reading.
    const passage = $("day-text").parentElement;
    passage.classList.toggle("long", e.text.length > 160);
    passage.classList.toggle("very-long", e.text.length > 320);
    passage.classList.toggle("verse", e.text.includes("\n"));
    $("day-source").textContent = e.source;
    $("day-full").hidden = !e.shortened;
    if (e.shortened) $("day-full-link").href = e.full_url;
    $("day-tradition").textContent = e.tradition;
    $("day-context-text").textContent = e.context;
    const tr = $("day-translation");
    tr.textContent = (/^Written in English/.test(e.translation) ? "" : "Translation: ") + e.translation + " · ";
    const link = document.createElement("a");
    link.href = e.source_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "source";
    tr.appendChild(link);
    $("day-prompt").textContent = e.prompt;

    markTerms(e.tradition, ["day-text", "day-tradition", "day-source", "day-context-text"]);
    $("returning").hidden = !(key === today && returning);
    renderGreeting(key === today);

    showContext(store.get("context", "shown") !== "hidden");

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
    if (open) $("note-text").focus();
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

  // Shares the passage and its source only; the reflection question stays personal.
  async function share() {
    const e = entryShown(currentKey);
    const text = `“${e.text}”\n— ${e.source}`;
    if (await copyText(text)) toast("Copied to clipboard. Paste it anywhere you like.");
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

  // ---------- journal ----------
  function renderJournal() {
    const n = dayCount();
    $("journal-count").textContent = n === 1 ? "You've sat with 1 thought so far." : `You've sat with ${n} thoughts so far.`;
    $("journal-count").hidden = n < 1;
    const list = $("journal-list");
    list.textContent = "";
    const today = keyToUTC(todayKey());
    const start = Math.max(EPOCH, today - (JOURNAL_DAYS - 1) * DAY);
    // Also include older days that have notes.
    const noted = new Set(store.keys("note:").map((k) => k.slice(5)));
    const keys = new Set(noted);
    for (let t = today; t >= start; t -= DAY) keys.add(utcToKey(t));

    [...keys].filter((k) => k <= todayKey()).sort().reverse().forEach((key) => {
      const e = entryShown(key);
      const note = (readNote(key) || { text: "" }).text;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#/day/" + key;
      a.innerHTML = `<div class="j-date"></div><p class="j-text"></p>`;
      a.querySelector(".j-date").textContent = `${formatDate(key)} · ${e.tradition}`;
      a.querySelector(".j-text").textContent = e.text;
      if (note) {
        const p = document.createElement("p");
        p.className = "j-note";
        p.textContent = note;
        a.appendChild(p);
      }
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  function exportNotes() {
    const keys = store.keys("note:").map((k) => k.slice(5)).sort();
    if (!keys.length) return flash($("export-notes"), "nothing yet");
    const body = keys.map((key) => {
      const e = entryShown(key);
      return `${key} — ${e.source} (${e.tradition})\n“${e.text}”\n${e.prompt}\n\n${readNote(key).text}\n`;
    }).join("\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    a.download = `many-wells-notes-${todayKey()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function clearNotes() {
    if (!confirm("Erase all your notes from this device? This cannot be undone.")) return;
    store.keys("note:").forEach((k) => store.remove(k));
    flash($("clear-notes"), "erased");
  }

  // ---------- silence ----------
  let silence = null;

  function setMinutes(m) {
    store.set("minutes", String(m));
    document.querySelectorAll("[data-minutes]").forEach((b) =>
      b.setAttribute("aria-checked", String(b.dataset.minutes === String(m))));
  }

  function bell() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      silence.audio = silence.audio || new Ctx();
      const ctx = silence.audio, t = ctx.currentTime;
      [528, 792].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(i ? 0.04 : 0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 4.1);
      });
    } catch { /* no audio, fine */ }
  }

  // Full-screen moments (silence, closing, welcome): hide the page behind from screen
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

  function openSilence() {
    const minutes = Number(store.get("minutes", "3"));
    silence = { end: Date.now() + minutes * 60000, timers: [] };
    setOverlay($("silence"), true, $("close-silence"));
    bell();

    const breath = $("breath"), cue = $("breath-cue");
    const cycle = () => {
      if (!silence) return;
      breath.classList.remove("out"); breath.classList.add("in"); cue.textContent = "breathe in";
      silence.timers.push(setTimeout(() => {
        breath.classList.add("out"); breath.classList.remove("in"); cue.textContent = "breathe out";
      }, 4000));
    };
    requestAnimationFrame(cycle);
    silence.breathing = setInterval(cycle, 10000);

    const tick = () => {
      const left = Math.max(0, silence.end - Date.now());
      const s = Math.ceil(left / 1000);
      $("remaining").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      if (left <= 0) { bell(); cue.textContent = "welcome back"; silence.completed = true; finishSilence(false); }
    };
    tick();
    silence.ticker = setInterval(tick, 250);
  }

  function finishSilence(close = true) {
    if (!silence) return;
    clearInterval(silence.ticker);
    clearInterval(silence.breathing);
    silence.timers.forEach(clearTimeout);
    $("breath").classList.remove("in", "out");
    if (close) {
      setOverlay($("silence"), false);
      if (silence.audio) silence.audio.close().catch(() => {});
      silence = null;
    } else {
      $("close-silence").textContent = "return";
    }
  }

  // ---------- glossary ----------
  // Key terms get a faint underline; tapping one opens a short explanation.
  // Each term is marked once per page, at its first appearance.
  const escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function markTerms(tradition, ids) {
    closeTerm();
    const used = new Set();
    const terms = glossary
      .map((g, i) => ({ ...g, i }))
      .filter((g) => !g.scope || g.scope.includes(tradition));
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

  // A school's card is a small introduction: who we read, where it began, its key ideas
  // (the concepts scoped to it in the glossary) and a free book to start with.
  function schoolDetails(g) {
    const ideas = glossary.filter((t) => t.scope && t.scope.includes(g.term)).map((t) => t.term);
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
    const top = below + h < window.innerHeight - 64 || above < 16 ? below : above;
    card.style.top = Math.max(16, Math.min(top, window.innerHeight - h - 16)) + "px";  // keep it on screen
    openTerm.from = btn;
    // Move focus into the card so screen readers announce the definition.
    card.focus({ preventScroll: true });
  }

  // A dot on the About page maps: where a school began.
  function openPlace(btn) {
    showCard(btn, btn.dataset.title, btn.dataset.text, btn.dataset.wiki);
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

  // First launch only: a calm welcome that asks for a name (optional).
  function maybeWelcome() {
    if (store.get("welcomed")) return;
    setOverlay($("welcome"), true, $("welcome-name"));
    $("welcome").addEventListener("submit", (ev) => {
      ev.preventDefault();
      saveName($("welcome-name").value);
      store.set("welcomed", "1");
      setOverlay($("welcome"), false);
      route();
    }, { once: true });
  }

  function saveName(value) {
    const name = value.trim().slice(0, 40);
    if (name) store.set("name", name); else store.remove("name");
  }

  // ---------- about links ----------
  function renderAboutLinks() {
    $("name-setting").value = store.get("name", "");
    $("support").hidden = IN_IOS_APP;
    $("donate-link").href = DONATE_URL;
    const e = entryFor(todayKey());
    const mail = (subject, body) =>
      `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    $("report-link").href = mail("Many Wells: an issue",
      `What happened?\n\n\nWhat did you expect?\n\n\n—\nDay: ${todayKey()} (${e.id})\nDevice: ${navigator.userAgent}`);
    $("suggest-link").href = mail("Many Wells: a suggestion",
      "What would you like to suggest? (an improvement, a thought to add, or anything else)\n\n\nIf it's a thought to add: who wrote it, in which book, and which school of thought is it from?\n\n\nWhy does it matter to you?\n\n");
  }

  // ---------- gentle ending ----------
  // The app has an end: after a full silence or a finished note, it says goodbye for the day.
  // `after` is what was just finished ("writing" or "silence"); the other one is offered next.
  function showClosing(after) {
    $("note-text").blur();
    $("closing-write").hidden = after === "writing";
    $("closing-silence").hidden = after === "silence";
    setOverlay($("closing"), true, $("closing-back"));
  }

  function hideClosing() {
    setOverlay($("closing"), false);
  }

  // A later visit on the same day (a fresh launch, or back after half an hour away)
  // is greeted with a reminder that today's thought has been read.
  const AWAY_MS = 30 * 60 * 1000;
  let returning = false, hiddenAt = 0;

  function markVisit() {
    const today = todayKey();
    let fresh = false;
    try { fresh = !sessionStorage.getItem("reflect:session"); sessionStorage.setItem("reflect:session", "1"); } catch {}
    // Once shown, the "already read" line stays for the rest of the session (a refresh included).
    let shown = false;
    try { shown = sessionStorage.getItem("reflect:returning") === today; } catch {}
    returning = shown || (fresh && store.get("lastSeen") === today);
    if (returning) rememberReturning();
    store.set("lastSeen", today);
    countDay(today);
  }

  function rememberReturning() {
    try { sessionStorage.setItem("reflect:returning", todayKey()); } catch {}
  }

  // A quiet, guilt-free count of days the app was opened. It only grows; it never resets.
  function countDay(key) {
    let days = [];
    try { days = JSON.parse(store.get("days", "[]")) || []; } catch {}
    if (!days.includes(key)) { days.push(key); store.set("days", JSON.stringify(days)); }
  }

  function dayCount() {
    try { return (JSON.parse(store.get("days", "[]")) || []).length; } catch { return 0; }
  }

  function onVisibility() {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > AWAY_MS && store.get("lastSeen") === todayKey()) {
      returning = true;
      rememberReturning();
      if (!location.hash.replace(/^#\/?/, "")) renderDay(todayKey());
    }
  }

  // ---------- offline ----------
  async function renderOfflineStatus() {
    const el = $("offline-status");
    if (!("serviceWorker" in navigator) || !window.caches) {
      el.textContent = "This browser can't keep Many Wells offline.";
      return;
    }
    try {
      // `ready` never settles where service workers are blocked, so give up after a few seconds.
      const timeout = new Promise((_, reject) => setTimeout(reject, 4000));
      await Promise.race([navigator.serviceWorker.ready, timeout]);
      const ready = await caches.match("entries.json", { ignoreSearch: true });
      el.textContent = ready
        ? "Ready. Many Wells works without a connection, so you can switch off your network and read undisturbed."
        : "Preparing… keep the app open for a moment.";
    } catch {
      el.textContent = "Offline mode is unavailable here.";
    }
  }

  // ---------- routing ----------
  function route() {
    const hash = location.hash.replace(/^#\/?/, "");
    let view = "day";
    if (hash === "journal") { view = "journal"; renderJournal(); }
    else if (hash === "about") { view = "about"; renderOfflineStatus(); renderAboutLinks(); }
    else if (hash === "terms") view = "terms";
    else {
      const m = hash.match(/^day\/(\d{4}-\d{2}-\d{2})$/);
      renderDay(m ? m[1] : todayKey());
    }
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + view));
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }

  // The note under each thought is the lesson, so it shows by default; hiding it is remembered.
  function showContext(open) {
    $("day-context").hidden = !open;
    $("context-toggle").setAttribute("aria-expanded", String(open));
    $("context-toggle").textContent = open ? "hide note" : "about this thought";
  }

  // ---------- wire up ----------
  function bind() {
    $("context-toggle").addEventListener("click", () => {
      const open = $("day-context").hidden;
      showContext(open);
      store.set("context", open ? "shown" : "hidden");
    });
    $("open-note").addEventListener("click", () => setWriting($("note").hidden));
    $("note-edit").addEventListener("click", () => setWriting(true));
    $("note-text").addEventListener("input", onNoteInput);
    $("share").addEventListener("click", share);
    $("back-to-today").addEventListener("click", () => (location.hash = "#/"));
    $("open-silence").addEventListener("click", () => { $("close-silence").textContent = "end"; openSilence(); });
    $("close-silence").addEventListener("click", () => {
      const completed = silence && silence.completed;
      finishSilence(true);
      if (completed && currentKey === todayKey()) showClosing("silence");
    });
    $("note-done").addEventListener("click", () => { setWriting(false); showClosing("writing"); });
    $("closing-back").addEventListener("click", () => { hideClosing(); window.scrollTo(0, 0); });
    $("closing-write").addEventListener("click", () => {
      hideClosing();
      setWriting(true);
    });
    $("closing-silence").addEventListener("click", () => {
      hideClosing();
      $("close-silence").textContent = "end";
      openSilence();
    });
    $("closing-share").addEventListener("click", share);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("click", (ev) => {
      const term = ev.target.closest(".term, .map-dot");
      if (term) {
        ev.preventDefault();
        if (openTerm.from === term && !$("term-card").hidden) closeTerm();
        else if (term.classList.contains("map-dot")) openPlace(term);
        else openTerm(term);
        return;
      }
      if (!ev.target.closest("#term-card")) closeTerm();
    });
    $("term-close").addEventListener("click", closeTerm);
    window.addEventListener("scroll", closeTerm, { passive: true });
    window.addEventListener("resize", closeTerm);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("term-card").hidden) closeTerm();
      else if (silence) finishSilence(true);
    });

    document.querySelectorAll("[data-theme-choice]").forEach((b) =>
      b.addEventListener("click", () => { store.set("theme", b.dataset.themeChoice); applyTheme(b.dataset.themeChoice); }));
    document.querySelectorAll("[data-minutes]").forEach((b) =>
      b.addEventListener("click", () => setMinutes(b.dataset.minutes)));
    $("export-notes").addEventListener("click", exportNotes);
    $("name-setting").addEventListener("change", (ev) => saveName(ev.target.value));
    $("clear-notes").addEventListener("click", clearNotes);

    window.addEventListener("hashchange", route);
    // Roll over to the new day if the app is left open past midnight.
    let lastDay = todayKey();
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && todayKey() !== lastDay) { lastDay = todayKey(); route(); }
    });
  }

  // The launch screen stays for at least a moment on a fresh start, then fades into today's thought.
  // Within a session (a refresh, or coming back to the app) it steps aside at once.
  function endLaunch() {
    const el = $("launch");
    if (!el) return;
    let seen = false;
    try { seen = sessionStorage.getItem("reflect:launched") === "1"; sessionStorage.setItem("reflect:launched", "1"); } catch {}
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wait = seen ? 0 : Math.max(0, (calm ? 600 : 1800) - performance.now());
    setTimeout(() => {
      el.classList.add("done");
      setTimeout(() => el.remove(), seen || calm ? 0 : 700);
    }, wait);
  }

  async function init() {
    setTimeout(() => $("launch")?.classList.add("done"), 5000);  // never leave it up if loading fails
    applyTheme(store.get("theme", "auto"));
    setMinutes(store.get("minutes", "3"));
    const res = await fetch("entries.json", { cache: "no-cache" });
    entries = await res.json();
    entriesById = Object.fromEntries(entries.map((e) => [e.id, e]));
    const needed = Math.max(...SCHEDULE.map((b) => b.count));
    if (entries.length < needed) console.error(`Schedule expects ${needed} passages, found ${entries.length}.`);
    upgradeNotes();
    try { glossary = await fetch("glossary.json", { cache: "no-cache" }).then((r) => r.json()); } catch {}
    bind();
    markVisit();
    route();
    endLaunch();
    maybeWelcome();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  init();
})();
