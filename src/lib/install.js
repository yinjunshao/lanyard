// "Add Lanyard to your home screen": which instructions fit this device, and
// Android/desktop Chrome's own install prompt when the browser offers one.
import { ref } from "vue";

const KEY = "lanyard-install-dismissed";
const DONE = "lanyard-installed";
const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");

export function isStandalone() {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  } catch { return false; }
}

// "ios-safari" | "ios-other" | "android" | "desktop"
export function platform() {
  const u = ua();
  // iPadOS reports itself as a Mac; touch points give it away.
  const ios = /iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(u) ? "ios-other" : "ios-safari";
  if (/Android/.test(u)) return "android";
  return "desktop";
}

// Safari 26 moved Share into the ••• menu. Its user agent says Version/26.
export function iosSafariVersion() {
  const m = ua().match(/Version\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

// Chrome/Edge on Android and desktop fire this when the app can be installed.
export const installPrompt = ref(null);
export function listenForInstall() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt.value = e;
  });
  window.addEventListener("appinstalled", () => { installPrompt.value = null; markInstalledHere(); });
}
export async function promptInstall() {
  const e = installPrompt.value;
  if (!e) return false;
  installPrompt.value = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
}

// Android Chrome can tell us if this web app is already installed (manifest
// lists itself under related_applications). Elsewhere this resolves false.
export async function relatedAppInstalled() {
  try {
    const apps = await navigator.getInstalledRelatedApps?.();
    return !!apps?.length;
  } catch { return false; }
}

// This device has opened Lanyard from its home-screen icon, or the person
// said they've added it.
export function markInstalledHere() {
  try { localStorage.setItem(DONE, "1"); } catch { /* private mode */ }
}
export function installedHere() {
  try { return localStorage.getItem(DONE) === "1"; } catch { return false; }
}

export function installDismissed() {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function dismissInstall() {
  try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
}
