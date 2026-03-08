// Ronin Estates Service Worker
// Strategy:
//   - App shell (HTML/JS/CSS/fonts) → Cache-first (versioned cache)
//   - Supabase REST/realtime requests → Network-first with stale fallback
//   - Everything else → Network-first, no cache
//
// This ensures staff on poor WiFi still see stale data rather than a blank screen.

const CACHE_VERSION = "ronin-v2";
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const DATA_CACHE    = `${CACHE_VERSION}-data`;

// Assets that form the app shell — cached aggressively
const SHELL_PATTERNS = [/\.js$/, /\.css$/, /\.woff2?$/, /\.png$/, /\.ico$/];

// Supabase REST patterns — cached with stale-while-revalidate
const DATA_PATTERNS = [/supabase\.co\/rest\/v1\//, /supabase\.co\/storage\/v1\//];

// Never cache these paths — auth redirects and push subscriptions must hit network
const NEVER_CACHE = [/\/~oauth/, /functions\/v1\//, /auth\/v1\//];

// ── Lifecycle ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
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

  // App shell assets — cache-first
  if (SHELL_PATTERNS.some(p => p.test(url.pathname))) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Supabase REST/storage — network-first with stale cache fallback
  if (DATA_PATTERNS.some(p => p.test(url.href))) {
    event.respondWith(networkFirstWithStale(request, DATA_CACHE));
    return;
  }

  // HTML navigation — network-first, cache index.html as offline fallback
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirstWithStale(request, SHELL_CACHE));
    return;
  }
});

// ── Strategies ────────────────────────────────────────────────────────────────

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
