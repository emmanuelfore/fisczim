import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global error handlers — prevent white screen crashes
window.onerror = (message, source, lineno, colno, error) => {
  console.error("[GlobalError]", message, source, `${lineno}:${colno}`, error);
  // Prevent the error from killing React entirely
  return true;
};

window.addEventListener("unhandledrejection", (event) => {
  console.error("[UnhandledPromiseRejection]", event.reason);
  // Prevent unhandled rejections from crashing the app
  event.preventDefault();
});

// Register Service Worker for PWA in production only
if (import.meta.env.PROD && "serviceWorker" in navigator) {
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
