import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker for offline / PWA support.
// updateViaCache: "none" ensures the browser ALWAYS checks the server for a
// new sw.js on every page load — so code updates reach users immediately.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then(reg => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (reg as any).sync?.register("ronin-sync-queue").catch(() => {});

        // When a new SW is found, activate it immediately so users get
        // the latest code without needing to close and reopen the app.
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "activated") {
              // Reload to pick up the new cached shell
              window.location.reload();
            }
          });
        });

        // Check for SW updates every time the app becomes visible
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        });
      })
      .catch(err => {
        console.warn("[SW] registration failed:", err);
      });
  });
}
