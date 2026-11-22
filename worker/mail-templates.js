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
export function hostSummaryEmail({ eventName, checkins, connections, responses, nudged, url, aiSummary }) {
  const lines = [
    `${eventName} finished yesterday. Here is where it stands:`,
    `People who checked in: ${checkins}\nConnections made at the event: ${connections}\nFeedback answers so far: ${responses}`,
    nudged
      ? `We sent a one-off reminder to ${nudged} ${nudged === 1 ? "person" : "people"} who hadn't answered yet. Feedback appears in your report once at least 3 people have answered.`
      : "Feedback appears in your report once at least 3 people have answered.",
  ];
  // F23: a summary the organiser already asked for. Always labelled, and always with the answers a click away.
  if (aiSummary?.paragraph) lines.push(`Written by AI from ${aiSummary.answers} written answers (check it against the answers before you share it):\n${aiSummary.paragraph}`);
  const text = `${lines.join("\n\n")}\n\nOpen the report: ${url}`;
  return { subject: `How ${eventName} went`, text, html: `${paragraphs(lines.join("\n\n"))}${button(url, "Open the report")}` };
}

// F23: sent once to the person who runs the event, after its feedback window has closed, when the summary has been written.
export function feedbackSummaryEmail({ eventName, paragraph, answers, url }) {
  const lines = [
    `Feedback for ${eventName} has closed. Here is a short summary of the written answers.`,
    paragraph,
    `Written by AI from ${answers} written answers. It can be wrong, so read the answers before you share it. The report has the counts, a few quotes taken word for word, and all the answers.`,
  ];
  const nn = "\n\n";
  return { subject: `Feedback summary for ${eventName}`, text: `${lines.join(nn)}${nn}Open the report: ${url}`, html: `${paragraphs(lines.join(nn))}${button(url, "Open the report")}` };
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

// "Passkey removed": sent to the account's verified email when someone removes a passkey (F43).
export function passkeyRemovedEmail({ name, device, where, at, revokeUrl, settingsUrl }) {
  const when = new Date(at).toUTCString();
  const nn = "\n\n";
  const lines = [
    `A passkey was removed from your Lanyard account${name ? `: ${name}` : ""}.`,
    `When: ${when}\nDevice: ${device}${where ? `\nCountry: ${where}` : ""}`,
    "If this was you, there's nothing to do. Your other ways to sign in still work.",
  ];
  const text = `${lines.join(nn)}${nn}If it wasn't you, sign out every device: ${revokeUrl}\nThen review your sign-in options: ${settingsUrl}`;
  return {
    subject: "A passkey was removed from your Lanyard account",
    text,
    html: `${paragraphs(lines.join(nn))}${button(revokeUrl, "This wasn't me: sign out everywhere")}${small(`The link works for 7 days. <a href="${escapeHtml(settingsUrl)}">Review sign-in options</a>`)}`,
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

// F45: the first email to an address a new person typed (connecting, or step 5 of making a card). It names no one
// else, because the address is not confirmed and may not be theirs. The link opens a page with a button; it never
// signs anyone in. `reason` is "connect" or "card".
export function confirmEmail({ url, reason }) {
  const nn = "\n\n";
  const lines = [
    reason === "card" ? "You gave this email when you made your Lanyard card." : "You gave this email when you connected with someone on Lanyard.",
    "Confirm it's you, so you can sign in with this email on any device. Until it is confirmed, nobody can sign in with it.",
  ];
  const foot = "The link works for 14 days. If this wasn't you, ignore this email: we will write to this address at most once more.";
  return {
    subject: "Confirm your email for Lanyard",
    text: `${lines.join(nn)}${nn}Confirm it's you: ${url}${nn}${foot}`,
    html: `${paragraphs(lines.join(nn))}${button(url, "Confirm it's you")}${small(escapeHtml(foot))}`,
  };
}

// F45, for F48 and F49: every email to an address that is not confirmed yet carries the "Confirm it's you" button.
// `message` is { subject, text, html, ... }; `url` comes from confirmLink() in worker/pending-email.js.
export function withConfirm(message, url) {
  if (!url) return message;
  const line = "This email address isn't confirmed yet. Confirm it's you, so you can sign in with it. If this wasn't you, ignore this email.";
  return {
    ...message,
    text: `${message.text}\n\n${line}\nConfirm it's you: ${url}`,
    html: `${message.html}${small(escapeHtml(line))}${button(url, "Confirm it's you")}`,
  };
}
