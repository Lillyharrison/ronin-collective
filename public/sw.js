// Ronin Estates Service Worker
// Strategy:
//   - index.html (navigation) → Cache-first + background revalidate (stale-while-revalidate)
//   - App shell (JS/CSS/fonts/images) → Cache-first (versioned cache)
//   - Supabase REST/storage → Network-first with stale fallback
//   - Auth / edge functions → Always network, never cache
//
// The key goal: the app shell (index.html + assets) is served instantly from cache
// on every open, eliminating the "reload" feeling on iPhone PWA.

const CACHE_VERSION = "ronin-v4";
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

// Assets that form the app shell — cached aggressively
const SHELL_PATTERNS = [/\.js$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.ico$/, /\.svg$/];

// Supabase REST patterns — cached with stale-while-revalidate
const DATA_PATTERNS = [/supabase\.co\/rest\/v1\//, /supabase\.co\/storage\/v1\//];

// Never cache these paths — auth redirects and push subscriptions must hit network
const NEVER_CACHE = [/\/~oauth/, /functions\/v1\//, /auth\/v1\//];

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  // Pre-cache index.html so it's available instantly on first open
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(["/"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Delete old caches from previous versions
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith("ronin-") && k !== SHELL_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  );
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests — mutations must always hit the network
  if (request.method !== "GET") return;

  // Never cache auth / edge function calls
  if (NEVER_CACHE.some(p => p.test(url.href))) return;

  // HTML navigation — cache-first so iPhone PWA opens instantly with no re-render.
  // The shell is versioned via CACHE_VERSION so updates still propagate on next
  // service worker activation.
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // App shell assets (JS/CSS/fonts/images) — cache-first
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

// Serve from cache immediately; update cache in background for next visit
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Always kick off a background revalidation
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Return cached instantly if available, otherwise wait for network
  return cached ?? networkPromise;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstWithStale(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — serve stale cache so the app still works offline
    const cached = await cache.match(request);
    if (cached) return cached;
    // For HTML navigation fallback, try serving index.html
    if (request.headers.get("accept")?.includes("text/html")) {
      const fallback = await cache.match("/");
      if (fallback) return fallback;
    }
    throw new Error("Network unavailable and no cached response");
  }
}

// ── Push notifications ────────────────────────────────────────────────────────
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
