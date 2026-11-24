// What the app knows about tutorials (F59): one shared copy of GET /api/stages, kept for the visit. Loaded only by signed-in
// pages (the frame, the connection panel, Settings), never by a public page's first load.
import { api } from "./api";

let state = null;
let pending = null;

export function loadStages() {
  if (state) return Promise.resolve(state);
  if (!pending) pending = api("/api/stages").then((s) => (state = s)).finally(() => { pending = null; });
  return pending;
}
// "Show tips again" and a sign-out: the next page asks the Worker again.
export const forgetStages = () => { state = null; };

// The tutorial is starting: the Worker records it (once per account, one a day) and says no if it must wait.
export async function markSeen(id) {
  try {
    await api(`/api/stages/${encodeURIComponent(id)}/seen`, "POST");
  } catch (e) {
    if (state && e.code === "one_a_day") state.shownToday = true;
    throw e;
  }
  if (state) { state.seen = [...state.seen, id]; state.shownToday = true; }
}
// How it ended. A failure here changes nothing for the person.
export const endStage = (id, outcome) => api(`/api/stages/${encodeURIComponent(id)}/seen`, "POST", { outcome }).catch(() => {});
