// Offline support. Everything the app needs is cached on first visit, so it
// opens with no network at all. Cached files are refreshed in the background
// whenever the network is available.
const CACHE = "reflect-v26";
const SHELL = ["./", "index.html", "style.css", "app.js", "entries.json", "glossary.json", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // Any page load (whatever the query string) is the single-page app.
      const key = req.mode === "navigate" ? "index.html" : req;
      const cached = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      if (cached) {
        e.waitUntil(fresh.catch(() => {}));
        return cached;
      }
      return fresh;
    })
  );
});
