import { clearOfflineData } from "./offline";
import { setSignedInHint } from "./signedin";

// Same-origin fetch. Auth is the HTTP-only session cookie, no manual tokens.
// A failed call throws an Error whose message is already words for a person: the server's own (the
// Worker writes them), or a short one here for no signal and for an answer with no words in it. Signed-in, host and admin
// pages also load lib/errors.js, which sets `api.fix` (a timeout, a sign-out, a rate limit, a server error) and
// `api.sig` (a time limit). Public pages skip it, for their first-load budget (F28, F39).
export async function api(path, method = "GET", data) {
  let res = { status: 0 }, json = { error: "No connection. Check your signal and try again.", code: "offline" };
  try {
    res = await fetch(path, {
      method,
      headers: data ? { "content-type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "same-origin",
      signal: api.sig?.(),
    });
    json = await res.json().catch(() => ({}));
  } catch (e) { json.e = e; } // fetch itself failed: no signal, or the time limit ran out
  if (!res.ok) {
    const err = new Error(json.error || "Something went wrong. Try again.");
    err.status = res.status;
    err.code = json.code || null; // e.g. account_required, plan_limit, throttled
    throw api.fix ? api.fix(err, json, res) : err;
  }
  return json;
}

export const Api = {
  me: (boot) => api(boot ? "/api/me?boot=1" : "/api/me"),
  createProfile: (body) => api("/api/profile", "POST", body),
  updateProfile: (body) => api("/api/profile", "PUT", body),
  setEmail: (email) => api("/api/account/email", "POST", { email }),
  confirmEmail: (email, code, marketing) => api("/api/account/email/confirm", "POST", { email, code, marketing }),
  emailStart: (email) => api("/api/auth/email/start", "POST", { email }),
  setMarketing: (optin) => api("/api/account/marketing", "POST", { optin }),
  emailVerify: (email, code) => api("/api/auth/email/verify", "POST", { email, code }),

  registerOptions: () => api("/api/passkey/register/options"),
  registerVerify: (body) => api("/api/passkey/register/verify", "POST", body),
  loginOptions: () => api("/api/passkey/login/options"),
  loginVerify: (body) => api("/api/passkey/login/verify", "POST", body),
  acceptTerms: () => api("/api/terms/accept", "POST", { accept: true, over18: true }),
  authLink: () => api("/api/auth/link", "POST"),
  authRedeem: (code) => api("/api/auth/redeem", "POST", { code }),
  recoveryCreate: () => api("/api/auth/recovery", "POST"),
  recoveryRedeem: (key) => api("/api/auth/recovery/redeem", "POST", { key }),
  totpRedeem: (id, code) => api("/api/auth/totp/redeem", "POST", { id, code }),
  setEventEmails: (on) => api("/api/account/event-emails", "POST", { on }),
  selfieAccept: (id) => api(`/api/connections/${id}/selfie/accept`, "POST"),
  selfieRemove: (id) => api(`/api/connections/${id}/selfie/remove`, "POST"),
  privacyRequest: (body) => api("/api/privacy-request", "POST", body),
  sessions: () => api("/api/auth/sessions"),
  signOutOthers: () => api("/api/auth/signout-others", "POST"),
  // The offline copy of /api/me is cleared even if the request fails (for example
  // no signal), so a signed-out device never draws the old badge from cache.
  logout: async () => { try { return await api("/api/logout", "POST"); } finally { setSignedInHint(false); await clearOfflineData(); } },
  exportUrl: "/api/account/export",
  deleteAccount: async () => { const r = await api("/api/account", "DELETE"); setSignedInHint(false); await clearOfflineData(); return r; },

  getCard: (id, noteToken) => api(`/api/c/${id}${noteToken ? `?n=${encodeURIComponent(noteToken)}` : ""}`),
  resolveCode: (code) => api(`/api/code/${encodeURIComponent(String(code).toUpperCase())}`),
  promo: (code) => api(`/api/redeem/${encodeURIComponent(code)}`),
  redeem: (code) => api(`/api/redeem/${encodeURIComponent(code)}`, "POST"),
  plusWaitlist: () => api("/api/plan/waitlist", "POST"),
  markInstalled: () => api("/api/me/installed", "POST"),

  connect: (body) => api("/api/connect", "POST", body),
  connections: () => api("/api/connections"),
  connection: (id) => api(`/api/connections/${id}`),
  note: (id, text) => api(`/api/connections/${id}/note`, "PUT", { text }),
  reportConnection: (id, reason, block) => api(`/api/connections/${id}/report`, "POST", { reason, block }),
  removeConnection: (id) => api(`/api/connections/${id}`, "DELETE"),
  connectionMeta: (id, body) => api(`/api/connections/${id}/meta`, "PUT", body),

  event: (code) => api(`/api/e/${encodeURIComponent(String(code).toUpperCase())}`),
  checkIn: (code, body) => api(`/api/e/${encodeURIComponent(String(code).toUpperCase())}/checkin`, "POST", body),
  room: (eventId) => api(`/api/e/${eventId}/room`),
  album: (eventId) => api(`/api/e/${eventId}/album`),
  myEvents: () => api("/api/my/events"),
  feedbackForm: (eventId) => api(`/api/e/${eventId}/feedback`),
  sendFeedback: (eventId, answers) => api(`/api/e/${eventId}/feedback`, "POST", { answers }),
};
