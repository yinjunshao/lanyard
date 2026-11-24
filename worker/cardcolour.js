// F55 (D052): what a card's colours may be. A free account saves only the ten preset strap colours and no text colour;
// a Plus account saves any #RRGGBB strap colour and a text colour that reads. The plan comes from the users row, never
// from the request, and the plan rule is part of the statement that writes (D040): a request that arrives while a plan
// lapses, or a second one sent at the same moment, cannot get a colour in that the plan does not allow. A lapsed Plus
// account keeps what it saved (nothing is rewritten) and may save that same colour again, but not a new one that is not
// a preset. The text colour must also read on the card's paper (3:1 at least); that depends on the theme, so a save that
// changes one is written only if the other is still what it was checked against.
import { strictHex, isPreset, textVerdict } from "../src/lib/cardcolour.js";
import { isMaterial } from "../src/lib/cardmaterial.js";
import { now } from "./db.js";

export const STRAP_FORMAT = "Use a colour like #C4441E: a # then six letters or numbers.";
export const STRAP_FREE = "Free cards use one of the ten preset colours. Any colour is part of Lanyard Plus.";
export const TEXT_FREE = "A text colour is part of Lanyard Plus.";
export const TEXT_LOW = "That text colour is too hard to read on this card. Choose one with more contrast against the card.";
export const MATERIAL_FREE = "A strap material is part of Lanyard Plus.";
export const MATERIAL_FORMAT = "Choose one of the six strap materials: gold, silver, rose-gold, copper, pearl or carbon.";
export const CHANGED = "This card changed while you were saving. Reload the page and try again.";
const THEME_NAMES = { default: "Default", formal: "Formal", night: "Night", host: "Host" };
export const themeText = (theme) => `Your text colour would be too hard to read on the ${THEME_NAMES[theme] || "new"} theme. Set the text colour to Auto, or choose another, in the same save.`;

// What a request asked of a colour. null = not mentioned (leave it as it is). Otherwise
// { value: "#RRGGBB" in capitals, or null to clear, preset: true when anyone may save it } or { error }.
export function readColour(raw, format = STRAP_FORMAT) {
  if (raw === undefined) return null;
  if (raw === null || raw === "") return { value: null, preset: true };
  const value = strictHex(raw);
  if (!value) return { error: format };
  return { value, preset: isPreset(value) };
}
export const readStrap = (raw) => readColour(raw);

// "This user has Plus now", as a condition inside the write. Binds: the user id, then the time.
export const PLUS_NOW_SQL = "EXISTS (SELECT 1 FROM users WHERE id = ? AND plan = 'plus' AND (plan_until IS NULL OR plan_until = 0 OR plan_until > ?))";
export const plusNowArgs = (userId) => [userId, now()];

const same = (a, b) => (a || "").toUpperCase() === (b || "").toUpperCase();

// The colour part of saving a card. `card` is the row as it is now ({ strap_color, text_color, theme }; for a new card the
// empty one), `themeIn` the theme this request sets (undefined: not changing it), `isPlus` the plan read from the database,
// `userId` the account, `b` the request body. Returns { error, code } to refuse, or { fields, guards, guardArgs, needsPlus }: the columns to
// set and the conditions to add to the writing statement.
export function colourChanges({ card, userId, themeIn, isPlus, b }) {
  const out = { fields: {}, guards: [], guardArgs: [], needsPlus: false };
  const strap = readColour("strapColor" in b ? b.strapColor : b.strap_color);
  const text = readColour("textColor" in b ? b.textColor : b.text_color);
  if (strap?.error) return { error: strap.error, code: "bad_colour" };
  if (text?.error) return { error: text.error, code: "bad_colour" };
  const theme = themeIn ?? card.theme ?? "default";
  const themeChanges = themeIn !== undefined && themeIn !== card.theme;
  const plusGuard = () => {
    if (out.guards.some((g) => g.includes("EXISTS"))) return;
    out.guards.push(`AND ${PLUS_NOW_SQL}`);
    out.guardArgs.push(...plusNowArgs(userId));
  };

  // The strap colour. Asking for the colour the card already has changes nothing, so nothing is written.
  if (strap && (strap.value === null ? card.strap_color !== null && card.strap_color !== undefined : !same(card.strap_color, strap.value))) {
    out.fields.strap_color = strap.value;
    if (!strap.preset) {
      if (!isPlus) return { error: STRAP_FREE, code: "plus_colour" };
      out.needsPlus = true;
      plusGuard();
    }
  }

  // The text colour: Plus only, and it has to read on the card's paper.
  const hadText = card.text_color ?? null;
  let textNow = hadText;
  if (text) {
    if (text.value === null) { if (hadText !== null) { out.fields.text_color = null; textNow = null; } }
    else if (!same(hadText, text.value)) {
      if (!isPlus) return { error: TEXT_FREE, code: "plus_colour" };
      out.fields.text_color = text.value;
      textNow = text.value;
      out.needsPlus = true;
      plusGuard();
      if (textVerdict(text.value, theme).level === "no") return { error: TEXT_LOW, code: "text_low" };
      // Checked against the theme the card has now: write only if it still has it.
      if (themeIn === undefined) { out.guards.push("AND theme = ?"); out.guardArgs.push(card.theme ?? "default"); }
    }
  }
  // F56: the strap material (Plus only). The same rule as the text colour: a free or lapsed account may clear it, or send back the
  // one the card already has; a new one needs Plus now, as part of the writing statement. Only the six exact ids are accepted.
  if ("material" in b && b.material !== undefined) {
    const had = card.material ?? null;
    const m = b.material;
    if (m === null || m === "") { if (had !== null) out.fields.material = null; }
    else if (!isMaterial(m)) return { error: MATERIAL_FORMAT, code: "bad_material" };
    else if (m !== had) {
      if (!isPlus) return { error: MATERIAL_FREE, code: "plus_material" };
      out.fields.material = m;
      out.needsPlus = true;
      plusGuard();
    }
  }
  // A new theme with a text colour already on the card (or kept by this request): it has to read there too.
  if (themeChanges && textNow !== null && !(text && text.value !== null && !same(hadText, text.value))) {
    if (textVerdict(textNow, theme).level === "no") return { error: themeText(theme), code: "text_low" };
    out.guards.push("AND text_color IS ?"); out.guardArgs.push(hadText);
  }
  return out;
}
