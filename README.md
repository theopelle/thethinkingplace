# The Thinking Place

Philosophy, one day at a time. Every day, one short passage from the great thinkers of
East and West, the same for everyone. A note explains it in plain words, and a question
stays with you.

Free, with no ads, no tracking and no account. Notes stay on the reader's device, and the
app works offline.

**Website:** [thinkingplace.app](https://thinkingplace.app) · **Contact:** hello@thinkingplace.app

## What's here

| Folder / file | What it is |
| --- | --- |
| `index.html`, `app.js`, `style.css`, `sw.js` | The app: plain HTML, CSS and JavaScript, no framework |
| `content/` | The content team's spreadsheets, the master copy of every thought, the calendar and the glossary |
| `tools/` | Scripts that download the source texts, check every quote, build the content and the website |
| `web/` | The website pages, built into `site/` |
| `android/` | The Android app (Capacitor) |
| `brand/` | Logo, colours and brand guide |

## Build

```bash
python3 tools/fetch_content.py <sources-dir>   # once: downloads the public-domain source texts
python3 tools/build_content.py <sources-dir>   # checks every quote word for word, writes the JSON
python3 tools/make_site.py                     # the website, in site/
sh tools/make_apk.sh                           # the website, plus the Android APK
```

Local preview: `python3 server.py`, then open http://localhost:8770.

## The texts

Every quotation comes from a text or translation in the public domain in the EU, or a CC0
translation, or our own translation from French. Each one is checked word for word against
its downloaded source, and credited under the thought with a link to it. Light
modernisations follow documented rules and are credited as such.

## Rights

The code, the notes and the questions are © The Thinking Place, all rights reserved. The
quoted texts are in the public domain. The Literata font (SIL Open Font License) and jsPDF
(MIT) are included under their own licences.
