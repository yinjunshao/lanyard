// The one line under a name (F11). Student: "Course · University" (with the
// year after, where the screen asks for it). Career: "Role at Company", plus
// "Studied at ..." when that is filled in. Only the chosen mode's fields show;
// the other mode's are kept on the profile but never printed.
export const isCareer = (p) => p?.mode === "career";

export function subtitleParts(p, { year = false } = {}) {
  if (!p) return [];
  const t = (v) => (typeof v === "string" ? v.trim() : "");
  if (isCareer(p)) {
    const role = t(p.role), company = t(p.company), uni = t(p.uni);
    return [role && company ? `${role} at ${company}` : role || company, uni && `Studied at ${uni}`].filter(Boolean);
  }
  return [t(p.course), t(p.uni), year && t(p.year)].filter(Boolean);
}

export const subtitleOf = (p, opts) => subtitleParts(p, opts).join(" · ");

// ---- F13: how two people met ----
// Here, not in a file of their own: a separate chunk shared by several pages adds its file
// name to the preload list in the entry that every page, the landing page included, loads.
// The card's address says how it was opened: ?s=q (a QR code), ?s=c (a typed
// code) or ?s=l (a shared link). A missing or unknown value counts as a link.
export const viaOfS = (s) => (s === "q" ? "qr" : s === "c" ? "code" : s === "l" ? "link" : null);

// Add or replace ?s= on an address (a full URL, or a "?n=...&event=..." query
// from the scanner) and keep everything else.
export function withSource(address, s) {
  const text = String(address || "");
  const cut = text.indexOf("?");
  const base = cut < 0 ? (text.startsWith("?") ? "" : text) : text.slice(0, cut);
  const p = new URLSearchParams(cut < 0 ? "" : text.slice(cut + 1));
  p.set("s", s);
  return `${base}?${p}`;
}

const HOW = { qr: "QR code", code: "code", link: "link" };
const howOf = (via) => (typeof via === "string" && Object.hasOwn(HOW, via) ? HOW[via] : "");

// The full sentence, for a person's page: "Connected via QR code at Spring night".
// via is null for connections made before this was recorded; that reads as
// "Connected" and never guesses a method.
export function connectedVia(c) {
  const { via, eventName } = c || {};
  const how = howOf(via);
  const at = eventName ? ` at ${eventName}` : "";
  return `Connected${how ? ` via ${how}` : ""}${at}`;
}

// The short form for a row in the people list: "QR code · Spring night". It is
// empty when nothing is known, so the row shows no line at all.
export function connectedShort(c) {
  const { via, eventName } = c || {};
  const how = howOf(via);
  const label = how && how[0].toUpperCase() + how.slice(1);
  return [label, eventName].filter(Boolean).join(" · ");
}

// When you connected, in the viewer's own time zone: "Tue 4 Nov 2026, 18:42".
export function metStamp(t) {
  const d = new Date(t);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).replace(",", "");
  return `${day}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
}
