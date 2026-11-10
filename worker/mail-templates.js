// Wording for event and security emails (the sending itself lives in mail.js).
import { escapeHtml } from "./mail.js";

const paragraphs = (text) => String(text).split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
const button = (url, label) => `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#1B1A17;color:#fff;border-radius:8px;text-decoration:none">${escapeHtml(label)}</a></p>`;
const small = (html) => `<p style="color:#6B675F;font-size:12px">${html}</p>`;

// To someone who checked in but hasn't answered. Sent once, a day after the event.
export function feedbackReminderEmail({ eventName, url, stopUrl }) {
  const body = `Thanks for coming to ${eventName}. It takes under a minute to tell the organisers how it went, and your answers are anonymous: they see totals, never who said what.`;
  return {
    subject: `How was ${eventName}?`,
    text: `${body}\n\nGive feedback: ${url}\n\nThis is the only reminder we'll send for this event. Stop these emails: ${stopUrl}`,
    html: `${paragraphs(body)}${button(url, "Give feedback")}${small(`This is the only reminder we'll send for this event. <a href="${escapeHtml(stopUrl)}">Stop these emails</a>`)}`,
    headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// To the person who runs the event, a day after it ended.
export function hostSummaryEmail({ eventName, checkins, connections, responses, nudged, url }) {
  const lines = [
    `${eventName} finished yesterday. Here is where it stands:`,
    `People who checked in: ${checkins}\nConnections made at the event: ${connections}\nFeedback answers so far: ${responses}`,
    nudged
      ? `We sent a one-off reminder to ${nudged} ${nudged === 1 ? "person" : "people"} who hadn't answered yet. Feedback appears in your report once at least 3 people have answered.`
      : "Feedback appears in your report once at least 3 people have answered.",
  ];
  const text = `${lines.join("\n\n")}\n\nOpen the report: ${url}`;
  return { subject: `How ${eventName} went`, text, html: `${paragraphs(lines.join("\n\n"))}${button(url, "Open the report")}` };
}

// "New sign-in": sent to the account's verified email when someone signs in with a passkey, code or key.
export function signInAlertEmail({ how, device, where, at, revokeUrl, settingsUrl }) {
  const when = new Date(at).toUTCString();
  const lines = [
    `Someone just signed in to your Lanyard account${how ? ` (${how})` : ""}.`,
    `When: ${when}\nDevice: ${device}${where ? `\nCountry: ${where}` : ""}`,
    "If this was you, there's nothing to do.",
  ];
  const text = `${lines.join("\n\n")}\n\nIf it wasn't you, sign out every device: ${revokeUrl}\nThen review your sign-in options: ${settingsUrl}`;
  return {
    subject: "New sign-in to your Lanyard account",
    text,
    html: `${paragraphs(lines.join("\n\n"))}${button(revokeUrl, "This wasn't me: sign out everywhere")}${small(`The link works for 7 days. <a href="${escapeHtml(settingsUrl)}">Review sign-in options</a>`)}`,
  };
}

// Warning before an unused account is deleted.
export function inactiveEmail({ origin, days }) {
  const lines = [
    `You haven't used Lanyard for almost two years. To keep your data to what we need, we delete accounts that stay unused.`,
    `Yours will be deleted in about ${days} days, with your card, connections and notes. To keep it, just sign in once.`,
  ];
  const nn = "\n\n";
  const text = lines.join(nn) + nn + `Sign in: ${origin}/signin`;
  return { subject: "Your Lanyard account will be deleted soon", text, html: paragraphs(lines.join(nn)) + button(`${origin}/signin`, "Keep my account") };
}
