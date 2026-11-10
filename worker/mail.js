// Outbound email through Resend. Two API keys, two jobs: account mail (sign-in
// codes) and host decisions (application approved / rejected). Keys are Worker
// secrets (RESEND_ACCOUNTS_KEY, RESEND_DECISIONS_KEY), never in the repo.
const FROM = {
  accounts: (env) => env.MAIL_FROM_ACCOUNTS || "Lanyard <accounts@lanyd.fyi>",
  decisions: (env) => env.MAIL_FROM_DECISIONS || "Lanyard Hosts <hosts@lanyd.fyi>",
};
const KEY = { accounts: "RESEND_ACCOUNTS_KEY", decisions: "RESEND_DECISIONS_KEY" };

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ESC[ch]);

/** Sends one email. `kind` is "accounts" or "decisions". Throws if it can't be sent. */
export async function sendMail(env, kind, { to, subject, text, html }) {
  // Replies go to a person, not the sending address.
  const msg = { from: FROM[kind](env), to: [to], reply_to: env.MAIL_REPLY_TO || "help@lanyd.fyi", subject, text, html };
  if (Array.isArray(env.MAIL_OUTBOX)) { env.MAIL_OUTBOX.push({ kind, ...msg }); return; } // tests
  const key = env[KEY[kind]];
  if (!key) throw new Error(`Email isn't set up: missing ${KEY[kind]}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function codeEmail(code, link) {
  const text = `Your Lanyard sign-in code is ${code}\n\nIt works for 10 minutes. Or open this link on the device you want to sign in on:\n${link}\n\nIf you did not ask for this, ignore this email. Nobody can get in without the code.`;
  const html = `<p>Your Lanyard sign-in code:</p><p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:8px 0">${escapeHtml(code)}</p>
<p>It works for 10 minutes. Or <a href="${escapeHtml(link)}">tap here to sign in</a> on this device.</p>
<p style="color:#6B675F;font-size:13px">If you did not ask for this, ignore this email. Nobody can get in without the code.</p>`;
  return { subject: `${code} is your Lanyard code`, text, html };
}

export function decisionEmail({ orgName, approved, note, origin }) {
  const head = approved ? `${orgName} is approved on Lanyard` : `Update on your Lanyard application for ${orgName}`;
  const body = approved
    ? "Your host application has been approved. You can now create and run events."
    : `We couldn't approve this application.${note ? `\n\nReason: ${note}` : ""}\n\nYou can reply to this email or send a new application with the details fixed.`;
  const text = `${body}\n\n${origin}/host`;
  const html = `<p>${escapeHtml(body).replace(/\n\n/g, "</p><p>")}</p><p><a href="${escapeHtml(origin)}/host">Open the host portal</a></p>`;
  return { subject: head, text, html };
}

/** Sends many messages (Resend batch, 100 per call). Each is { to, subject, text, html, headers }. */
export async function sendBatch(env, kind, messages) {
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({ from: FROM[kind](env), to: [m.to], reply_to: env.MAIL_REPLY_TO || "help@lanyd.fyi", subject: m.subject, text: m.text, html: m.html, headers: m.headers }));
    if (Array.isArray(env.MAIL_OUTBOX)) { for (const m of chunk) env.MAIL_OUTBOX.push({ kind, ...m }); continue; }
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

const paragraphs = (text) => String(text).split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");

export function welcomeEmail(origin) {
  const text = `Welcome to Lanyard. Your email is saved, so you can sign in on any device with a code we email you.\n\nTip: add a passkey in Settings to sign in with Face ID or a fingerprint instead.\n\n${origin}/app/settings/security`;
  const html = `${paragraphs(text.split("\n\n").slice(0, 2).join("\n\n"))}<p><a href="${escapeHtml(origin)}/app/settings/security">Open Settings</a></p>`;
  return { subject: "Your Lanyard account is saved", text, html };
}

export function applicationEmail({ orgName, origin }) {
  const text = `We have your application for ${orgName}. We check each one by hand and will email you as soon as it is decided.\n\nYou can follow its status at ${origin}/host`;
  return { subject: `We got your Lanyard application for ${orgName}`, text, html: `${paragraphs(text)}` };
}

export function ticketEmail({ orgName, approved, note, origin }) {
  const body = approved
    ? `Your request for ${orgName} has been approved.${note ? `\n\n${note}` : ""}`
    : `We couldn't approve your request for ${orgName}.${note ? `\n\nReason: ${note}` : ""}`;
  const text = `${body}\n\n${origin}/host`;
  return { subject: approved ? `Request approved for ${orgName}` : `Update on your request for ${orgName}`, text, html: paragraphs(text) };
}

// Marketing mail always names who sends it and carries a one-click unsubscribe.
export function marketingEmail({ subject, body, unsubUrl }) {
  const footer = `You're getting this because you opted in to news from Lanyard (lanyd.fyi). Unsubscribe: ${unsubUrl}`;
  return {
    subject,
    text: `${body}\n\n--\n${footer}`,
    html: `${paragraphs(body)}<hr><p style="color:#6B675F;font-size:12px">You're getting this because you opted in to news from Lanyard (lanyd.fyi). <a href="${escapeHtml(unsubUrl)}">Unsubscribe</a></p>`,
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
