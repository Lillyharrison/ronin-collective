// Ronin Estates Service Worker
// Strategy:
//   - index.html (navigation) → NETWORK-FIRST (always get latest code)
//   - App shell (JS/CSS/fonts/images) → Cache-first (hashed filenames handle versioning)
//   - Supabase REST/storage → Network-first with stale fallback
//   - Auth / edge functions → Always network, never cache
//
// skipWaiting() ensures new code takes effect immediately — no "close & reopen".

const CACHE_VERSION = "ronin-v8";
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

// Assets that form the app shell — cached aggressively
const SHELL_PATTERNS = [/\.js$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.ico$/, /\.svg$/];

// Supabase REST patterns — network-first with stale cache fallback
const DATA_PATTERNS = [/supabase\.co\/rest\/v1\//, /supabase\.co\/storage\/v1\//];

// Never cache these paths — auth redirects and push subscriptions must hit network
const NEVER_CACHE = [/\/~oauth/, /functions\/v1\//, /auth\/v1\//];

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(["/"])).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith("ronin-") && k !== SHELL_CACHE && k !== DATA_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => clients.claim())
  );
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Never cache auth / edge function calls
  if (NEVER_CACHE.some(p => p.test(url.href))) return;

  // HTML navigation — NETWORK-FIRST so users always get the latest index.html
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstHTML(request, SHELL_CACHE));
    return;
  }

  // App shell assets (JS/CSS/fonts/images) — cache-first
  // Vite hashes filenames so new deploys = new URLs = automatic cache bust
  if (SHELL_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Supabase REST/storage — network-first with stale cache fallback
  if (DATA_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(networkFirstWithStale(request, DATA_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

// For HTML: always try network first so the latest code bundle references load
async function networkFirstHTML(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/html" } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    // Revalidate in background for next visit
    fetch(request)
      .then(res => { if (res && res.ok) cache.put(request, res); })
      .catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    throw err;
  }
}

async function networkFirstWithStale(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Network unavailable and no cached response");
  }
}

// ── Background Sync (Chrome/Android) ─────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "ronin-sync-queue") {
    event.waitUntil(
      clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
        cs.forEach(c => c.postMessage({ type: "SYNC_QUEUE" }));
      })
    );
  }
});


self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "New notification", body: event.data.text(), url: "/" };
  }

  const { title = "Ronin Estates", body = "", url = "/", icon = "/favicon.ico", badge = "/favicon.ico" } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      vibrate: [200, 100, 200],
      tag: "ronin-message",
      renotify: true,
    })
  );
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
