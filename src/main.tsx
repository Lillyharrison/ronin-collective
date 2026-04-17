import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// ── Service Worker registration ──────────────────────────────────────────────
// Strategy for iOS Safari PWA reliability:
//   1. updateViaCache: "none"   → browser must always re-check sw.js on the network
//   2. Force update on every load + visibility change
//   3. Tell waiting SW to skipWaiting via postMessage (so user doesn't have to close tabs)
//   4. controllerchange → reload exactly once when the new SW takes control
//
// This combination guarantees that when a new version is deployed, every device
// (including iOS PWAs) picks it up on the next foreground/load — not "after a day".
if ("serviceWorker" in navigator) {
  let reloading = false;

  // When the active SW changes (after skipWaiting → claim), reload the page once
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const promptUpdate = (sw: ServiceWorker) => {
    // Ask the waiting worker to take over immediately
    sw.postMessage("SKIP_WAITING");
  };

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then(reg => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (reg as any).sync?.register("ronin-sync-queue").catch(() => {});

        // Force an update check on registration
        reg.update().catch(() => {});

        // If a worker is already waiting (previous tab installed it), activate now
        if (reg.waiting && navigator.serviceWorker.controller) {
          promptUpdate(reg.waiting);
        }

        // When a new SW is found, watch it and activate as soon as it's installed
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              // New version ready, old still controlling — tell it to take over
              promptUpdate(newSW);
            }
          });
        });

        // Check for SW updates every time the app becomes visible (critical for iOS PWA)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        });

        // Also check periodically while the app is open (every 5 min)
        setInterval(() => { reg.update().catch(() => {}); }, 5 * 60 * 1000);
      })
      .catch(err => {
        console.warn("[SW] registration failed:", err);
      });
  });
}
