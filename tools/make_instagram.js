// The Thinking Place: a year of Instagram posts, each the thought the app shows that day.
//
//   node tools/make_instagram.js [first-date] [weeks] [--only=YYYY-MM-DD,…]
//
// Monday: the quote as one image. Wednesday: a carousel (quote, about this thought, the
// question, end card). Friday: the question as one image. Pinned dates are always a
// carousel. Posts alternate light and dark. A revisit day posts the revisited thought only
// if it has not been on Instagram yet, otherwise it is skipped. Writes
// exports/instagram/<month>/<date>-<id>/slide-1….png, posts.json (read by
// tools/make_instagram_sheet.py) and index.html, a contact sheet to review them.
// Quote text, source and credit are copied from entries.json as they are, never retyped.
// Needs Node 22+ (native WebSocket) and Google Chrome.
"use strict";
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");

const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "exports", "instagram");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
require(path.join(ROOT, "calendar.js"));
const T = globalThis.ThinkingCalendar;
const calendar = require(path.join(ROOT, "calendar.json"));
const entries = Object.fromEntries(require(path.join(ROOT, "entries.json")).map((e) => [e.id, e]));

const FORMAT_ON = { 1: "quote", 3: "carousel", 5: "question" };  // Monday, Wednesday, Friday
const SLIDES = { quote: ["quote"], carousel: ["quote", "note", "question", "end"], question: ["card"] };
// Change when the Play Store link is live, then run again.
const APP_LINE = "Read it free at thinkingplace.app (the Android app is coming soon).";
const GOD = /\b(god|gods|god's|divine|lord|allah|almighty|deity|creator)\b/i;

const PATH_LABEL = {
  "Stoicism": "Stoicism", "Taoism": "Taoism", "Buddhist Philosophy": "Buddhist philosophy",
  "Confucianism": "Confucianism", "Indian Philosophy": "Indian philosophy",
  "Persian and Sufi Poetry": "Persian and Sufi poetry", "Japanese Aesthetics": "Japanese aesthetics",
  "Epicureanism": "Epicureanism", "Classical Greek Philosophy": "Ancient Greece",
  "Enlightenment Ethics": "The Enlightenment", "Existential Thought": "Existential thought",
  "Humanists and Essayists": "Humanists and essayists",
};
const PATH_TAGS = {
  "Stoicism": ["#stoicism", "#stoic"], "Taoism": ["#taoism", "#taoteching"],
  "Buddhist Philosophy": ["#buddhistphilosophy", "#dhammapada"], "Confucianism": ["#confucius", "#chinesephilosophy"],
  "Indian Philosophy": ["#indianphilosophy"], "Persian and Sufi Poetry": ["#persianpoetry", "#sufipoetry"],
  "Japanese Aesthetics": ["#japaneseaesthetics", "#wabisabi"], "Epicureanism": ["#epicurus", "#epicureanism"],
  "Classical Greek Philosophy": ["#ancientgreece", "#greekphilosophy"], "Enlightenment Ethics": ["#enlightenment", "#ethics"],
  "Existential Thought": ["#existentialism"], "Humanists and Essayists": ["#essays", "#humanism"],
};
// Full names for sources that start with a short name or a book title.
const AUTHOR = { "Kant": "Immanuel Kant", "Mill": "John Stuart Mill", "Analects": "Confucius and his students" };

function author(e) {
  const first = e.source.split(",")[0].trim();
  if (/^Dhammapada/.test(first)) return "Dhammapada";
  if (/^Analects/.test(first)) return AUTHOR.Analects;
  return AUTHOR[first] || first;
}
// As the app shows it (app.js): "Translation: …" unless the credit already says so.
const credit = (e) => (/^(Written in English|Translated)/.test(e.translation) ? "" : "Translation: ") + e.translation;
const firstSentence = (s) => (s.match(/^.*?[.!?](?=\s|$)/) || [s])[0];
const authorTag = (a) => "#" + a.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase();

function plan(first, weeks) {
  const posts = [], posted = new Set();
  for (let i = 0, key = first; i < weeks * 7; i++, key = T.addDays(key, 1)) {
    const d = T.dayInfo(calendar, key), wd = new Date(T.keyToUTC(key)).getUTCDay();
    const format = d.pinned ? "carousel" : FORMAT_ON[wd];
    if (!format) continue;
    if (d.revisit && posted.has(d.id)) { console.log(`skip ${key}: revisit of #${d.id}, already posted`); continue; }
    const e = entries[d.id];
    if (GOD.test([e.text, e.context, e.prompt].join(" "))) { console.log(`skip ${key}: #${e.id} mentions God`); continue; }
    posts.push(post(key, d, e, format, posts.length % 2 ? "dark" : "light"));
    posted.add(d.id);
  }
  return posts;
}

function post(key, d, e, format, mode) {
  const a = author(e), date = T.formatDate(key), page = mode === "dark" ? "a dark page" : "a pale page";
  const tags = ["#philosophy", "#dailyphilosophy", ...PATH_TAGS[e.path]];
  if (!/^(Dhammapada|Confucius and)/.test(a) && a.split(" ").length <= 3) tags.push(authorTag(a));
  const quote = `“${e.text}”\n— ${e.source}\n${credit(e)}`;
  const today = `This is the thought in The Thinking Place on ${date}. ${APP_LINE}`;
  const caption = (format === "question" ? [
    `A question to sit with: ${e.prompt}`,
    `It comes from today’s thought:\n${quote}`,
    firstSentence(e.context),
    "An answer is welcome in the comments, or keep it for yourself.",
    today,
  ] : [
    quote,
    (d.pinned ? `A thought for ${d.pinned.occasion}. ` : "") + firstSentence(e.context),
    `A question to sit with: ${e.prompt}`,
    today,
  ]).concat(tags.join(" ")).join("\n\n");
  const alt = {
    quote: `A quote on ${page}: “${e.text}” ${e.source}. ${credit(e)}.`,
    note: `About this thought: ${e.context}`,
    question: `A question to sit with: ${e.prompt}`,
    end: "The Thinking Place logo, twelve rays around a crescent, with the words “Philosophy, one day at a time.” and thinkingplace.app.",
    card: `A question on ${page}: ${e.prompt} From today’s thought: ${e.source}.`,
  };
  return {
    key, date, weekday: date.split(",")[0], id: e.id, author: a, path: e.path, pathLabel: PATH_LABEL[e.path],
    occasion: d.pinned ? d.pinned.occasion : "", revisit: d.revisit, format, mode, single: format !== "carousel",
    slides: SLIDES[format], folder: `${key.slice(0, 7)}/${key}-${e.id}`,
    text: e.text, source: e.source, credit: credit(e), context: e.context, prompt: e.prompt,
    caption, alt: SLIDES[format].map((k) => alt[k]),
  };
}

// --- headless Chrome over the DevTools protocol ---
async function chrome() {
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "tp-chrome-"));
  const proc = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--allow-file-access-from-files", "--hide-scrollbars", "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((ok, fail) => {
    let buf = "";
    proc.stderr.on("data", (c) => { buf += c; const m = buf.match(/DevTools listening on (ws:\S+)/); if (m) ok(m[1]); });
    setTimeout(() => fail(new Error("Chrome did not start")), 15000);
  });
  const port = new URL(wsUrl).port;
  const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener("open", ok, { once: true }));
  let seq = 0; const waiting = new Map(), events = [];
  ws.addEventListener("message", (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { const [ok, fail] = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? fail(new Error(msg.error.message)) : ok(msg.result); }
    else if (msg.method) events.forEach((f) => f(msg));
  });
  const send = (method, params = {}) => new Promise((ok, fail) => { const id = ++seq; waiting.set(id, [ok, fail]); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method) => new Promise((ok) => { const f = (m) => { if (m.method === method) { events.splice(events.indexOf(f), 1); ok(m); } }; events.push(f); });
  const close = () => new Promise((ok) => { proc.once("exit", () => { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); ok(); }); ws.close(); proc.kill(); });
  return { send, once, close };
}

async function render(posts) {
  const c = await chrome();
  try {
    await c.send("Page.enable");
    await c.send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1350, deviceScaleFactor: 1, mobile: false });
    const loaded = c.once("Page.loadEventFired");
    await c.send("Page.navigate", { url: "file://" + path.join(__dirname, "instagram", "slide.html") });
    await loaded;
    for (const p of posts) {
      const dir = path.join(OUT, p.folder);
      fs.mkdirSync(dir, { recursive: true });
      for (let s = 1; s <= p.slides.length; s++) {
        const r = await c.send("Runtime.evaluate", { expression: `render(${JSON.stringify(p)}, "${p.slides[s - 1]}")`, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
        if (!r.result.value) console.warn(`  ${p.folder} slide ${s}: text does not fit`);
        const shot = await c.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(dir, `slide-${s}.png`), Buffer.from(shot.data, "base64"));
      }
      console.log(`${p.folder}  ${p.format} ${p.mode}  ${p.author}`);
    }
  } finally { await c.close(); }
}

// --- contact sheet ---
const FORMAT_NAME = { quote: "quote", carousel: "carousel", question: "question card" };
function contactSheet(posts) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  const month = (p) => new Date(T.keyToUTC(p.key)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const months = [...new Set(posts.map(month))];
  const card = (p) => `
<section>
  <h3>${esc(p.date)} <span>${FORMAT_NAME[p.format]} · ${p.mode} · #${p.id} ${esc(p.author)} · ${esc(p.pathLabel)}${p.occasion ? " · <b>" + esc(p.occasion) + "</b>" : ""}${p.revisit ? " · revisit" : ""}</span></h3>
  <div class="slides">${p.slides.map((_, s) => `<a href="${p.folder}/slide-${s + 1}.png"><img src="${p.folder}/slide-${s + 1}.png" alt="${esc(p.alt[s])}" loading="lazy"></a>`).join("")}</div>
  <details><summary>caption</summary><pre>${esc(p.caption)}</pre></details>
</section>`;
  const body = months.map((m, n) => `<h2 id="m${n}">${m} <span>${posts.filter((p) => month(p) === m).length} posts</span></h2>` +
    posts.filter((p) => month(p) === m).map(card).join("")).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram posts · The Thinking Place</title><style>
body { margin: 0; padding: 32px 16px 64px; background: #F1EFEA; color: #262626; font: 15px/1.5 -apple-system, sans-serif; }
main { max-width: 1100px; margin: 0 auto; } h1 { font: 400 28px/1.2 Georgia, serif; margin: 0 0 4px; } .lede { color: #6B6862; margin: 0 0 12px; }
nav { position: sticky; top: 0; background: #F1EFEA; padding: 8px 0; margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px 14px; z-index: 1; }
nav a { color: #4E7378; } h2 { font: 400 22px/1.2 Georgia, serif; margin: 36px 0 12px; } h2 span, h3 span { font: 400 14px -apple-system, sans-serif; color: #6B6862; }
section { background: #FBFAF7; border: 1px solid #E3DFD7; border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
h3 { font-size: 15px; margin: 0 0 10px; } h3 b { color: #4E7378; }
.slides { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; } .slides img { width: 100%; display: block; border: 1px solid #E3DFD7; border-radius: 4px; }
summary { cursor: pointer; color: #4E7378; margin-top: 10px; } pre { white-space: pre-wrap; font: 14px/1.5 -apple-system, sans-serif; background: #F1EFEA; padding: 12px; border-radius: 6px; }
@media (max-width: 600px) { .slides { grid-template-columns: repeat(2, 1fr); } }
</style></head><body><main>
<h1>Instagram posts</h1><p class="lede">${posts.length} posts, ${esc(posts[0].date)} ${posts[0].key.slice(0, 4)} to ${esc(posts.at(-1).date)} ${posts.at(-1).key.slice(0, 4)}. Each one is the thought the app shows that day. Click a slide to open it full size.</p>
<nav>${months.map((m, n) => `<a href="#m${n}">${m.replace(/ (\d+)$/, " ’$1").replace(/’\d\d(\d\d)/, "’$1")}</a>`).join("")}</nav>
${body}
</main></body></html>`;
}

async function main() {
  const args = process.argv.slice(2), only = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
  const [first = "2026-10-26", weeks = "13"] = args.filter((a) => !a.startsWith("--"));
  let posts = plan(first, Number(weeks));
  if (only) posts = posts.filter((p) => only.split(",").includes(p.key));
  // A full run starts clean, leaving other files here (the spreadsheet) alone.
  else for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) if (/^\d{4}-\d{2}/.test(f)) fs.rmSync(path.join(OUT, f), { recursive: true });
  await render(posts);
  fs.writeFileSync(path.join(OUT, "posts.json"), JSON.stringify(posts, null, 1));
  fs.writeFileSync(path.join(OUT, "index.html"), contactSheet(posts));
  console.log(`${posts.length} posts in ${path.relative(ROOT, OUT)}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
