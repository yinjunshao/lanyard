// Current user, loaded from the session cookie. No client-side tokens.
import { reactive } from "vue";
import { Api } from "./api";

export const me = reactive({
  user: null,
  profile: null,
  cards: [],
  plan: { tier: "free", label: "Free", cards: 3, customStrap: false, onWaitlist: false },
  loaded: false,
});

export async function refreshMe() {
  const data = await Api.me();
  me.user = data.user;
  me.profile = data.profile;
  me.cards = data.cards || [];
  if (data.plan) me.plan = data.plan;
  me.loaded = true;
  return me;
}

export function defaultCard() {
  return me.cards.find((c) => c.cardId && c.code) || me.cards[0] || null;
}

export function hasProfile() {
  return !!me.profile;
}
