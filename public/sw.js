// Minimal offline-capable service worker for NeuroMetric.
// Cache-first for the app shell; network-first for everything else (dev HMR stays working).

const CACHE = "neurometric-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Dev-only paths (Vite HMR) — always network.
  if (url.pathname.startsWith("/@") || url.pathname.startsWith("/node_modules")) return;

  event.respondWith(
    (async () => {
      try {
        const net = await fetch(req);
        if (net && net.status === 200) {
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
        }
        return net;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("Offline", { status: 503 });
      }
    })(),
  );
});
