// Outbound email through Resend. Two API keys, two jobs: account mail (sign-in
// codes) and host decisions (application approved / rejected). Keys are Worker
// secrets (RESEND_ACCOUNTS_KEY, RESEND_DECISIONS_KEY), never in the repo.
import { escapeHtml, emailLayout, paragraphs, para, link, small, codeBox, isBranded } from "./mail-layout.js";
export { escapeHtml }; // the one escaper lives in mail-layout.js; the rest of the Worker still imports it from here

const FROM = {
  accounts: (env) => env.MAIL_FROM_ACCOUNTS || "Lanyard <accounts@lanyd.fyi>",
  decisions: (env) => env.MAIL_FROM_DECISIONS || "Lanyard Hosts <hosts@lanyd.fyi>",
};
const KEY = { accounts: "RESEND_ACCOUNTS_KEY", decisions: "RESEND_DECISIONS_KEY" };

// F58: every email's HTML comes from emailLayout (worker/mail-layout.js). Anything else is a bug: tests and local
// runs (MAIL_OUTBOX, MAIL_LOG) throw so it is caught before a deploy; a live send logs and goes anyway, because a
// plain email is better than a lost sign-in code.
function checkBranded(env, html, to) {
  if (isBranded(html)) return;
  const msg = `Email to ${to} was not made with emailLayout`;
  if (Array.isArray(env.MAIL_OUTBOX) || env.MAIL_LOG) throw new Error(msg);
  console.error(msg);
}

/** Sends one email. `kind` is "accounts" or "decisions". Throws if it can't be sent. */
export async function sendMail(env, kind, { to, subject, text, html }) {
  checkBranded(env, html, to);
  // Replies go to a person, not the sending address.
  const msg = { from: FROM[kind](env), to: [to], reply_to: env.MAIL_REPLY_TO || "help@lanyd.fyi", subject, text, html };
  if (Array.isArray(env.MAIL_OUTBOX)) { env.MAIL_OUTBOX.push({ kind, ...msg }); return; } // tests
  if (env.MAIL_LOG) { console.log(`[mail not sent: MAIL_LOG is on] ${kind} to ${to}: ${subject}
${text}`); return; } // local dev
  const key = env[KEY[kind]];
  if (!key) throw new Error(`Email isn't set up: missing ${KEY[kind]}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function codeEmail(code, signInLink) {
  const text = `Your Lanyard sign-in code is ${code}\n\nIt works for 10 minutes. Or open this link on the device you want to sign in on:\n${signInLink}\n\nIf you did not ask for this, ignore this email. Nobody can get in without the code.`;
  const html = emailLayout({
    title: "Your sign-in code",
    preheader: "It works for 10 minutes. Nobody can get in without the code.",
    bodyHtml: `${paragraphs("Your Lanyard sign-in code:")}${codeBox(code)}${para(`It works for 10 minutes. Or ${link(signInLink, "tap here to sign in")} on this device.`)}`,
    footerHtml: small("If you did not ask for this, ignore this email. Nobody can get in without the code."),
  });
  return { subject: `${code} is your Lanyard code`, text, html };
}

// Host portal sign-in (F10). No code in the link: it is typed on the page that asked for it.
export function hostCodeEmail(code, hostOrigin) {
  const text = `Your Lanyard host portal code is ${code}

Type it on the page where you asked for it. It works for 10 minutes and only once.

If you did not ask for this, ignore this email. Nobody can get in without the code.

${hostOrigin}/signin`;
  const html = emailLayout({
    title: "Your host portal code",
    preheader: "Type it on the page where you asked for it. It works for 10 minutes.",
    bodyHtml: `${paragraphs("Your Lanyard host portal code:")}${codeBox(code)}${paragraphs("Type it on the page where you asked for it. It works for 10 minutes and only once.")}`,
    footerHtml: small("If you did not ask for this, ignore this email. Nobody can get in without the code."),
  });
  return { subject: `${code} is your Lanyard host portal code`, text, html };
}

// Host mail (F10): `origin` is the host portal's address (hostOrigin() in
// host-auth.js), and links go to its pages at the root.
export function decisionEmail({ orgName, approved, note, origin }) {
  const head = approved ? `${orgName} is approved on Lanyard` : `Update on your Lanyard application for ${orgName}`;
  const body = approved
    ? "Your host application has been approved. You can now create and run events."
    : `We couldn't approve this application.${note ? `\n\nReason: ${note}` : ""}\n\nYou can reply to this email or send a new application with the details fixed.`;
  const text = `${body}\n\n${origin}/`;
  const html = emailLayout({
    title: approved ? "Your application is approved" : "About your application",
    preheader: head,
    bodyHtml: paragraphs(body),
    button: { url: `${origin}/`, label: "Open the host portal" },
  });
  return { subject: head, text, html };
}

/** Sends many messages (Resend batch, 100 per call). Each is { to, subject, text, html, headers }. */
export async function sendBatch(env, kind, messages) {
  for (const m of messages) checkBranded(env, m.html, m.to);
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from: FROM[kind](env), to: [m.to], reply_to: env.MAIL_REPLY_TO || "help@lanyd.fyi", subject: m.subject, text: m.text, html: m.html, headers: m.headers }));
    if (Array.isArray(env.MAIL_OUTBOX)) { for (const m of chunk) env.MAIL_OUTBOX.push({ kind, ...m }); continue; }
    if (env.MAIL_LOG) { for (const m of chunk) console.log(`[mail not sent: MAIL_LOG is on] ${kind} to ${m.to[0]}: ${m.subject}`); continue; }
    const key = env[KEY[kind]];
    if (!key) throw new Error(`Email isn't set up: missing ${KEY[kind]}`);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Resend batch ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

export function welcomeEmail(origin) {
  const text = `Welcome to Lanyard. Your email is saved, so you can sign in on any device with a code we email you.\n\nTip: add a passkey in Settings to sign in with Face ID or a fingerprint instead.\n\n${origin}/app/settings/security`;
  const html = emailLayout({
    title: "Your account is saved",
    preheader: "You can sign in on any device with a code we email you.",
    bodyHtml: paragraphs(text.split("\n\n").slice(0, 2).join("\n\n")),
    button: { url: `${origin}/app/settings/security`, label: "Open Settings" },
  });
  return { subject: "Your Lanyard account is saved", text, html };
}

export function applicationEmail({ orgName, origin }) {
  const text = `We have your application for ${orgName}. We check each one by hand and will email you as soon as it is decided.\n\nYou can follow its status at ${origin}/`;
  const html = emailLayout({
    title: "We have your application",
    preheader: "We check each one by hand and will email you when it is decided.",
    bodyHtml: paragraphs(text, { links: [`${origin}/`] }),
    button: { url: `${origin}/`, label: "Open the host portal" },
  });
  return { subject: `We got your Lanyard application for ${orgName}`, text, html };
}

export function ticketEmail({ orgName, approved, note, origin }) {
  const body = approved
    ? `Your request for ${orgName} has been approved.${note ? `\n\n${note}` : ""}`
    : `We couldn't approve your request for ${orgName}.${note ? `\n\nReason: ${note}` : ""}`;
  const text = `${body}\n\n${origin}/`;
  const subject = approved ? `Request approved for ${orgName}` : `Update on your request for ${orgName}`;
  const html = emailLayout({
    title: approved ? "Request approved" : "About your request",
    preheader: subject,
    bodyHtml: paragraphs(body),
    button: { url: `${origin}/`, label: "Open the host portal" },
  });
  return { subject, text, html };
}

// A colleague invited you to their organisation on the host portal.
export function teamInviteEmail({ orgName, fromName, code, origin }) {
  const text = `${fromName || "A colleague"} invited you to help run events for ${orgName} on Lanyard.\n\nSign in to the host portal with this email address, then enter the invite code ${code} under Account and team > Join a team. It works for 7 days.\n\n${origin}/account#join\n\nIf you weren't expecting this, ignore this email.`;
  const html = emailLayout({
    title: "You are invited to a team",
    preheader: `${orgName} invited you to help run events. The code works for 7 days.`,
    bodyHtml: paragraphs(text, { links: [`${origin}/account#join`] }),
    button: { url: `${origin}/account#join`, label: "Join the team" },
  });
  return { subject: `Join ${orgName} on Lanyard`, text, html };
}

// An organisation is waiting for you to accept it.
export function transferEmail({ orgName, fromName, origin }) {
  const text = `${fromName || "Its owner"} wants to hand ${orgName} to your Lanyard host account. Nothing changes until you accept.\n\nSign in to the host portal with this email address to accept or decline:\n${origin}/\n\nIf you weren't expecting this, you can decline it there or ignore this email.`;
  const html = emailLayout({
    title: "An organisation is waiting for you",
    preheader: `Nothing changes until you accept ${orgName}.`,
    bodyHtml: paragraphs(text, { links: [`${origin}/`] }),
    button: { url: `${origin}/`, label: "Open the host portal" },
  });
  return { subject: `${orgName} is waiting for you on Lanyard`, text, html };
}

// Marketing mail always names who sends it and carries a one-click unsubscribe.
export function marketingEmail({ subject, body, unsubUrl }) {
  const footer = `You're getting this because you opted in to news from Lanyard (lanyd.fyi). Unsubscribe: ${unsubUrl}`;
  return {
    subject,
    text: `${body}\n\n--\n${footer}`,
    html: emailLayout({
      title: subject,
      preheader: body,
      bodyHtml: paragraphs(body),
      footerHtml: small(`You're getting this because you opted in to news from Lanyard (lanyd.fyi). ${link(unsubUrl, "Unsubscribe")}`),
    }),
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
