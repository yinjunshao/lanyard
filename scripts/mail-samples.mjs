// F58: every email the Worker can send, built once with sample data. The preview script writes these to
// scratch/mail-preview/ and test/mail-layout.mjs calls every one with hostile text. Nothing here sends anything.
// `x` is the text a person could have typed (a name, an event, an organisation); the default is a plain one.
// Keep this list in step with the send sites: test/mail-layout.mjs fails when a send site has no entry.
import { codeEmail, hostCodeEmail, decisionEmail, welcomeEmail, applicationEmail, ticketEmail, teamInviteEmail, transferEmail, marketingEmail } from "../worker/mail.js";
import {
  feedbackReminderEmail, followupReminderEmail, profileNudgeEmail, hostSummaryEmail, feedbackSummaryEmail, signInAlertEmail,
  passkeyRemovedEmail, inactiveEmail, confirmEmail, withConfirm, privacyAckEmail, aiBudgetAlertEmail,
} from "../worker/mail-templates.js";

const APP = "https://lanyd.fyi";
const HOST = "https://host.lanyd.fyi";
const STOP = `${APP}/api/unsub?k=reminders&u=sample&e=0&s=0123456789abcdef`;
const STOP_EVENTS = `${APP}/api/unsub?k=events&u=sample&e=0&s=0123456789abcdef`;
const NEWS = `${APP}/api/unsub?k=news&u=sample&e=0&s=0123456789abcdef`;
const REVOKE = `${APP}/api/unsub?k=revoke&u=sample&e=1&s=0123456789abcdef`;
const CONFIRM = `${APP}/api/email/confirm?t=0123456789abcdef0123456789abcdef`;
const AT = Date.UTC(2026, 10, 24, 18, 30);

// id: a file name; from: the send site; user: the fields that can hold a person's text; stop: carries a stop link.
export const SAMPLES = [
  { id: "code", from: "email-auth.js", kind: "accounts", user: [], build: () => codeEmail("482915", `${APP}/api/email/link?t=sample`) },
  { id: "host-code", from: "host-auth.js", kind: "decisions", user: [], build: () => hostCodeEmail("739204", HOST) },
  { id: "welcome", from: "email-auth.js", kind: "accounts", user: [], build: () => welcomeEmail(APP) },
  { id: "confirm-connect", from: "pending-email.js", kind: "accounts", user: [], build: () => confirmEmail({ url: CONFIRM, reason: "connect" }) },
  { id: "confirm-card", from: "pending-email.js", kind: "accounts", user: [], build: () => confirmEmail({ url: CONFIRM, reason: "card" }) },
  { id: "followup-one", from: "followupmail.js", kind: "accounts", stop: STOP, user: ["first", "event"],
    build: (x = "Priya") => followupReminderEmail({ people: [{ first: x, event: x === "Priya" ? "Autumn Robotics Mixer" : x, url: `${APP}/app/people/sample1` }], total: 1, stopUrl: STOP, listUrl: `${APP}/app/people` }) },
  { id: "followup-many", from: "followupmail.js", kind: "accounts", stop: STOP, user: ["first", "event"],
    build: (x = "Priya") => followupReminderEmail({ people: [
      { first: x, event: x === "Priya" ? "Autumn Robotics Mixer" : x, url: `${APP}/app/people/sample1` },
      { first: "Tom", event: "Careers Fair", url: `${APP}/app/people/sample2` },
      { first: "Aisha", event: "", url: `${APP}/app/people/sample3` }], total: 5, stopUrl: STOP, listUrl: `${APP}/app/people` }) },
  { id: "followup-unconfirmed", from: "followupmail.js (withConfirm)", kind: "accounts", stop: STOP, user: ["first"],
    build: (x = "Priya") => withConfirm(followupReminderEmail({ people: [{ first: x, event: "Autumn Robotics Mixer", url: `${APP}/app/people/sample1` }], total: 1, stopUrl: STOP, listUrl: `${APP}/app/people` }), CONFIRM) },
  { id: "profile-first", from: "profilenudge.js", kind: "accounts", stop: STOP, user: ["names"],
    build: (x = "Priya") => profileNudgeEmail({ second: false, names: [x, "Tom"], score: 3, max: 6, missing: ["A photo", "A headline", "What you want to talk about"], url: `${APP}/app/profile`, stopUrl: STOP }) },
  { id: "profile-second", from: "profilenudge.js", kind: "accounts", stop: STOP, user: [],
    build: () => profileNudgeEmail({ second: true, names: [], score: 4, max: 6, missing: ["A photo", "A headline"], url: `${APP}/app/profile`, stopUrl: STOP }) },
  { id: "profile-unconfirmed", from: "profilenudge.js (withConfirm)", kind: "accounts", stop: STOP, user: [],
    build: () => withConfirm(profileNudgeEmail({ second: false, names: ["Priya"], score: 3, max: 6, missing: ["A photo"], url: `${APP}/app/profile`, stopUrl: STOP }), CONFIRM) },
  { id: "feedback-reminder", from: "eventmail.js", kind: "accounts", stop: STOP_EVENTS, user: ["eventName"],
    build: (x = "Autumn Robotics Mixer") => feedbackReminderEmail({ eventName: x, url: `${APP}/app/feedback/sample`, stopUrl: STOP_EVENTS }) },
  { id: "host-summary", from: "eventmail.js", kind: "decisions", user: ["eventName"],
    build: (x = "Autumn Robotics Mixer") => hostSummaryEmail({ eventName: x, checkins: 84, connections: 213, responses: 31, nudged: 40, url: `${HOST}/events/sample`, aiSummary: null }) },
  { id: "host-summary-ai", from: "eventmail.js", kind: "decisions", user: ["eventName", "aiSummary"],
    build: (x = "Autumn Robotics Mixer") => hostSummaryEmail({ eventName: x, checkins: 84, connections: 213, responses: 31, nudged: 1, url: `${HOST}/events/sample`, aiSummary: { answers: 12, paragraph: x === "Autumn Robotics Mixer" ? "People liked the speakers and wanted more time to talk." : x } }) },
  { id: "feedback-summary", from: "ai/feedbackSummary.js", kind: "decisions", user: ["eventName", "paragraph"],
    build: (x = "Autumn Robotics Mixer") => feedbackSummaryEmail({ eventName: x, paragraph: x === "Autumn Robotics Mixer" ? "People liked the speakers and wanted more time to talk." : x, answers: 12, url: `${HOST}/events/sample` }) },
  { id: "sign-in-alert", from: "alerts.js", kind: "accounts", user: ["how", "device", "where"],
    build: (x = "") => signInAlertEmail({ how: x || "passkey", device: x || "Chrome on Windows", where: x || "GB", at: AT, revokeUrl: REVOKE, settingsUrl: `${APP}/app/settings/security` }) },
  { id: "passkey-removed", from: "alerts.js", kind: "accounts", user: ["name", "device", "where"],
    build: (x = "") => passkeyRemovedEmail({ name: x || "Work laptop", device: x || "Safari on iPhone", where: x || "GB", at: AT, revokeUrl: REVOKE, settingsUrl: `${APP}/app/settings/security` }) },
  { id: "inactive", from: "purge.js", kind: "accounts", user: [], build: () => inactiveEmail({ origin: APP, days: 30 }) },
  { id: "privacy-request", from: "privacy.js", kind: "accounts", user: [], build: () => privacyAckEmail({ kind: "access", id: "01HXSAMPLE0000" }) },
  { id: "privacy-complaint", from: "privacy.js", kind: "accounts", user: [], build: () => privacyAckEmail({ kind: "complaint", id: "01HXSAMPLE0001" }) },
  { id: "application", from: "hosts.js", kind: "decisions", user: ["orgName"], build: (x = "Cambridge Robotics Club") => applicationEmail({ orgName: x, origin: HOST }) },
  { id: "decision-approved", from: "admin.js", kind: "decisions", user: ["orgName"], build: (x = "Robotics Club") => decisionEmail({ orgName: x, approved: true, note: "", origin: HOST }) },
  { id: "decision-rejected", from: "admin.js", kind: "decisions", user: ["orgName", "note"], build: (x = "Robotics Club") => decisionEmail({ orgName: x, approved: false, note: x === "Robotics Club" ? "We could not match your email to the organisation." : x, origin: HOST }) },
  { id: "ticket-approved", from: "admin.js", kind: "decisions", user: ["orgName", "note"], build: (x = "Robotics Club") => ticketEmail({ orgName: x, approved: true, note: x === "Robotics Club" ? "The new name is live." : x, origin: HOST }) },
  { id: "ticket-rejected", from: "admin.js", kind: "decisions", user: ["orgName", "note"], build: (x = "Robotics Club") => ticketEmail({ orgName: x, approved: false, note: x === "Robotics Club" ? "We need a message from the old address." : x, origin: HOST }) },
  { id: "team-invite", from: "hosts.js", kind: "decisions", user: ["orgName", "fromName"], build: (x = "Robotics Club") => teamInviteEmail({ orgName: x, fromName: x === "Robotics Club" ? "Sam Rivera" : x, code: "K7M2-Q9XP", origin: HOST }) },
  { id: "transfer", from: "hosts.js, admin.js", kind: "decisions", user: ["orgName", "fromName"], build: (x = "Robotics Club") => transferEmail({ orgName: x, fromName: x === "Robotics Club" ? "Sam Rivera" : x, origin: HOST }) },
  { id: "news", from: "admin.js", kind: "accounts", stop: NEWS, user: ["subject", "body"],
    build: (x = "") => marketingEmail({ subject: x || "What is new in Lanyard", body: x || "You can now pick your card colour from ten presets.\n\nPlus members get the whole colour wheel.", unsubUrl: NEWS }) },
  { id: "ai-budget", from: "ai/alerts.js", kind: "accounts", user: ["label"],
    build: (x = "today") => aiBudgetAlertEmail({ pct: 90, label: x, text: `AI spend for ${x} has passed 90% of the budget: $4.50 of $5.00.\n\nAt 100% every AI feature switches to its non-AI version until the budget resets. Details are on the admin page.` }) },
];
