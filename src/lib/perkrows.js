// F63: perks as rows of a name and details, on Create event (step 3) and the Details tab. A perk is still saved as one
// string, so the Worker, the attendee's perk button and copies of earlier events work as before: `Name (Details)`, or
// `Name` alone. Reading a saved perk back splits on the last bracketed group at the very end (eventtext.js: perkParts).
// Host pages only.
import { perkParts } from "./eventtext.js";

export const PERK_MAX = 10;
export const NAME_MAX = 60;
export const DETAILS_MAX = 230; // 60 + " (" + 230 + ")" is 293, inside the Worker's 300
export const blankPerk = () => ({ name: "", details: "" });

// Saved strings to rows.
export const perkRows = (perks) => (Array.isArray(perks) ? perks : []).slice(0, PERK_MAX).map((s) => {
  const p = perkParts(s);
  return { name: p.label, details: p.detail };
});

// One row to its string; a row with no name is not a perk.
const line = (r) => {
  const name = String(r?.name || "").trim(), details = String(r?.details || "").trim();
  return name ? (details ? `${name} (${details})` : name) : "";
};
// The strings a form sends, in order. A row with no name sends nothing.
export const perkLines = (f) => (Array.isArray(f?.perks) ? f.perks : []).map(line).filter(Boolean).slice(0, PERK_MAX);

// Brackets in the details must match, or reading the perk back would split it in the wrong place.
const balanced = (s) => { let d = 0; for (const c of s) { if (c === "(") d += 1; else if (c === ")" && --d < 0) return false; } return d === 0; };

// Problems with the rows: { "perk0-name": message, "perk1-details": message, perks: message }. Empty means fine.
// A row with nothing in it is ignored, as it sends nothing.
export function perkProblems(rows) {
  const e = {};
  const list = Array.isArray(rows) ? rows : [];
  list.forEach((r, i) => {
    const name = String(r?.name || "").trim(), details = String(r?.details || "").trim();
    if (!name && !details) return;
    const n = i + 1;
    if (!name) e[`perk${i}-name`] = `Perk ${n} needs a name, or clear its details.`;
    else if (/[()]/.test(name)) e[`perk${i}-name`] = `Perk ${n}: the name can't have brackets. Put extra words in Details.`;
    else if (name.length > NAME_MAX) e[`perk${i}-name`] = `Perk ${n}: keep the name to ${NAME_MAX} characters.`;
    if (details.length > DETAILS_MAX) e[`perk${i}-details`] = `Perk ${n}: keep the details to ${DETAILS_MAX} characters.`;
    else if (!balanced(details)) e[`perk${i}-details`] = `Perk ${n}: the details need matching brackets, or none.`;
  });
  if (list.filter((r) => String(r?.name || "").trim()).length > PERK_MAX) e.perks = "Ten perks at most. Remove a few.";
  return e;
}
