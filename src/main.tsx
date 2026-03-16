import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for offline / PWA support.
// We use updateViaCache: 'all' so the browser only re-downloads the SW script
// when the HTTP cache says it has changed — preventing unnecessary SW update
// checks (and the reload cycle they cause) on every app open.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "all" })
      .then(reg => {
        // Register for background sync — lets the SW flush the offline queue
        // even if the app tab is not visible (Chrome/Android only).
        reg.sync?.register("ronin-sync-queue").catch(() => {});

        // Check for updates only once when the app becomes visible after being
        // hidden — not on every focus event. This avoids spurious reload cycles
        // when users switch back to the app.
        let lastUpdateCheck = 0;
        const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // check at most once per hour

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "visible") return;
          const now = Date.now();
          if (now - lastUpdateCheck < UPDATE_INTERVAL_MS) return;
          lastUpdateCheck = now;
          reg.update().catch(() => {});
        });
      })
      .catch(err => {
        console.warn("[SW] registration failed:", err);
      });
  });
}
