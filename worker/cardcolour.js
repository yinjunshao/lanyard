// F55 (D052): what a card's colours may be. A free account saves only the ten preset strap colours; a Plus account
// saves any #RRGGBB. The plan comes from the users row, never from the request, and the rule is part of the
// statement that writes (D040): a request that arrives while a plan lapses, or a second one sent at the same
// moment, cannot get a colour in that the plan does not allow. A lapsed Plus account keeps what it saved (nothing
// is rewritten) and may save that same colour again, but not a new one that is not a preset.
import { strictHex, isPreset } from "../src/lib/cardcolour.js";
import { now } from "./db.js";

export const STRAP_FORMAT = "Use a colour like #C4441E: a # then six letters or numbers.";
export const STRAP_FREE = "Free cards use one of the ten preset colours. Any colour is part of Lanyard Plus.";

// What a request asked of the strap colour. null = not mentioned (leave it as it is). Otherwise
// { value: "#RRGGBB" in capitals, or null to clear, preset: true when anyone may save it } or { error }.
export function readStrap(raw) {
  if (raw === undefined) return null;
  if (raw === null || raw === "") return { value: null, preset: true };
  const value = strictHex(raw);
  if (!value) return { error: STRAP_FORMAT };
  return { value, preset: isPreset(value) };
}

// "This user has Plus now", as a condition inside the write. Binds: the user id, then the time.
export const PLUS_NOW_SQL = "EXISTS (SELECT 1 FROM users WHERE id = ? AND plan = 'plus' AND (plan_until IS NULL OR plan_until = 0 OR plan_until > ?))";
export const plusNowArgs = (userId) => [userId, now()];
