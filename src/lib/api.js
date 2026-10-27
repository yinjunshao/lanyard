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
  me: () => api("/api/me"),
  createProfile: (body) => api("/api/profile", "POST", body),
  updateProfile: (body) => api("/api/profile", "PUT", body),
  setEmail: (email) => api("/api/account/email", "POST", { email }),

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
  logout: () => api("/api/logout", "POST"),
  exportUrl: "/api/account/export",
  deleteAccount: () => api("/api/account", "DELETE"),

  createCard: (body) => api("/api/cards", "POST", body),
  updateCard: (id, body) => api(`/api/cards/${id}`, "PUT", body),
  deleteCard: (id) => api(`/api/cards/${id}`, "DELETE"),
  getCard: (id, noteToken) => api(`/api/c/${id}${noteToken ? `?n=${encodeURIComponent(noteToken)}` : ""}`),
  personalNote: (cardId) => api(`/api/cards/${cardId}/personal-note`),
  setPersonalNote: (cardId, text) => api(`/api/cards/${cardId}/personal-note`, "POST", { text }),
  clearPersonalNote: (cardId) => api(`/api/cards/${cardId}/personal-note`, "DELETE"),
  resolveCode: (code) => api(`/api/code/${encodeURIComponent(String(code).toUpperCase())}`),
  rotateCode: (cardId) => api(`/api/cards/${cardId}/rotate-code`, "POST"),
  plusWaitlist: () => api("/api/plan/waitlist", "POST"),

  connect: (body) => api("/api/connect", "POST", body),
  connections: () => api("/api/connections"),
  connection: (id) => api(`/api/connections/${id}`),
  note: (id, text) => api(`/api/connections/${id}/note`, "PUT", { text }),
  reportConnection: (id, reason, block) => api(`/api/connections/${id}/report`, "POST", { reason, block }),
  removeConnection: (id) => api(`/api/connections/${id}`, "DELETE"),

  event: (code) => api(`/api/e/${encodeURIComponent(String(code).toUpperCase())}`),
  checkIn: (code, body) => api(`/api/e/${encodeURIComponent(String(code).toUpperCase())}/checkin`, "POST", body),
  room: (eventId) => api(`/api/e/${eventId}/room`),
  album: (eventId) => api(`/api/e/${eventId}/album`),
  myEvents: () => api("/api/my/events"),

  hostMe: () => api("/api/host/me"),
  hostOrg: (body) => api("/api/host/org", "POST", body),
  hostCreateEvent: (body) => api("/api/host/events", "POST", body),
  hostLive: (id) => api(`/api/host/events/${id}/live`),
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
