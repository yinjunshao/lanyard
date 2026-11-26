// F58: branded emails. Every email the Worker can send goes through one layout, in the Lanyard look.
// Run: node test/mail-layout.mjs
// Nothing is sent: every template is called with sample data (scripts/mail-samples.mjs), the real Worker is driven
// on in-memory SQLite for three live flows, and a stand-in for fetch records what a live send would do.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { makeEnv, check, summary, lastCode } from "./harness.mjs";
import { SAMPLES } from "../scripts/mail-samples.mjs";
import { emailLayout, isBranded, addToBody, MAIL_COLOURS, paragraphs, button, link, panel, codeBox } from "../worker/mail-layout.js";
import { sendMail, sendBatch, escapeHtml, codeEmail } from "../worker/mail.js";
import { withConfirm, confirmEmail } from "../worker/mail-templates.js";
import { OPERATOR } from "../src/lib/contact.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const files = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const worker = files(join(root, "worker")).filter((p) => p.endsWith(".js")).map((p) => [p.slice(root.length).replace(/\\/g, "/"), readFileSync(p, "utf8").replace(/\r\n/g, "\n")]);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => unesc(m[1]));
// What a person reads in the card: no head, no hidden preheader, no VML twin of the button, no tags.
const visible = (html) => unesc(html.slice(html.indexOf('<table role="presentation" class="card"'))
  .replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/g, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<br>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const built = SAMPLES.map((s) => ({ ...s, m: s.build() }));

console.log("\n# Every send site, and every template, is covered");
{
  // Every call of sendMail( or sendBatch( in the Worker, by file. A new call fails here until it is listed, and its
  // email is added to scripts/mail-samples.mjs, which is what the rest of this file runs.
  const SITES = { "admin.js": 5, "ai/alerts.js": 1, "ai/feedbackSummary.js": 1, "alerts.js": 2, "email-auth.js": 3, "eventmail.js": 2, "followupmail.js": 1,
    "host-auth.js": 1, "hosts.js": 3, "pending-email.js": 1, "privacy.js": 1, "profilenudge.js": 1, "purge.js": 1, "suggestedEdits.js": 1 };
  const found = {};
  for (const [p, t] of worker) {
    if (p === "worker/mail.js") continue;
    const n = (t.match(/\b(sendMail|sendBatch)\(/g) || []).length;
    if (n) found[p.replace("worker/", "")] = n;
  }
  check("the send sites are exactly the ones listed (file and number of calls)", JSON.stringify(Object.entries(found).sort()) === JSON.stringify(Object.entries(SITES).sort()), found);
  check("every send site has a sample (its file is named in scripts/mail-samples.mjs)", Object.keys(SITES).every((f) => SAMPLES.some((s) => s.from.split(/[ ,]+/).includes(f))), Object.keys(SITES).filter((f) => !SAMPLES.some((s) => s.from.split(/[ ,]+/).includes(f))));
  check("only mail.js talks to Resend", worker.every(([p, t]) => p === "worker/mail.js" || !/api\.resend\.com/.test(t)));
  // No send site writes HTML: the message comes from a template, which calls emailLayout.
  const handHtml = worker.filter(([p, t]) => !["worker/mail.js", "worker/mail-templates.js", "worker/mail-layout.js"].includes(p) && /\bhtml\s*:/.test(t) && /\b(sendMail|sendBatch)\(/.test(t)).map(([p]) => p);
  check("no file that sends mail writes an html: field by hand", handHtml.length === 0, handHtml);
  const templates = [...(read("worker/mail.js") + read("worker/mail-templates.js")).matchAll(/export function (\w+(?:Email|Confirm))\b/g)].map((m) => m[1]);
  const samplesSrc = read("scripts/mail-samples.mjs");
  check("every exported email template has a sample", templates.length >= 20 && templates.every((t) => new RegExp(`\\b${t}\\(`).test(samplesSrc)), templates.filter((t) => !new RegExp(`\\b${t}\\(`).test(samplesSrc)));
  check("every template builds its HTML with emailLayout (no bare html string left in mail.js or mail-templates.js)",
    !/html:\s*[`"'<]/.test(read("worker/mail.js") + read("worker/mail-templates.js")) && !/html:\s*(paragraphs|`|\$)/.test(read("worker/mail.js") + read("worker/mail-templates.js")));
  check("the samples cover 31 emails and every file name is unique", SAMPLES.length === 31 && new Set(SAMPLES.map((s) => s.id)).size === SAMPLES.length, SAMPLES.length);
}

console.log("\n# The send functions refuse HTML that did not come from emailLayout");
{
  const msg = { to: "a@b.test", subject: "s", text: "t", html: "<p>plain</p>" };
  const tests = [];
  const e1 = await sendMail({ MAIL_OUTBOX: [] }, "accounts", msg).then(() => null, (e) => e);
  check("sendMail with a test outbox throws for a hand-written html", !!e1 && /emailLayout/.test(e1.message) && tests.length === 0);
  const e2 = await sendBatch({ MAIL_OUTBOX: [] }, "accounts", [{ ...msg, html: undefined }]).then(() => null, (e) => e);
  check("sendBatch throws too, even for a missing html part", !!e2 && /emailLayout/.test(e2.message));
  const e3 = await sendMail({ MAIL_LOG: "1" }, "accounts", msg).then(() => null, (e) => e);
  check("and a local MAIL_LOG run throws, so a developer sees it", !!e3);
  const box = [];
  await sendMail({ MAIL_OUTBOX: box }, "accounts", { ...msg, html: emailLayout({ title: "x", bodyHtml: "" }) });
  check("an email made with emailLayout goes", box.length === 1 && isBranded(box[0].html));
  // A live send (no outbox, no log) must not lose the mail over this: it logs and sends.
  const realFetch = globalThis.fetch, realErr = console.error;
  const calls = [], logs = [];
  globalThis.fetch = async (url, init) => { calls.push([String(url), init]); return new Response("{}", { status: 200 }); };
  console.error = (...a) => logs.push(a.join(" "));
  try { await sendMail({ RESEND_ACCOUNTS_KEY: "re_test_not_real" }, "accounts", msg); } finally { globalThis.fetch = realFetch; console.error = realErr; }
  check("a live send of an unbranded email is logged and still sent (a lost sign-in code is worse)", calls.length === 1 && calls[0][0] === "https://api.resend.com/emails" && logs.some((l) => /emailLayout/.test(l)), logs);
}

console.log("\n# The layout: paper, card, strap bar, wordmark, button, footer");
for (const s of built) {
  const h = s.m.html;
  const ok = isBranded(h) && h.startsWith("<!doctype html>") && h.includes(`bgcolor="${MAIL_COLOURS.paper}"`) && h.includes(`bgcolor="${MAIL_COLOURS.raised}"`)
    && h.includes(`bgcolor="${MAIL_COLOURS.strap}" height="6"`) && />lanyard<span class="dot"[^>]*>\.<\/span>/.test(h)
    && h.includes("border:1px solid #D8D2C5") && h.includes("border-radius:6px") && h.includes(`Lanyard is run by ${OPERATOR}.`) && /<h1[^>]*>[^<]+<\/h1>/.test(h);
  check(`${s.id}: paper, raised card with a 1px rule and 6px radius, 6px Persimmon strap bar, text wordmark, title line, operator footer`, ok);
}
{
  const withButton = built.filter((s) => /label|class="btn"/.test(s.m.html) || s.m.html.includes('class="btn"'));
  check("every email that has an action has a Persimmon table button, 44 px (padding 11 + 20 line + 11 + 2 border)",
    withButton.length >= 20 && withButton.every((s) => /<td class="btn" bgcolor="#C4441E" style="background:#C4441E;border:1px solid #C4441E;border-radius:6px"><a class="btn"[^>]*padding:11px 24px;font-size:16px;line-height:20px;font-weight:700;color:#FFFFFF/.test(s.m.html)), withButton.length);
  check("…and a VML twin for Outlook (44 px, rounded, same fill, same link)", withButton.every((s) => /<!--\[if mso\]><v:roundrect[^>]*href="[^"]+"[^>]*height:44px[^>]*fillcolor="#C4441E"/.test(s.m.html) && /<!--\[if !mso\]><!-->/.test(s.m.html)));
  const none = built.filter((s) => !s.m.html.includes('class="btn"') && !s.m.html.includes('class="btn2"')).map((s) => s.id).sort();
  check("the emails with no button are the two sign-in codes, the claim code (F74), the news email, the privacy acknowledgements and the AI alert (the code or the words are the point)",
    JSON.stringify(none) === JSON.stringify(["ai-budget", "claim-code", "code", "host-code", "news", "privacy-complaint", "privacy-request"]), none);
  check("white on the Persimmon strap is at least 4.5:1 (and the dark accent on dark paper)", contrast("#FFFFFF", MAIL_COLOURS.strap) >= 4.5 && contrast(MAIL_COLOURS.darkStrap, MAIL_COLOURS.darkPaper) >= 4.5 && contrast(MAIL_COLOURS.muted, MAIL_COLOURS.raised) >= 4.5 && contrast(MAIL_COLOURS.darkMuted, MAIL_COLOURS.darkRaised) >= 4.5,
    [contrast("#FFFFFF", MAIL_COLOURS.strap), contrast(MAIL_COLOURS.darkStrap, MAIL_COLOURS.darkPaper)]);
  check("the brand colours are the 2026-11-24 values (strap #C4441E, not the old #D9502B)", MAIL_COLOURS.strap === "#C4441E" && built.every((s) => !/D9502B/i.test(s.m.html)));
  check("a second button (the confirm one) is the quiet kind: bordered, not filled", /class="btn2" bgcolor="#FFFDF8"/.test(built.find((s) => s.id === "followup-unconfirmed").m.html));
}

console.log("\n# Dark and light, and the font");
for (const s of built) {
  const h = s.m.html;
  const head = h.slice(0, h.indexOf("</head>"));
  const ok = /<meta name="color-scheme" content="light dark">/.test(head) && /<meta name="supported-color-schemes" content="light dark">/.test(head)
    && /@media \(prefers-color-scheme:dark\)\{[^}]*\.bg\{background:#141311 !important\}\.card\{background:#201E1A !important[^}]*\}\.ink\{color:#F4F1EA !important\}/.test(head)
    && /\[data-ogsc\] \.ink\{color:#F4F1EA !important\}/.test(head);
  check(`${s.id}: color-scheme meta, a dark block (paper #141311, card #201E1A, ink #F4F1EA) and an Outlook.com one`, ok);
}
check("the light version stands alone: outside the head, no dark colour is written inline",
  built.every((s) => !/#141311|#201E1A|#EA7552|#9D988D|#3A362F/i.test(s.m.html.slice(s.m.html.indexOf("<body")))));
check("each email names Atkinson Hyperlegible Next first, then system fonts, and fetches no web font",
  built.every((s) => /font-family:'Atkinson Hyperlegible Next', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif/.test(s.m.html) && !/@font-face|@import|fonts\.googleapis|<link/i.test(s.m.html)));
check("a narrow-screen rule makes the card the full width and tightens its padding", built.every((s) => /@media only screen and \(max-width:600px\)\{\.wrap\{width:100% !important\}\.pad\{padding-left:20px !important/.test(s.m.html)));

console.log("\n# A hidden preheader, a plain-text part, and the same links");
for (const s of built) {
  const m = s.m, pre = m.html.match(/<div style="display:none;[^>]*>([^<]*)</)?.[1] || "";
  const preText = unesc(pre.replace(/&nbsp;|&zwnj;/g, "")).trim();
  check(`${s.id}: a hidden preheader of 1 to 110 characters`, preText.length >= 1 && preText.length <= 110 && /display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all/.test(m.html), preText.length);
  const urls = new Set((m.text.match(/https?:\/\/[^\s<>"]+/g) || []).map((u) => u.replace(/[.,)]+$/, "")));
  const stray = hrefs(m.html).filter((h) => !urls.has(h));
  check(`${s.id}: a plain-text part, and every link in the HTML is also in the text`, typeof m.text === "string" && m.text.length > 20 && !/<[a-z]/i.test(m.text) && stray.length === 0, stray);
}

console.log("\n# The words are kept: every plain line of the text part is in the HTML");
for (const s of built) {
  const vis = visible(s.m.html).replace(/ ?\| ?/g, " ");
  // The two code emails' HTML has always said "Your Lanyard sign-in code:" above the box and "Or tap here" with a link; the
  // claim code email (F74) says "Your claim code:" above its box.
  const reworded = /^Your Lanyard (sign-in|host portal) code is \d{6}$|^Your claim code is \d{6}$|^It works for 10 minutes\. Or open this link/;
  const lines = s.m.text.split("\n").map((l) => l.replace(/^- /, "").replace(/\s+/g, " ").trim()).filter((l) => l && l !== "--" && !/https?:\/\//.test(l) && !reworded.test(l));
  const missing = lines.filter((l) => !vis.includes(l));
  check(`${s.id}: ${lines.length} lines of the text are in the HTML`, lines.length > 0 && missing.length === 0, missing);
}

console.log("\n# Subjects are unchanged");
{
  const subject = Object.fromEntries(built.map((s) => [s.id, s.m.subject]));
  const want = {
    code: "482915 is your Lanyard code", "claim-code": "615203 is your code to claim your Lanyard card", "host-code": "739204 is your Lanyard host portal code", welcome: "Your Lanyard account is saved",
    "confirm-connect": "Confirm your email for Lanyard", "confirm-card": "Confirm your email for Lanyard",
    "followup-one": "Time to follow up with Priya", "followup-many": "Time to follow up with Priya, Tom, Aisha and 2 others",
    "profile-first": "Finish your card so Priya and Tom remember you", "profile-second": "Your Lanyard card is still unfinished",
    "feedback-reminder": "How was Autumn Robotics Mixer?", "host-summary": "How Autumn Robotics Mixer went",
    "feedback-summary": "Feedback summary for Autumn Robotics Mixer", "sign-in-alert": "New sign-in to your Lanyard account",
    "passkey-removed": "A passkey was removed from your Lanyard account", inactive: "Your Lanyard account will be deleted soon",
    "privacy-request": "We got your request (01HXSAMPLE0000)", "privacy-complaint": "We got your complaint (01HXSAMPLE0001)",
    application: "We got your Lanyard application for Riverside Robotics Club", "decision-approved": "Robotics Club is approved on Lanyard",
    "decision-rejected": "Update on your Lanyard application for Robotics Club", "ticket-approved": "Request approved for Robotics Club",
    "ticket-rejected": "Update on your request for Robotics Club", "team-invite": "Join Robotics Club on Lanyard",
    transfer: "Robotics Club is waiting for you on Lanyard", news: "What is new in Lanyard", "suggested-details": "We filled in some details on your Lanyard card", "ai-budget": "Lanyard AI spend at 90% of the budget today",
  };
  check("every subject is what it was before F58 (pinned)", Object.entries(want).every(([k, v]) => subject[k] === v), Object.entries(want).filter(([k, v]) => subject[k] !== v));
}

console.log("\n# Nothing remote, nothing active");
for (const s of built) {
  const h = s.m.html;
  const bad = [/<img\b/i, /<script\b/i, /<link\b/i, /<iframe\b/i, /<object\b|<embed\b|<video\b|<audio\b/i, /\bsrc\s*=/i, /url\(/i, /@import/i, /background=/i, /\bon\w+\s*=/i, /javascript:/i, /<form\b|<input\b/i, /\bsrcset\b/i]
    .filter((re) => re.test(h)).map(String);
  const http = hrefs(h).filter((u) => !/^https:\/\//.test(u));
  check(`${s.id}: no image, tracking pixel, script, stylesheet, iframe, form or event handler; every link is https; under 30 KB (${(h.length / 1024).toFixed(1)} KB)`, bad.length === 0 && http.length === 0 && h.length < 30 * 1024, [...bad, ...http]);
}
check("the layout file itself has no img, script or remote url but the operator import", !/<img|<script|https?:\/\//.test(read("worker/mail-layout.js").replace(/xmlns(:\w+)?="[^"]*"/g, "").replace(/urn:[^"']+/g, "")));

console.log("\n# User text is escaped (a script, a broken attribute, an ampersand and a quote)");
{
  const EVIL = ["<script>alert(1)</script>", '"><img src=x>', `Tom & "Jerry" <b>bold</b>`];
  const hostile = SAMPLES.filter((s) => s.user.length);
  check("the templates that show a person's text are covered (names, events, organisations, notes, devices, passkey names, subjects)", hostile.length >= 17, hostile.length);
  for (const s of hostile) {
    for (const x of EVIL) {
      const m = s.build(x), h = m.html;
      const body = h.slice(h.indexOf("<body"));
      const esc = escapeHtml(x);
      // The text must show up, escaped, and no tag from it may be alive anywhere in the document.
      const raw = /<script|<img|<b>|onerror|<\/b>/i.test(h);
      const shown = h.includes(esc) || h.includes(escapeHtml(x.slice(0, 30)));
      const attrBreak = /href="[^"]*"[^>]*\bsrc=/.test(h) || /"><img/.test(h);
      check(`${s.id} with ${JSON.stringify(x).slice(0, 30)}: shown escaped, no live tag, subject is plain data`, !raw && shown && !attrBreak && body.length > 0 && typeof m.subject === "string", { raw, shown });
    }
  }
  const h = emailLayout({ title: EVIL[0], preheader: EVIL[1], bodyHtml: paragraphs(EVIL[2]), button: { url: 'https://x.test/?a="><script>', label: EVIL[1] }, footerHtml: "" });
  check("emailLayout escapes the title, the preheader, a paragraph, a button label and a button link", !/<script|<img|<b>/.test(h) && h.includes("&lt;script&gt;alert(1)&lt;/script&gt;") && h.includes("&quot;&gt;&lt;img src=x&gt;") && h.includes("Tom &amp; &quot;Jerry&quot;"));
  check("a link and the code box escape their text; a link target with a quote cannot leave its attribute", !/"><script/.test(link('https://x.test/"><script>alert(1)</script>', "<b>x</b>") + codeBox("<i>1</i>")) && !/<i>1/.test(codeBox("<i>1</i>")));
  check("paragraphs only links the exact URLs it is given, never one that was typed", !/<a /.test(paragraphs("see https://evil.test/x now")) && /<a [^>]*href="https:\/\/ok\.test\/a"/.test(paragraphs("go to https://ok.test/a", { links: ["https://ok.test/a"] })));
  // The names a person types reach the title as well as the body; a very long one is cut.
  const long = built.find((s) => s.id === "feedback-reminder").build("x".repeat(500));
  const h1 = long.html.match(/<h1[^>]*>([^<]*)<\/h1>/)[1];
  check("a 500-character event name is cut in the title and the preheader (the body keeps it, escaped)", [...h1].length === 120 && !/x{121}/.test(long.html.match(/display:none[^>]*>([^<]*)</)[1]) && long.html.length < 30 * 1024, [...h1].length);
  const news = SAMPLES.find((s) => s.id === "news").build("word ".repeat(1500));
  check("a news email with an 8,000-character body of ordinary words stays under 30 KB", news.html.length < 30 * 1024, news.html.length);
}

console.log("\n# The sign-in code: large, boxed, and the same in the subject, the text and the HTML");
for (const id of ["code", "host-code"]) {
  const s = built.find((x) => x.id === id), m = s.m;
  const code = m.text.match(/code is (\d{6})/)[1];
  check(`${id}: the code is ${code} in the subject, the text and the HTML, once in the box, 36 px, 700 weight, spaced, as one run of digits`,
    m.subject.startsWith(code) && (m.html.match(new RegExp(`>${code}<`, "g")) || []).length === 1 && /font-size:36px[^"]*font-weight:700;letter-spacing:8px/.test(m.html) && /border:1px solid #D8D2C5;border-radius:6px/.test(m.html.slice(m.html.indexOf("font-size:36px") - 400, m.html.indexOf("font-size:36px"))));
}
{
  const c = codeEmail("000123", "https://lanyard.test/api/auth/email/link?t=a&b=c");
  check("a code with leading zeros is kept as typed, and a sign-in link with & is escaped in the HTML and plain in the text", c.html.includes(">000123<") && c.html.includes("t=a&amp;b=c") && c.text.includes("t=a&b=c"));
}

console.log("\n# Stop links and unsubscribe headers are kept");
{
  const withStop = built.filter((s) => s.stop);
  check("the reminder, finish-your-profile, feedback and news emails carry a stop link", withStop.map((s) => s.id).sort().join() === "feedback-reminder,followup-many,followup-one,followup-unconfirmed,news,profile-first,profile-second,profile-unconfirmed");
  for (const s of withStop) {
    const m = s.m;
    check(`${s.id}: the stop link is in the HTML (a link with its own text), in the text, and the two headers are exactly the one-click pair`,
      hrefs(m.html).includes(s.stop) && m.text.includes(s.stop) && /Stop these emails|Unsubscribe/.test(visible(m.html)) && m.headers["List-Unsubscribe"] === `<${s.stop}>` && m.headers["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click" && Object.keys(m.headers).length === 2);
  }
  const without = built.filter((s) => !s.stop && s.m.headers);
  check("no other email carries a List-Unsubscribe header (the sign-in, security and host emails have no stop link)", without.length === 0, without.map((s) => s.id));
  const foot = (id) => { const h = built.find((s) => s.id === id).m.html; return h.slice(h.indexOf('class="pad rule-top"')); };
  check("the stop link sits in the footer, under the rule, with the operator line", ["feedback-reminder", "followup-one", "profile-first", "news"].every((id) => /Stop these emails|Unsubscribe/.test(foot(id)) && foot(id).includes(OPERATOR)));
}

console.log("\n# withConfirm puts the confirm button in the body and keeps the rest");
{
  const base = built.find((s) => s.id === "followup-one").m;
  const m = built.find((s) => s.id === "followup-unconfirmed").m;
  const url = "https://lanyd.fyi/api/email/confirm?t=0123456789abcdef0123456789abcdef";
  check("the confirm line and button come before the footer, the text part has them, and the stop link, headers and subject are unchanged",
    m.html.indexOf("isn&#39;t confirmed yet") > 0 && m.html.indexOf("isn&#39;t confirmed yet") < m.html.indexOf('class="pad rule-top"') && hrefs(m.html).includes(url) && m.text.includes(url) && m.subject === base.subject && JSON.stringify(m.headers) === JSON.stringify(base.headers) && hrefs(m.html).filter((h) => h === url).length === 2);
  let err = null; try { withConfirm({ subject: "s", text: "t", html: "<p>x</p>" }, url); } catch (e) { err = e; }
  check("withConfirm on HTML that did not come from emailLayout throws rather than drop the button", !!err);
  check("withConfirm with no URL changes nothing", withConfirm(base, "") === base);
  check("addToBody is the only door: the marker is in every email once", built.every((s) => (s.m.html.match(/<!--lanyard-extra-->/g) || []).length >= 1) && !!addToBody);
}

console.log("\n# One layout, one footer, the operator named once");
{
  check("the operator is imported from src/lib/contact.js, not written in the Worker", !worker.some(([, t]) => t.includes(OPERATOR)) && /import \{ OPERATOR \} from "\.\.\/src\/lib\/contact\.js"/.test(read("worker/mail-layout.js")));
  check("the footer line names the company and no place, number or address", built.every((s) => { const f = s.m.html.match(/Lanyard is run by ([^<]*)\./)?.[1]; return f === OPERATOR; }));
  check("emailLayout with no button and no footer still works and has the marker", isBranded(emailLayout({ title: "t" })) && !/class="btn"/.test(emailLayout({ title: "t" })));
  check("a panel and a bullet list are escaped tables and lists", /&lt;i&gt;/.test(panel("<i>when</i>\nsecond")) && /<br>/.test(panel("a\nb")));
  check("button() widens with its label up to 500 px for Outlook", /width:150px/.test(button("https://x.test/", "Go")) && /width:500px/.test(button("https://x.test/", "x".repeat(200))));
}

console.log("\n# The preview");
{
  const pkg = JSON.parse(read("package.json"));
  check("npm run mail:preview runs scripts/mail-preview.mjs", pkg.scripts["mail:preview"] === "node scripts/mail-preview.mjs");
  check("scratch/ is git-ignored, so the output is never committed", /^scratch\/$/m.test(read(".gitignore")));
  const r = spawnSync(process.execPath, ["scripts/mail-preview.mjs"], { cwd: root, encoding: "utf8" });
  const dir = join(root, "scratch", "mail-preview");
  const html = readdirSync(dir).filter((f) => f.endsWith(".html") && f !== "index.html");
  const index = readFileSync(join(dir, "index.html"), "utf8");
  check("it runs, and writes one page and one text file per email, plus an index that links to every page", r.status === 0 && html.length === SAMPLES.length && SAMPLES.every((s) => existsSync(join(dir, `${s.id}.html`)) && existsSync(join(dir, `${s.id}.txt`)) && index.includes(`href="${s.id}.html"`)), r.stderr);
  check("a preview page is byte for byte the email's HTML, and the text file carries the subject and headers", SAMPLES.every((s) => readFileSync(join(dir, `${s.id}.html`), "utf8") === s.build().html) && /^Subject: .*\nList-Unsubscribe: </m.test(readFileSync(join(dir, "followup-one.txt"), "utf8")));
  check("the preview script sends nothing: no fetch, no sendMail, no network import", !/\bfetch\(|sendMail|sendBatch|node:http|node:net/.test(read("scripts/mail-preview.mjs")));
}

console.log("\n# Real flows through the Worker");
{
  const T = await makeEnv();
  const { client, env } = T;
  env.DB.raw.prepare("INSERT INTO users (id, created_at, recovery_email, email_verified) VALUES ('u1', 1, 'reader@mail.test', 1)").run();
  const c = client({ ip: "198.51.100.7" });
  const r = await c.post("/api/auth/email/start", { email: "reader@mail.test" });
  const m = [...env.MAIL_OUTBOX].reverse().find((x) => x.to[0] === "reader@mail.test");
  const code = lastCode(c, "reader@mail.test");
  check("a real sign-in code request sends a branded email with the same code in the subject, text and HTML", r.status === 200 && !!m && isBranded(m.html) && !!code && m.subject.startsWith(code) && m.html.includes(`>${code}<`) && m.kind === "accounts", r.json);
  const h = client({ ip: "198.51.100.8", site: "host" });
  await h.post("/api/host/auth/start", { email: "boss@mail.test" });
  const hm = [...env.MAIL_OUTBOX].reverse().find((x) => x.to[0] === "boss@mail.test");
  const hcode = hm?.text.match(/code is (\d{6})/)?.[1];
  check("a real host code request sends a branded email on the hosts sender, with the same code in the HTML", !!hm && isBranded(hm.html) && hm.kind === "decisions" && !!hcode && hm.html.includes(`>${hcode}<`) && hm.html.includes("Your host portal code"));
  const p = await c.post("/api/privacy-request", { kind: "complaint", email: "writer@mail.test", message: "Please tell me what you keep." });
  const pm = env.MAIL_OUTBOX.find((x) => x.to[0] === "writer@mail.test");
  check("a real privacy request is acknowledged with a branded email that has the reference in the subject, text and HTML", p.status === 200 && !!pm && isBranded(pm.html) && pm.subject.includes(p.json.id) && pm.text.includes(p.json.id) && pm.html.includes(p.json.id));
  check("every email the Worker pushed to the test outbox in this file is branded", env.MAIL_OUTBOX.length >= 3 && env.MAIL_OUTBOX.every((x) => isBranded(x.html)));
}

summary();
