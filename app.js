// Reflect — one thought a day, the same for everyone.
(() => {
  "use strict";

  // Day 0 of the rotation. Everyone on the same calendar date sees the same entry.
  const EPOCH = Date.UTC(2026, 0, 1);
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
    const n = entries.length;
    return entries[((dayNumber(key) % n) + n) % n];
  };
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

  // Shown under "about this passage" on the few days a month the moon is marked by a tradition.
  const MOON_NOTES = {
    "full moon": "Full moon: in Buddhism and Hinduism, a traditional day of reflection.",
    "new moon": "New moon: a day of observance in Buddhism and Hinduism. The Jewish month begins at the new moon, and the Islamic month with the first crescent after it.",
  };

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
    const today = todayKey();
    // No peeking ahead.
    if (key > today) key = today;
    currentKey = key;
    const e = entryFor(key);

    const moon = moonPhase(key);
    $("day-date").innerHTML =
      (key === today ? "Today · " : "") + formatDate(key) +
      ` · <span class="moon" title="${moon.label}">${moonIcon(moon.phase)}${moon.label}</span>`;
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
    $("day-tradition").textContent = e.tradition;
    $("day-context-text").textContent = e.context;
    const tr = $("day-translation");
    tr.textContent = "Translation: " + e.translation + " · ";
    const link = document.createElement("a");
    link.href = e.source_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "source";
    tr.appendChild(link);
    $("day-prompt").textContent = e.prompt;

    const moonNote = MOON_NOTES[moon.label];
    $("day-moon-note").textContent = moonNote || "";
    $("day-moon-note").hidden = !moonNote;
    $("returning").hidden = !(key === today && returning);
    renderGreeting(key === today);

    $("day-context").hidden = true;
    $("context-toggle").setAttribute("aria-expanded", "false");

    const note = store.get("note:" + key, "");
    $("note-text").value = note;
    $("note").hidden = !note;
    $("note-done").hidden = !(note.trim() && key === today);
    $("note-status").textContent = "";
    $("back-to-today").hidden = key === today;
  }

  let saveTimer;
  function onNoteInput() {
    clearTimeout(saveTimer);
    $("note-done").hidden = !($("note-text").value.trim() && currentKey === todayKey());
    $("note-status").textContent = "";
    saveTimer = setTimeout(() => {
      const text = $("note-text").value;
      const ok = text.trim() ? store.set("note:" + currentKey, text) : (store.remove("note:" + currentKey), true);
      $("note-status").textContent = ok ? "saved" : "could not save on this device";
    }, 600);
  }

  // Shares the passage and its source only; the reflection question stays personal.
  async function share() {
    const e = entryFor(currentKey);
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
    const list = $("journal-list");
    list.textContent = "";
    const today = keyToUTC(todayKey());
    const start = Math.max(EPOCH, today - (JOURNAL_DAYS - 1) * DAY);
    // Also include older days that have notes.
    const noted = new Set(store.keys("note:").map((k) => k.slice(5)));
    const keys = new Set(noted);
    for (let t = today; t >= start; t -= DAY) keys.add(utcToKey(t));

    [...keys].filter((k) => k <= todayKey()).sort().reverse().forEach((key) => {
      const e = entryFor(key);
      const note = store.get("note:" + key, "");
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
      const e = entryFor(key);
      return `${key} — ${e.source} (${e.tradition})\n“${e.text}”\n${e.prompt}\n\n${store.get("note:" + key, "")}\n`;
    }).join("\n---\n\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    a.download = `reflect-notes-${todayKey()}.txt`;
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

  function openSilence() {
    const minutes = Number(store.get("minutes", "3"));
    silence = { end: Date.now() + minutes * 60000, timers: [] };
    $("silence").hidden = false;
    bell();

    const breath = $("breath"), cue = $("breath-cue");
    const cycle = () => {
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
      $("silence").hidden = true;
      if (silence.audio) silence.audio.close().catch(() => {});
      silence = null;
    } else {
      $("close-silence").textContent = "return";
    }
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
    $("welcome").hidden = false;
    $("welcome").addEventListener("submit", (ev) => {
      ev.preventDefault();
      saveName($("welcome-name").value);
      store.set("welcomed", "1");
      $("welcome").hidden = true;
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
    $("report-link").href = mail("Reflect: an issue",
      `What happened?\n\n\nWhat did you expect?\n\n\n—\nDay: ${todayKey()} (${e.id})\nDevice: ${navigator.userAgent}`);
    $("suggest-link").href = mail("Reflect: a reflection suggestion",
      "The passage (with author, book and translation if you know it):\n\n\nWhich tradition is it from?\n\n\nWhy does it speak to you?\n\n");
  }

  // ---------- gentle ending ----------
  // The app has an end: after a full silence or a finished note, it says goodbye for the day.
  // `after` is what was just finished ("writing" or "silence"); the other one is offered next.
  function showClosing(after) {
    $("note-text").blur();
    $("closing-write").hidden = after === "writing";
    $("closing-silence").hidden = after === "silence";
    $("closing").hidden = false;
  }

  function hideClosing() {
    $("closing").hidden = true;
  }

  // A later visit on the same day (a fresh launch, or back after half an hour away)
  // is greeted with a reminder that today's thought has been read.
  const AWAY_MS = 30 * 60 * 1000;
  let returning = false, hiddenAt = 0;

  function markVisit() {
    const today = todayKey();
    let fresh = false;
    try { fresh = !sessionStorage.getItem("reflect:session"); sessionStorage.setItem("reflect:session", "1"); } catch {}
    returning = fresh && store.get("lastSeen") === today;
    store.set("lastSeen", today);
  }

  function onVisibility() {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > AWAY_MS && store.get("lastSeen") === todayKey()) {
      returning = true;
      if (!location.hash.replace(/^#\/?/, "")) renderDay(todayKey());
    }
  }

  // ---------- offline ----------
  async function renderOfflineStatus() {
    const el = $("offline-status");
    if (!("serviceWorker" in navigator) || !window.caches) {
      el.textContent = "This browser can't keep Reflect offline.";
      return;
    }
    try {
      // `ready` never settles where service workers are blocked, so give up after a few seconds.
      const timeout = new Promise((_, reject) => setTimeout(reject, 4000));
      await Promise.race([navigator.serviceWorker.ready, timeout]);
      const ready = await caches.match("entries.json", { ignoreSearch: true });
      el.textContent = ready
        ? "Ready. Reflect works without a connection, so you can switch off your network and read undisturbed."
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

  // ---------- wire up ----------
  function bind() {
    $("context-toggle").addEventListener("click", () => {
      const open = $("day-context").hidden;
      $("day-context").hidden = !open;
      $("context-toggle").setAttribute("aria-expanded", String(open));
    });
    $("open-note").addEventListener("click", () => {
      $("note").hidden = false;
      $("note-text").focus();
    });
    $("note-text").addEventListener("input", onNoteInput);
    $("share").addEventListener("click", share);
    $("back-to-today").addEventListener("click", () => (location.hash = "#/"));
    $("open-silence").addEventListener("click", () => { $("close-silence").textContent = "end"; openSilence(); });
    $("close-silence").addEventListener("click", () => {
      const completed = silence && silence.completed;
      finishSilence(true);
      if (completed && currentKey === todayKey()) showClosing("silence");
    });
    $("note-done").addEventListener("click", () => showClosing("writing"));
    $("closing-back").addEventListener("click", () => { hideClosing(); window.scrollTo(0, 0); });
    $("closing-write").addEventListener("click", () => {
      hideClosing();
      $("note").hidden = false;
      $("note-text").focus();
    });
    $("closing-silence").addEventListener("click", () => {
      hideClosing();
      $("close-silence").textContent = "end";
      openSilence();
    });
    $("closing-share").addEventListener("click", share);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && silence) finishSilence(true); });

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

  async function init() {
    applyTheme(store.get("theme", "auto"));
    setMinutes(store.get("minutes", "3"));
    const res = await fetch("entries.json", { cache: "no-cache" });
    entries = await res.json();
    bind();
    markVisit();
    route();
    maybeWelcome();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  init();
})();
