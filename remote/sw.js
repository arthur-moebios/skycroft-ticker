/* Service worker do controle Skycroft — cache leve do app shell.
 * Dados (api/*) nunca são cacheados: sempre rede. */
const CACHE = "skycroft-remote-v1";
const SHELL = ["/remote", "/remote/index.html", "/remote/app.js", "/remote/style.css", "/remote/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // nunca cacheia dados ao vivo
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match("/remote/index.html")))
  );
});
