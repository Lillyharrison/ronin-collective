// Ronin Estates Service Worker
// Strategy:
//   - index.html (navigation) → NETWORK-ONLY (never cache HTML — prevents stale shell)
//   - App shell (JS/CSS/fonts/images) → Cache-first (hashed filenames handle versioning)
//   - Supabase REST/storage → Network-only (always fresh data; no offline fallback for now)
//   - Auth / edge functions → Always network, never cache
//
// skipWaiting() + controllerchange reload ensures new code takes effect on the very
// next page load — critical for iOS Safari PWA where SW updates are sticky.

// ⚠️ BUMP THIS on every meaningful release to force a clean cache wipe.
const CACHE_VERSION = "ronin-v9";
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;

// Assets that form the app shell — cached aggressively (hashed by Vite)
const SHELL_PATTERNS = [/\.js$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.ico$/, /\.svg$/];

// Never cache these paths — auth redirects, API and push subscriptions must hit network
const NEVER_CACHE = [
  /\/~oauth/,
  /functions\/v1\//,
  /auth\/v1\//,
  /supabase\.co\/rest\/v1\//,
  /supabase\.co\/storage\/v1\//,
  /supabase\.co\/realtime\/v1\//,
];

// ── Lifecycle ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k.startsWith("ronin-") && k !== SHELL_CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Allow the page to ask the SW to skip waiting on demand
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (NEVER_CACHE.some(p => p.test(url.href))) return;

  // HTML navigation — NETWORK-ONLY. Never cache index.html so users always get
  // the latest bundle references. Falls through to network on failure (browser handles offline UI).
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(fetch(request).catch(() => new Response(
      "<h1>Offline</h1><p>Please reconnect.</p>",
      { status: 503, headers: { "Content-Type": "text/html" } }
    )));
    return;
  }

  // App shell assets (JS/CSS/fonts/images) — cache-first
  // Vite hashes filenames so new deploys = new URLs = automatic cache bust
  if (SHELL_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    throw err;
  }
}

// ── Background Sync (Chrome/Android) ─────────────────────────────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "ronin-sync-queue") {
    event.waitUntil(
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
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
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
