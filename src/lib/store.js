// Current user, loaded from the session cookie. No client-side tokens.
import { reactive } from "vue";
import { Api } from "./api";
import { ON_HOST_SITE } from "./site";
import { setSignedInHint } from "./signedin";

export const me = reactive({
  user: null,
  profile: null,
  cards: [],
  plan: { tier: "free", label: "Free", cards: 3, customStrap: false, onWaitlist: false },
  loaded: false,
});

// One shared request, so pages that load at the same time don't each ask.
let pending = null;
export function ensureMe() {
  if (me.loaded) return Promise.resolve(me);
  // The first load may be answered from the offline copy on bad signal (see sw.js).
  if (!pending) pending = refreshMe(true).catch(() => me).finally(() => { pending = null; });
  return pending;
}

export async function refreshMe(boot = false) {
  const data = await Api.me(boot);
  me.user = data.user;
  me.profile = data.profile;
  me.cards = data.cards || [];
  if (data.plan) me.plan = data.plan;
  me.loaded = true;
  setSignedInHint(isSignedIn());
  return me;
}

export function defaultCard() {
  return me.cards.find((c) => c.cardId && c.code) || me.cards[0] || null;
}

// Signed in means they have a card, or a saved account. A new browser with
// no session is not signed in.
export function isSignedIn() {
  return !!(me.profile || me.user?.claimed);
}

// Where the lanyard. logo goes: My card for signed-in people, otherwise the
// front page (the host home, "/", on the host site).
export function homePath() {
  if (ON_HOST_SITE) return "/";
  return isSignedIn() ? "/app" : "/";
}

export function hasProfile() {
  return !!me.profile;
}

// Ends the session on this site (and the offline copy of /api/me), then does a
// full page load so no half-finished screen or stale state survives in memory.
export async function signOutAndReload(to) {
  await Api.logout();
  window.location.replace(to);
}
