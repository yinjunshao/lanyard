// F31: what an event can collect, and the words people are shown. One file with no imports, read by
// the Worker (what to honour, what to record), the check-in page (what to show) and the host's form
// and preview (what the host is switching on), so the three cannot say different things. Public
// pages never import it: the check-in page, the hub and the host pages do.
//
// The list of items is fixed. A host can switch on only these, and each one maps to something
// worker/attendance.js actually does. There is no free-text data item.

// Bump this when a label below, or the notice's sentence, changes. It is written to
// consent_log with the wording, and to the person's row, so what they were shown can be proved.
export const NOTICE_VERSION = "2026-11-13";

// The attendance list itself: always first, and the only item that puts a person on the list.
export const ATTENDANCE = { key: "attendance", label: "Your name and check-in time, on a list the organisers keep of who came" };

// The extra items a host may add. `label` is what the person sees on the check-in page;
// `host` is how the host's form describes it.
export const EXTRA_ITEMS = [
  { key: "email", label: "Your email address, so the organisers can contact you after the event", host: "Their email address, so you can contact them after the event" },
  { key: "card", label: "Your card, shared with the organisers", host: "Their card (headline, the line under their name and the links it shows)" },
];
export const EXTRA_KEYS = EXTRA_ITEMS.map((i) => i.key);

export const WHY_MIN = 10;
export const WHY_MAX = 200;

// The "why" line, cleaned: control characters, zero-width and direction-changing characters go
// (the format characters, which include the invisible "tag" block), runs of spaces become one,
// the ends are trimmed. It is shown as text, never as HTML.
export const cleanWhy = (v) => (typeof v === "string"
  ? v.replace(/[\p{Cf}]/gu, "").replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim()
  : "");

// What is wrong with a (cleaned) "why" line, or "" if it is fine.
export function whyProblem(t) {
  const n = [...t].length;
  if (!n) return "Say why you collect this. The people checking in will read it.";
  if (n < WHY_MIN) return `Say a little more: at least ${WHY_MIN} characters.`;
  if (n > WHY_MAX) return `Keep it to ${WHY_MAX} characters or fewer.`;
  return "";
}

// The keys to offer, from whatever a host or a row holds: known keys only, once each, in the fixed order.
export const itemsOf = (list) => EXTRA_KEYS.filter((k) => Array.isArray(list) && list.includes(k));

// What the check-in page shows for an event with named attendance on. `c` is
// { attendance, items, why }; `organiser` is the organisation's name. The Worker builds this from
// the saved event and the host's preview builds it from the form: the same function.
export function noticeOf(c, organiser) {
  if (!c || c.attendance !== true) return null;
  return {
    organiser: String(organiser || "").trim() || "The organisers",
    why: cleanWhy(c.why),
    items: [ATTENDANCE, ...EXTRA_ITEMS.filter((i) => itemsOf(c.items).includes(i.key))].map((i) => ({ key: i.key, label: i.label })),
  };
}

// The exact words recorded in consent_log for one item: the label, who asked and why.
export const wordingFor = (item, notice) => `${item.label}. Asked by: ${notice.organiser}. Why: ${notice.why}`;
