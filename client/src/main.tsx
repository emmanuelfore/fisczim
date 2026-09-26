import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { isElectron } from "./lib/utils";

// Service Worker: offline app-shell caching is an Electron-only requirement
// (desktop terminals boot the remote POS URL with no connection, and the
// Electron renderer does run service workers). Browsers are online-only, so
// skip registration there AND shed any previously installed worker + caches —
// stale workers are the classic source of stuck/chunk-mismatch loads.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  if (isElectron()) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("SW registered: ", registration);
        })
        .catch((registrationError) => {
          console.log("SW registration failed: ", registrationError);
        });
    });
  } else {
    // Browser: remove workers/caches installed by earlier versions.
    // Fire-and-forget — the running page is unaffected until next load.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    }).catch(() => {});
    if (window.caches) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.startsWith("fiscalstack-")) caches.delete(key).catch(() => {});
        }
      }).catch(() => {});
    }
  }
} else if ("serviceWorker" in navigator) {
  // Clean up SW in development to avoid HMR / MIME issues
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then(() => {
        console.log("SW unregistered for development");
      });
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);

// Tell the inline HTML shell + Electron native splash that React has loaded
// in the background. The splash stays visible until BootSplash sends the
// final "I'm ready" (app-ready) — so there is never a blank moment.
requestAnimationFrame(() => {
  try {
    (window as any).__bootSplashSet?.(12, "Loading modules…");
    (window as any).electronAPI?.notifyRendererAlive?.();
  } catch {}
});
