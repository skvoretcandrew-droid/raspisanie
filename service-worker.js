/* Версию кеша меняйте после заметных обновлений файлов. */
const CACHE_NAME = "schedule-v14";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css?v=14",
  "./app.js?v=14",
  "./auth.js?v=14",
  "./manifest.json",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    const update = fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", response.clone()));
      return response;
    }).catch(() => null);
    event.waitUntil(update);
    event.respondWith(
      caches.match("./index.html").then((cached) => {
        if (cached) return cached;
        return update.then((response) => response || caches.match("./"));
      })
    );
    return;
  }

  const update = fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => null);
  event.waitUntil(update);
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return update;
    })
  );
});
