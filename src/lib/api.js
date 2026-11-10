import { clearOfflineData } from "./offline";

// Same-origin fetch. Auth is the HTTP-only session cookie — no manual tokens.
export async function api(path, method = "GET", data) {
  const res = await fetch(path, {
    method,
    headers: data ? { "content-type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = json.code || null; // e.g. account_required, plan_limit, throttled
    throw err;
  }
  return json;
}

export const Api = {
  me: (boot) => api(boot ? "/api/me?boot=1" : "/api/me"),
  createProfile: (body) => api("/api/profile", "POST", body),
  updateProfile: (body) => api("/api/profile", "PUT", body),
  setEmail: (email) => api("/api/account/email", "POST", { email }),
  confirmEmail: (email, code, marketing) => api("/api/account/email/confirm", "POST", { email, code, marketing }),
  setMarketing: (optin) => api("/api/account/marketing", "POST", { optin }),
  emailStart: (email) => api("/api/auth/email/start", "POST", { email }),
  emailVerify: (email, code) => api("/api/auth/email/verify", "POST", { email, code }),

  registerOptions: () => api("/api/passkey/register/options"),
  registerVerify: (body) => api("/api/passkey/register/verify", "POST", body),
  loginOptions: () => api("/api/passkey/login/options"),
  loginVerify: (body) => api("/api/passkey/login/verify", "POST", body),
  acceptTerms: () => api("/api/terms/accept", "POST", { accept: true, over18: true }),
  hostAcceptTerms: () => api("/api/host/terms", "POST", { accept: true }),
  authLink: () => api("/api/auth/link", "POST"),
  authRedeem: (code) => api("/api/auth/redeem", "POST", { code }),
  recoveryCreate: () => api("/api/auth/recovery", "POST"),
  recoveryRedeem: (key) => api("/api/auth/recovery/redeem", "POST", { key }),
  totpSetup: () => api("/api/auth/totp/setup", "POST"),
  totpConfirm: (code) => api("/api/auth/totp/confirm", "POST", { code }),
  totpDisable: () => api("/api/auth/totp", "DELETE"),
  totpRedeem: (id, code) => api("/api/auth/totp/redeem", "POST", { id, code }),
  selfieAccept: (id) => api(`/api/connections/${id}/selfie/accept`, "POST"),
  selfieRemove: (id) => api(`/api/connections/${id}/selfie/remove`, "POST"),
  eventChoices: (eventId) => api(`/api/e/${eventId}/choices`),
  setEventChoices: (eventId, body) => api(`/api/e/${eventId}/choices`, "PUT", body),
  consentHistory: () => api("/api/account/consents"),
  privacyRequest: (body) => api("/api/privacy-request", "POST", body),
  sessions: () => api("/api/auth/sessions"),
  signOutOthers: () => api("/api/auth/signout-others", "POST"),
  setEventEmails: (on) => api("/api/account/event-emails", "POST", { on }),
  // The offline copy of /api/me is cleared even if the request fails (for example
  // no signal), so a signed-out device never draws the old badge from cache.
  logout: async () => { try { return await api("/api/logout", "POST"); } finally { await clearOfflineData(); } },
  exportUrl: "/api/account/export",
  deleteAccount: async () => { const r = await api("/api/account", "DELETE"); await clearOfflineData(); return r; },

  createCard: (body) => api("/api/cards", "POST", body),
  updateCard: (id, body) => api(`/api/cards/${id}`, "PUT", body),
  deleteCard: (id) => api(`/api/cards/${id}`, "DELETE"),
  getCard: (id, noteToken) => api(`/api/c/${id}${noteToken ? `?n=${encodeURIComponent(noteToken)}` : ""}`),
  personalNote: (cardId) => api(`/api/cards/${cardId}/personal-note`),
  setPersonalNote: (cardId, text) => api(`/api/cards/${cardId}/personal-note`, "POST", { text }),
  clearPersonalNote: (cardId) => api(`/api/cards/${cardId}/personal-note`, "DELETE"),
  resolveCode: (code) => api(`/api/code/${encodeURIComponent(String(code).toUpperCase())}`),
  promo: (code) => api(`/api/redeem/${encodeURIComponent(code)}`),
  redeem: (code) => api(`/api/redeem/${encodeURIComponent(code)}`, "POST"),
  markInstalled: () => api("/api/me/installed", "POST"),
  rotateCode: (cardId) => api(`/api/cards/${cardId}/rotate-code`, "POST"),
  customCode: (cardId, code) => api(`/api/cards/${cardId}/custom-code`, "POST", { code }),
  plusWaitlist: () => api("/api/plan/waitlist", "POST"),

  connect: (body) => api("/api/connect", "POST", body),
  connections: () => api("/api/connections"),
  connection: (id) => api(`/api/connections/${id}`),
  note: (id, text) => api(`/api/connections/${id}/note`, "PUT", { text }),
  reportConnection: (id, reason, block) => api(`/api/connections/${id}/report`, "POST", { reason, block }),
  removeConnection: (id) => api(`/api/connections/${id}`, "DELETE"),
  connectionMeta: (id, body) => api(`/api/connections/${id}/meta`, "PUT", body),
  home: () => api("/api/home"),

  event: (code) => api(`/api/e/${encodeURIComponent(String(code).toUpperCase())}`),
  checkIn: (code, body) => api(`/api/e/${encodeURIComponent(String(code).toUpperCase())}/checkin`, "POST", body),
  room: (eventId) => api(`/api/e/${eventId}/room`),
  album: (eventId) => api(`/api/e/${eventId}/album`),
  myEvents: () => api("/api/my/events"),
  feedbackForm: (eventId) => api(`/api/e/${eventId}/feedback`),
  sendFeedback: (eventId, answers) => api(`/api/e/${eventId}/feedback`, "POST", { answers }),

  hostMe: () => api("/api/host/me"),
  hostOrg: (body) => api("/api/host/org", "POST", body),
  hostSignup: (body) => api("/api/host/signup", "POST", body),
  hostCreateOrg: (body) => api("/api/host/orgs", "POST", body),
  hostTransfer: (email) => api("/api/host/transfer", "POST", { email }),
  hostAcceptTransfer: (id) => api(`/api/host/transfers/${id}/accept`, "POST"),
  hostDeclineTransfer: (id) => api(`/api/host/transfers/${id}/decline`, "POST"),
  hostCancelTransfer: (id) => api(`/api/host/transfers/${id}`, "DELETE"),
  hostTickets: () => api("/api/host/tickets"),
  hostCreateTicket: (body) => api("/api/host/tickets", "POST", body),
  hostCreateEvent: (body) => api("/api/host/events", "POST", body),
  hostLive: (id) => api(`/api/host/events/${id}/live`),
  hostUpdateEvent: (id, body) => api(`/api/host/events/${id}`, "PUT", body),
  hostDuplicateEvent: (id, body) => api(`/api/host/events/${id}/duplicate`, "POST", body),
  hostEndEvent: (id) => api(`/api/host/events/${id}/end`, "POST"),
  hostFeedback: (id) => api(`/api/host/events/${id}/feedback`),
  hostSaveFeedback: (id, body) => api(`/api/host/events/${id}/feedback`, "PUT", body),
  hostReportCsvUrl: (id) => `/api/host/events/${id}/report.csv`,
  hostIntegrations: () => api("/api/host/integrations"),
  hostSetWebhook: (url) => api("/api/host/integrations/webhook", "PUT", { url }),
  hostRemoveWebhook: () => api("/api/host/integrations/webhook", "DELETE"),
  hostTestWebhook: () => api("/api/host/integrations/webhook/test", "POST"),
  hostNewApiKey: () => api("/api/host/integrations/key", "POST"),
  hostRemoveApiKey: () => api("/api/host/integrations/key", "DELETE"),
  hostReport: (id) => api(`/api/host/events/${id}/report`),
  hostRotateEventCode: (id) => api(`/api/host/events/${id}/rotate-code`, "POST"),
  hostTeam: () => api("/api/host/team"),
  hostInvite: () => api("/api/host/team/invite", "POST"),
  hostRevokeInvite: (code) => api(`/api/host/team/invite/${encodeURIComponent(code)}`, "DELETE"),
  hostJoin: (code) => api("/api/host/team/join", "POST", { code }),
  hostRemoveMember: (userId) => api(`/api/host/team/${userId}`, "DELETE"),
  hostBilling: () => api("/api/host/billing"),
  hostBillingRequest: (body) => api("/api/host/billing/request", "POST", body),
};
