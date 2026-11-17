// Words for a failed request (F39). Loaded by the signed-in app, the host site and the admin page, never by
// a public page: those keep to the small version in api.js (the first-load budget, F28). Importing this file
// is enough: it sets `api.fix`, which api() calls with every failed answer.
//
// The Worker writes plain words for nearly every refusal, and they are shown as they come. This file adds what
// only the browser knows: no signal, a request that hangs, a session that ended, how long to wait, and an
// answer that had no words in it at all (an edge or proxy page). A person never reads a code, a status
// number or a library's English.
import { h, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { api } from "./api";
import { ON_HOST_SITE } from "./site";

// True once a request was refused because the session ended (401). SessionLost.vue shows a Sign in link.
export const signedOut = ref(false);

// The note with a Sign in link that signed-in and host pages place at the top. It goes when the person moves on.
// Written with h() so it needs no component file of its own: a file's name would be listed in the entry that
// every public page loads (F28).
export const SessionLost = {
  setup() {
    const route = useRoute();
    watch(() => route.fullPath, () => { signedOut.value = false; });
    return () => (signedOut.value
      ? h("p", { class: "notice", role: "alert", style: "margin-bottom:12px" },
        ["You've been signed out. ", h(RouterLink, { to: ON_HOST_SITE ? "/" : "/signin", style: "text-decoration:underline" }, () => "Sign in"), " to carry on."])
      : null);
  },
};

export const OFFLINE = "No connection. Check your signal and try again.";
export const TIMEOUT = "That took too long. Check your connection and try again.";
export const SIDE = "Something went wrong on our side. Try again in a minute.";
export const SIGNED_OUT = "You've been signed out. Sign in again to carry on.";

// What each answer means when the server sent no words of its own.
const SAID_NOTHING = {
  401: SIGNED_OUT,
  403: "You don't have access to that.",
  404: "We couldn't find that. Reload the page and try again.",
  409: "That clashed with another change. Reload the page and try again.",
  413: "That is too big to send. Try a smaller file.",
  429: "Too many tries. Wait a few minutes and try again.",
};

// "30 seconds", "a minute", "10 minutes", "an hour", "3 hours".
export function waitWords(seconds) {
  const s = Math.ceil(seconds);
  if (s <= 45) return `${Math.max(s, 5)} seconds`;
  const m = Math.ceil(s / 60);
  if (m <= 1) return "a minute";
  if (m < 60) return `${m} minutes`;
  const h = Math.ceil(m / 60);
  return h <= 1 ? "an hour" : `${h} hours`;
}

// How long the server says to wait: a `retryAfter` field in the body, or a Retry-After header (seconds).
function waitOf(json, res) {
  const n = Number(json?.retryAfter ?? res?.headers?.get?.("retry-after"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// api() calls this with the Error it built, the answer's body and the response (or { status: 0 } for no answer).
// It returns the same Error with its message set. The `code` is left alone: pages key on it.
export function fix(err, json = {}, res) {
  const s = err.status;
  const said = typeof json.error === "string" && json.error.length > 0 && s !== 0;
  if (s === 0) {
    err.message = json.e?.name === "TimeoutError" ? TIMEOUT : OFFLINE;
  } else if (s === 401) {
    // Only a session that ended: not the host site's "that is not part of this site" refusal.
    if (!err.code || err.code === "no_session" || err.code === "signed_out") signedOut.value = true;
    if (!said) err.message = SIGNED_OUT;
  } else if (s === 429) {
    const wait = waitOf(json, res);
    if (wait) { err.retryAfter = wait; err.message = `Too many tries. Wait ${waitWords(wait)} and try again.`; }
    else if (!said) err.message = SAID_NOTHING[429];
  } else if (!said) {
    err.message = SAID_NOTHING[s] || (s >= 500 ? SIDE : "Something went wrong. Try again in a minute.");
  }
  return err;
}
api.fix = fix;
api.sig = () => AbortSignal.timeout?.(9e4); // a request that hangs for 90 seconds is given up on

// Words for an error that did not come from api(): a passkey prompt, the camera, a file, a failed page
// download. An api() error is returned as it is. Anything that looks like a library's English or a status
// number is swapped for `fallback`, so it never reaches a person.
const LIBRARY = /failed to fetch|load failed|networkerror|dynamically imported|unexpected token|not valid json|is not (a function|defined)|undefined|\[object|https?:\/\/|\bat \S+:\d+|^\w*error\b|\b[45]\d\d\b|status code/i;
export function explain(e, fallback = "Something went wrong. Try again in a minute.") {
  if (e && typeof e.status === "number") return e.message;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return OFFLINE;
  const m = typeof e?.message === "string" ? e.message.trim() : "";
  return m && /[a-z]/i.test(m) && !LIBRARY.test(m) ? m : fallback;
}
