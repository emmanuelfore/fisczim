import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// This app uses IndexedDB from the page/POS flow, not a service worker.
// Remove any worker left behind by older builds without blocking startup.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then(() => {
        console.log("Stale service worker unregistered");
      });
    }
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);

// Tell Electron that the renderer is alive. The web app intentionally has no
// HTML progress overlay that could obscure React after reaching 100%.
requestAnimationFrame(() => {
  try {
    (window as any).electronAPI?.notifyRendererAlive?.();
  } catch {}
});
