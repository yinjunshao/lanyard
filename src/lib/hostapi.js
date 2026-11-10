// The host portal's API (F10). Only host pages import this, so the attendee
// app (and every public page) never loads it. Same-origin fetch on the host
// site; auth is the host-only HTTP-only cookie.
import { api } from "./api";

export const HostApi = {
  signInStart: (email) => api("/api/host/auth/start", "POST", { email }),
  signInVerify: (email, code) => api("/api/host/auth/verify", "POST", { email, code }),
  logout: () => api("/api/host/logout", "POST"),
  saveDetails: (body) => api("/api/host/account/details", "POST", body),
  acceptTerms: () => api("/api/host/terms", "POST", { accept: true }),
  sessions: () => api("/api/host/sessions"),
  signOutDevice: (id) => api(`/api/host/sessions/${encodeURIComponent(id)}`, "DELETE"),
  signOutOthers: () => api("/api/host/sessions/signout-others", "POST"),
  exportUrl: "/api/host/account/export",
  hostMe: () => api("/api/host/me"),
  hostOrg: (body) => api("/api/host/org", "POST", body),
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
  hostInvite: (email) => api("/api/host/team/invite", "POST", email ? { email } : {}),
  hostRevokeInvite: (code) => api(`/api/host/team/invite/${encodeURIComponent(code)}`, "DELETE"),
  hostJoin: (code) => api("/api/host/team/join", "POST", { code }),
  hostRemoveMember: (id) => api(`/api/host/team/${encodeURIComponent(id)}`, "DELETE"),
  hostBilling: () => api("/api/host/billing"),
  hostBillingRequest: (body) => api("/api/host/billing/request", "POST", body),
};

// Ends the host session, then a full page load, so no half-finished screen or
// stale state survives in memory.
export async function hostSignOutAndReload(to = "/") {
  await HostApi.logout();
  window.location.replace(to);
}
