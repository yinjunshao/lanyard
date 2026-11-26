// Wording for event and security emails (the sending itself lives in mail.js).
// F58: every HTML part is made by emailLayout (worker/mail-layout.js); this file holds the words and the plain text.
import { escapeHtml, emailLayout, paragraphs, para, panel, bullets, link, small, button, addToBody } from "./mail-layout.js";

// To someone who checked in but hasn't answered. Sent once, a day after the event.
export function feedbackReminderEmail({ eventName, url, stopUrl }) {
  const body = `Thanks for coming to ${eventName}. It takes under a minute to tell the organisers how it went, and your answers are anonymous: they see totals, never who said what.`;
  return {
    subject: `How was ${eventName}?`,
    text: `${body}\n\nGive feedback: ${url}\n\nThis is the only reminder we'll send for this event. Stop these emails: ${stopUrl}`,
    html: emailLayout({
      title: `How was ${eventName}?`,
      preheader: "It takes under a minute, and your answers are anonymous.",
      bodyHtml: paragraphs(body),
      button: { url, label: "Give feedback" },
      footerHtml: small(`This is the only reminder we'll send for this event. ${link(stopUrl, "Stop these emails")}`),
    }),
    headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// F48: a follow-up reminder the person set has come due. `people` is [{ first, event, url }] (first names and the
// event name only, as the person sees them in the app); `total` counts everyone due and the email names at most 3.
// Never the private note, tags, an email address or the other person's links. `stopUrl` turns the switch off.
const SHOW = 3;
const plain = (s, n) => [...String(s || "")].map((ch) => { const k = ch.codePointAt(0); return k < 32 || (k >= 127 && k < 160) || k === 8232 || k === 8233 ? " " : ch; }).join("").replace(/ {2,}/g, " ").trim().slice(0, n);
export function followupReminderEmail({ people, total, stopUrl, listUrl }) {
  const shown = people.slice(0, SHOW).map((p) => ({ ...p, first: plain(p.first, 30) || "someone", event: plain(p.event, 80) }));
  const names = shown.map((p) => p.first);
  const more = Math.max(0, total - shown.length);
  const who = more > 0 ? `${names.join(", ")} and ${more} ${more === 1 ? "other" : "others"}`
    : names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  const met = (p) => (p.event ? ` (met at ${p.event})` : "");
  const one = shown.length === 1 && more === 0;
  const intro = `It's time to follow up with ${who}.`;
  const foot = "You set this reminder in Lanyard.";
  const rows = para(shown.map((p) => `${link(p.url, p.first)}${escapeHtml(met(p))}`).join("<br>"));
  return {
    subject: `Time to follow up with ${who}`,
    text: `${intro}\n\n${shown.map((p) => `${p.first}${met(p)}: ${p.url}`).join("\n")}${more > 0 ? `\n\nThe rest are in your People list: ${listUrl}` : ""}\n\n${foot} Stop these emails: ${stopUrl}`,
    html: emailLayout({
      title: "Time to follow up",
      preheader: intro,
      bodyHtml: `${paragraphs(intro)}${rows}`,
      button: { url: one ? shown[0].url : listUrl, label: one ? `Open ${shown[0].first}'s page` : "Open your People list" },
      footerHtml: small(`${escapeHtml(foot)} ${link(stopUrl, "Stop these emails")}`),
    }),
    headers: { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

// F49: finish your card. `names` is at most two first names of people they met (as they see them in the app);
// `missing` is the labels of what is still to add. Nothing else about anyone. The second email says it is the last.
// `stopUrl` is the same switch as the follow-up reminders.
// F75: to someone the admin suggested card details for. It names the fields and where they came from, never a value,
// and says nothing changes until they accept. A service message about their own account (no stop link).
export function suggestedDetailsEmail({ fields, source, url }) {
  const items = (fields || []).slice(0, 12).map((f) => plain(f, 40));
  const intro = `Someone at Lanyard filled in some details for your card, from ${plain(source, 80)}. Nothing changes on your card until you accept them.`;
  const foot = "You can accept some, all or none. If you do nothing, they are deleted after 30 days.";
  return {
    subject: "We filled in some details on your Lanyard card",
    text: `${intro}\n\nWhat we filled in:\n${items.map((m) => `- ${m}`).join("\n")}\n\nReview them: ${url}\n\n${foot}`,
    html: emailLayout({
      title: "We filled in some details for you",
      preheader: "Nothing changes on your card until you accept them.",
      bodyHtml: `${paragraphs(intro)}${paragraphs("What we filled in:")}${bullets(items)}`,
      button: { url, label: "Review the details" },
      footerHtml: small(escapeHtml(foot)),
    }),
  };
}

export function profileNudgeEmail({ second, names, score, max, missing, url, stopUrl }) {
  const who = (names || []).slice(0, 2).map((n) => plain(n, 30)).filter(Boolean);
  const list = who.length > 1 ? `${who[0]} and ${who[1]}` : who[0] || "";
  const items = (missing || []).slice(0, 6).map((m) => plain(m, 40));
  const intro = second
    ? `Your Lanyard card is still ${score} of ${max}.`
    : `${list ? `You met ${list} recently. A finished card helps them remember you.` : "A finished card helps the people you meet remember you."} Your card is ${score} of ${max}.`;
  const foot = second ? "This is the last email we'll send about your card." : "We'll send one more email about this at most.";
  const subject = second ? "Your Lanyard card is still unfinished"
    : list ? `Finish your card so ${list} ${who.length > 1 ? "remember" : "remembers"} you` : "Finish your Lanyard card";
  return {
    subject,
    text: `${intro}\n\nStill to add:\n${items.map((m) => `- ${m}`).join("\n")}\n\nFinish your card: ${url}\n\n${foot} Stop these emails: ${stopUrl}`,
    html: emailLayout({
      title: second ? "Your card is still unfinished" : "Finish your Lanyard card",
      preheader: intro,
      bodyHtml: `${paragraphs(intro)}${paragraphs("Still to add:")}${bullets(items)}`,
      button: { url, label: "Finish your card" },
      footerHtml: small(`${escapeHtml(foot)} ${link(stopUrl, "Stop these emails")}`),
    }),
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
  const html = emailLayout({
    title: `How ${eventName} went`,
    preheader: `${checkins} checked in, ${connections} connections, ${responses} feedback answers so far.`,
    bodyHtml: `${paragraphs(lines[0])}${panel(lines[1])}${paragraphs(lines.slice(2).join("\n\n"))}`,
    button: { url, label: "Open the report" },
  });
  return { subject: `How ${eventName} went`, text, html };
}

// F23: sent once to the person who runs the event, after its feedback window has closed, when the summary has been written.
export function feedbackSummaryEmail({ eventName, paragraph, answers, url }) {
  const lines = [
    `Feedback for ${eventName} has closed. Here is a short summary of the written answers.`,
    paragraph,
    `Written by AI from ${answers} written answers. It can be wrong, so read the answers before you share it. The report has the counts, a few quotes taken word for word, and all the answers.`,
  ];
  const nn = "\n\n";
  const html = emailLayout({
    title: "Feedback summary",
    preheader: `The written answers for ${eventName}, summarised.`,
    bodyHtml: paragraphs(lines.join(nn)),
    button: { url, label: "Open the report" },
  });
  return { subject: `Feedback summary for ${eventName}`, text: `${lines.join(nn)}${nn}Open the report: ${url}`, html };
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
    html: emailLayout({
      title: "New sign-in to your account",
      preheader: "If this was you, there's nothing to do.",
      bodyHtml: `${paragraphs(lines[0])}${panel(lines[1])}${paragraphs(lines[2])}`,
      button: { url: revokeUrl, label: "This wasn't me: sign out everywhere" },
      footerHtml: small(`The link works for 7 days. ${link(settingsUrl, "Review sign-in options")}`),
    }),
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
    html: emailLayout({
      title: "A passkey was removed",
      preheader: "If this was you, there's nothing to do. Your other ways to sign in still work.",
      bodyHtml: `${paragraphs(lines[0])}${panel(lines[1])}${paragraphs(lines[2])}`,
      button: { url: revokeUrl, label: "This wasn't me: sign out everywhere" },
      footerHtml: small(`The link works for 7 days. ${link(settingsUrl, "Review sign-in options")}`),
    }),
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
  const html = emailLayout({
    title: "Your account will be deleted soon",
    preheader: "To keep it, just sign in once.",
    bodyHtml: paragraphs(lines.join(nn)),
    button: { url: `${origin}/signin`, label: "Keep my account" },
  });
  return { subject: "Your Lanyard account will be deleted soon", text, html };
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
    html: emailLayout({
      title: "Confirm your email",
      preheader: "Confirm it's you, so you can sign in with this email on any device.",
      bodyHtml: paragraphs(lines.join(nn)),
      button: { url, label: "Confirm it's you" },
      footerHtml: small(escapeHtml(foot)),
    }),
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
    html: addToBody(message.html, `${small(escapeHtml(line))}${button(url, "Confirm it's you", { secondary: true })}`),
  };
}

// Privacy requests and complaints (worker/privacy.js): the acknowledgement sent straight away.
export function privacyAckEmail({ kind, id }) {
  const what = kind === "complaint" ? "complaint" : "request";
  const text = `We have received your ${what} (reference ${id}). We will deal with it without undue delay and tell you the outcome within 30 days.\n\nIf you need to add something, send another message at lanyd.fyi/privacy-request and quote the reference.`;
  const html = emailLayout({
    title: `We got your ${what}`,
    preheader: `Reference ${id}. We will tell you the outcome within 30 days.`,
    bodyHtml: paragraphs(text),
  });
  return { subject: `We got your ${what} (${id})`, text, html };
}

// The admin's warning that AI spend has passed a share of its budget (worker/ai/alerts.js).
export function aiBudgetAlertEmail({ pct, label, text }) {
  const html = emailLayout({
    title: `AI spend at ${pct}% of the budget`,
    preheader: `Spend for ${label} has passed ${pct}% of the budget.`,
    bodyHtml: paragraphs(text),
  });
  return { subject: `Lanyard AI spend at ${pct}% of the budget ${label}`, text, html };
}
