// Device identity + current user session. A device token (localStorage) claims
// a profile for editing. No passwords — matches the lightweight hackathon scope.
import { reactive } from "vue";
import { Api } from "./api";

const TOKEN_KEY = "lanyard_device_token";

export function getToken() {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export const me = reactive({ id: null, profile: null, loaded: false });

export async function refreshMe() {
  const token = getToken();
  const data = await Api.getMine(token);
  me.id = data.id || null;
  me.profile = data.profile || null;
  me.loaded = true;
  return me;
}

export function saveProfile(profile) {
  me.profile = profile;
  if (profile && profile.id) me.id = profile.id;
}