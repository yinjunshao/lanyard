// Offline support: registers the service worker (production builds only) and
// clears what it stored about you on sign-out or account deletion.
export function registerOffline() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* offline mode is a bonus */ });
  });
}

export async function clearOfflineData() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-data" });
    if ("caches" in window) {
      for (const key of await caches.keys()) if (key.startsWith("lanyard-data-")) await caches.delete(key);
    }
  } catch { /* nothing stored */ }
}
