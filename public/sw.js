// Lanyard service worker: your card still opens with no signal in a packed venue.
//
// What it stores, on this device only:
// - the app's own code, styles, fonts and icons (cache-first; file names are content-hashed)
// - the app page itself (network-first, so updates land straight away)
// - your own /api/me response (network-first), which is what draws your badge and QR
// Nothing else from the API is stored, and no photos (shared selfies stay private).
// Signing out or deleting your account clears the stored /api/me copy.
const VERSION = "v1";
const SHELL = `lanyard-shell-${VERSION}`;
const DATA = `lanyard-data-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Cache the app page plus the scripts and styles it references.
    try {
      const res = await fetch("/", { cache: "no-cache" });
      if (res.ok) {
        const html = await res.clone().text();
        await cache.put("/", res);
        const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.addAll([...new Set([...assets, "/fonts/atkinson-latin.woff2", "/manifest.webmanifest", "/icon-192.png"])]);
      }
    } catch { /* offline during install: fill the cache as the app is used */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("lanyard-") && key !== SHELL && key !== DATA) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-data") event.waitUntil(caches.delete(DATA));
});

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(cacheKey, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/me") {
    event.respondWith(networkFirst(req, DATA, "/api/me"));
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/") || url.pathname === "/sw.js") return;

  if (req.mode === "navigate") {
    // Any page of the app: try the network, fall back to the cached app page.
    event.respondWith(fetch(req).then((res) => {
      if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put("/", copy));
      }
      return res;
    }).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/fonts/") || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});
