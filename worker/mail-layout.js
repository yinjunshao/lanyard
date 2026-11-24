// F58: the one layout every email goes through, in the Lanyard look (Design System): paper behind a raised card
// with the strap bar across its top, the wordmark in text, ink text, one Persimmon button, a quiet footer.
//
// Email-client rules this file keeps, so nothing else has to think about them:
//   - tables and inline styles; the <style> block only adds a narrow-screen rule and the dark colours, and the
//     light version stands alone for clients that drop it (Outlook desktop, older Gmail apps)
//   - no remote images, no tracking pixel, no script, no stylesheet or web font fetched: the wordmark is text and
//     the font is a system stack after Atkinson Hyperlegible Next
//   - the main button is a table button with a VML twin for Outlook (Word's engine)
//   - every piece of user text goes through escapeHtml before it is placed; callers pass plain text
//   - a hidden preheader line for the inbox preview
// The plain-text part of each email is written by its template and is not made here.
import { OPERATOR } from "../src/lib/contact.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ESC[ch]);

// Colours (Design System, F55.0). Dark values are the app's night tokens.
export const MAIL_COLOURS = {
  paper: "#F4F1EA", raised: "#FFFDF8", ink: "#1B1A17", muted: "#6B675F", rule: "#D8D2C5", strap: "#C4441E",
  darkPaper: "#141311", darkRaised: "#201E1A", darkInk: "#F4F1EA", darkMuted: "#9D988D", darkRule: "#3A362F", darkStrap: "#EA7552",
};
const C = MAIL_COLOURS;
const FONT = "'Atkinson Hyperlegible Next', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Marks a document that came from emailLayout; sendMail and sendBatch refuse (in tests and local runs) HTML without it. */
export const LAYOUT_MARK = "<!-- lanyard-email -->";
export const isBranded = (html) => typeof html === "string" && html.includes(LAYOUT_MARK);
/** withConfirm puts its extra block here, just before the footer. */
export const EXTRA_MARK = "<!--lanyard-extra-->";

const P = `margin:0 0 16px;font-size:16px;line-height:24px;color:${C.ink};font-family:${FONT}`;

/** Plain text to HTML paragraphs: blank line splits, a new line is a <br>. `links` are exact URLs (ours, never typed by a
 *  person) that become links wherever they appear. */
export function paragraphs(text, { links = [] } = {}) {
  return String(text).split(/\n{2,}/).map((p) => {
    let h = escapeHtml(p).replace(/\n/g, "<br>");
    for (const u of links) if (u) h = h.split(escapeHtml(u)).join(link(u, u));
    return para(h);
  }).join("");
}

/** One paragraph of already-escaped HTML. */
export const para = (html) => `<p class="ink" style="${P}">${html}</p>`;

/** An inline link in the accent colour. `label` is plain text. */
export const link = (url, label) => `<a class="lnk" href="${escapeHtml(url)}" style="color:${C.strap};text-decoration:underline">${escapeHtml(label)}</a>`;

/** Small muted print inside the body or the footer. `html` is already escaped by the caller. */
export const small = (html) => `<p class="muted" style="margin:0 0 8px;font-size:13px;line-height:19px;color:${C.muted};font-family:${FONT}">${html}</p>`;

/** A bordered panel for facts (when, device, counts). `text` is plain; new lines become <br>. */
export const panel = (text) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr><td class="panel ink" bgcolor="${C.paper}" style="background:${C.paper};border:1px solid ${C.rule};border-radius:6px;padding:12px 16px;font-size:15px;line-height:23px;color:${C.ink};font-family:${FONT}">${escapeHtml(text).replace(/\n/g, "<br>")}</td></tr></table>`;

/** The sign-in code: large, spaced, in a box, easy to select. The digits are one run, so a copy gets the code. */
export const codeBox = (code) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px"><tr><td class="panel ink" align="center" bgcolor="${C.paper}" style="background:${C.paper};border:1px solid ${C.rule};border-radius:6px;padding:18px 12px;font-size:36px;line-height:44px;font-weight:700;letter-spacing:8px;color:${C.ink};font-family:${FONT};font-variant-numeric:tabular-nums"><span style="-webkit-user-select:all;user-select:all">${escapeHtml(code)}</span></td></tr></table>`;

/** A bulleted list of plain strings. */
export const bullets = (items) => `<ul class="ink" style="margin:0 0 16px;padding:0 0 0 22px;font-size:16px;line-height:24px;color:${C.ink};font-family:${FONT}">${items.map((i) => `<li style="margin:0 0 4px">${escapeHtml(i)}</li>`).join("")}</ul>`;

/** A button: 44 px tall, 6 px radius, Persimmon with white text (5.0:1), a table for most clients and VML for Outlook.
 *  `secondary` is the quiet one (a border, no fill) for a second action. */
export function button(url, label, { secondary = false } = {}) {
  const u = escapeHtml(url), l = escapeHtml(label);
  const width = Math.min(500, Math.max(150, 52 + [...String(label)].length * 9));
  const fill = secondary ? C.raised : C.strap, ink = secondary ? C.ink : "#FFFFFF", edge = secondary ? C.ink : C.strap;
  const cls = secondary ? "btn2" : "btn";
  return `<div style="margin:8px 0 20px">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:44px;v-text-anchor:middle;width:${width}px" arcsize="14%" strokecolor="${edge}" strokeweight="1px" fillcolor="${fill}"><w:anchorlock/><center style="color:${ink};font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${l}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="${cls}" bgcolor="${fill}" style="background:${fill};border:1px solid ${edge};border-radius:6px"><a class="${cls}" href="${u}" style="display:inline-block;padding:11px 24px;font-size:16px;line-height:20px;font-weight:700;color:${ink};text-decoration:none;font-family:${FONT}">${l}</a></td></tr></table><!--<![endif]-->
</div>`;
}

// Dark colours: one rule per class, in a media query for clients that support it and again under [data-ogsc]
// (Outlook.com's dark mode). Everything inline above is the light version.
const DARK = [
  [".bg", `background:${C.darkPaper} !important`],
  [".card", `background:${C.darkRaised} !important;border-color:${C.darkRule} !important`],
  [".ink", `color:${C.darkInk} !important`],
  [".muted", `color:${C.darkMuted} !important`],
  [".rule-top", `border-color:${C.darkRule} !important`],
  [".lnk", `color:${C.darkStrap} !important`],
  [".dot", `color:${C.darkStrap} !important`],
  [".panel", `background:${C.darkPaper} !important;border-color:${C.darkRule} !important;color:${C.darkInk} !important`],
  [".btn2", `background:${C.darkRaised} !important;border-color:${C.darkInk} !important;color:${C.darkInk} !important`],
];
const darkCss = DARK.map(([s, d]) => `${s}{${d}}`).join("");
const darkOutlook = DARK.map(([s, d]) => `[data-ogsc] ${s}{${d}}`).join("");
const STYLE = `<style>
@media only screen and (max-width:600px){.wrap{width:100% !important}.pad{padding-left:20px !important;padding-right:20px !important}}
@media (prefers-color-scheme:dark){${darkCss}}
${darkOutlook}
</style>`;

const oneLine = (s, n) => [...String(s || "").replace(/\s+/g, " ").trim()].slice(0, n).join("");

/**
 * The whole document.
 *   preheader  plain text for the inbox preview (shortened to 110 characters)
 *   title      plain text, the short line at the top of the card and the document title
 *   bodyHtml   already-built HTML (paragraphs(), panel(), codeBox(), bullets()): escape user text before it gets here
 *   button     { url, label } or null
 *   footerHtml already-escaped HTML for the footer (why they got it, the stop link)
 */
export function emailLayout({ preheader = "", title = "", bodyHtml = "", button: main = null, footerHtml = "" }) {
  const pre = escapeHtml(oneLine(preheader, 110));
  const pad = `padding-left:32px;padding-right:32px`;
  return `<!doctype html>
${LAYOUT_MARK}
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(oneLine(title, 120))}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
${STYLE}
</head>
<body class="bg" style="margin:0;padding:0;background:${C.paper};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper}">${pre}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" align="center" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<div class="wrap" style="max-width:560px;margin:0 auto">
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.raised}" style="background:${C.raised};border:1px solid ${C.rule};border-radius:6px;border-collapse:separate;overflow:hidden">
<tr><td bgcolor="${C.strap}" height="6" style="background:${C.strap};height:6px;line-height:6px;font-size:0;mso-line-height-rule:exactly">&nbsp;</td></tr>
<tr><td class="pad" style="padding:24px 32px 0;font-family:${FONT}"><span class="ink" style="font-size:20px;line-height:24px;font-weight:700;letter-spacing:-0.02em;color:${C.ink};font-family:${FONT}">lanyard<span class="dot" style="color:${C.strap}">.</span></span></td></tr>
<tr><td class="pad" style="padding:20px 32px 0;font-family:${FONT}"><h1 class="ink" style="margin:0 0 16px;font-size:24px;line-height:30px;font-weight:700;color:${C.ink};font-family:${FONT}">${escapeHtml(oneLine(title, 120))}</h1></td></tr>
<tr><td class="pad" style="${pad};font-family:${FONT}">${bodyHtml}${main ? button(main.url, main.label) : ""}${EXTRA_MARK}</td></tr>
<tr><td class="pad rule-top" style="padding:16px 32px 24px;border-top:1px solid ${C.rule};font-family:${FONT}">${footerHtml}<p class="muted" style="margin:0;font-size:12px;line-height:18px;color:${C.muted};font-family:${FONT}">Lanyard is run by ${escapeHtml(OPERATOR)}.</p></td></tr>
</table>
</div>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

/** withConfirm's door: puts a block of HTML in a finished email, just before the footer. */
export function addToBody(html, block) {
  if (!html.includes(EXTRA_MARK)) throw new Error("addToBody needs an email made with emailLayout");
  return html.replace(EXTRA_MARK, () => block + EXTRA_MARK);
}
