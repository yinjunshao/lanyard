// Card codes: the short code you type under Scan when a QR won't scan.
//
// A card's code is PERMANENT, so it can be printed on a badge or a slide.
//   - the owner can swap it for a new random one (e.g. it was posted somewhere
//     they didn't want); the old one stops working straight away
//   - Plus members can choose their own code, once every CUSTOM_EVERY_MS; the
//     old one keeps working for OLD_CODE_GRACE_MS so printed badges still land
//   - a retired code is held for CODE_HOLD_MS before anyone else can take it,
//     so an old badge never quietly opens a stranger's card
//   - wrong guesses are counted per IP and per session, and too many lock
//     lookups for a few minutes (codes are short, so this matters)
//   - only the owner is ever sent the code; the public card JSON omits it
import { now, one, all, run, randomCode } from "./db.js";

export const FOREVER = 9007199254740991;
export const OLD_CODE_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // a changed custom code still works for 30 days
export const CODE_HOLD_MS = 180 * 24 * 60 * 60 * 1000;     // and nobody else can take it for 6 months
export const CUSTOM_EVERY_MS = 7 * 24 * 60 * 60 * 1000;    // Plus: choose a code once a week
export const CUSTOM_MIN = 4, CUSTOM_MAX = 8;
export const MISS_LIMIT = 10; // wrong guesses allowed ...
export const MISS_WINDOW_MS = 10 * 60 * 1000; // ... per 10 minutes

export function normaliseCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Is this code free for `cardId` to use? Held/retired codes of other cards,
// live cards and event check-in codes all count as taken.
async function codeTaken(db, code, cardId = null) {
  const hit = await one(
    db,
    `SELECT 1 AS x FROM card_codes WHERE code = ? AND card_id IS NOT ?
     UNION SELECT 1 FROM cards WHERE code = ? AND id IS NOT ?
     UNION SELECT 1 FROM events WHERE code = ?`,
    code, cardId, code, cardId, code
  );
  return !!hit;
}
export const isCodeTaken = codeTaken;

async function allocCardCode(db) {
  for (let i = 0; i < 25; i++) {
    const code = randomCode(4);
    if (!(await codeTaken(db, code))) return code;
  }
  throw new Error("could not allocate card code");
}

// For code paths that INSERT a brand-new card: returns the code plus the extra
// statement that registers it. Usage: insert the card with `code` and
// `code_rotates_at` (always null now), and add `registerStmt(cardId)` to the batch.
export async function newCardCode(db) {
  const code = await allocCardCode(db);
  return {
    code,
    rotatesAt: null,
    registerStmt: (cardId) =>
      db.prepare("INSERT OR REPLACE INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)")
        .bind(code, cardId, FOREVER),
  };
}

// Statements that move `card` from its current code to `code`. The old code
// stops resolving at `oldUntil` and is held for CODE_HOLD_MS after that.
function switchStmts(db, card, code, oldUntil, extraSet = "") {
  const ts = now();
  const stmts = [];
  if (card.code && card.code !== code) {
    stmts.push(
      db.prepare("INSERT OR REPLACE INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)")
        .bind(card.code, card.id, oldUntil)
    );
  }
  stmts.push(
    // Any earlier codes of this card that were still live forever: end them too.
    db.prepare("UPDATE card_codes SET valid_until = MIN(valid_until, ?) WHERE card_id = ? AND code <> ?")
      .bind(oldUntil, card.id, code),
    db.prepare("INSERT OR REPLACE INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)")
      .bind(code, card.id, FOREVER),
    db.prepare(`UPDATE cards SET code = ?, code_rotates_at = NULL${extraSet} WHERE id = ?`)
      .bind(code, card.id),
    db.prepare("DELETE FROM card_codes WHERE valid_until < ?").bind(ts - CODE_HOLD_MS)
  );
  return stmts;
}

// "Replace with a random code": the old code dies on the spot.
export async function rotateCardCode(db, card) {
  const code = await allocCardCode(db);
  await db.batch(switchStmts(db, card, code, now()));
  return { code, rotatesAt: null };
}

const RESERVED = new Set([
  "ADMIN", "ADMINS", "ROOT", "STAFF", "SUPPORT", "HELP", "HELPDESK", "LANYARD", "LANYD", "OFFICIAL",
  "SECURITY", "MOD", "MODS", "MODERATOR", "HOST", "HOSTS", "EVENT", "EVENTS", "SCAN", "LOGIN", "SIGNIN",
  "PASSWORD", "VERIFY", "UCL", "UCLSU", "NULL", "UNDEFINED", "TEST",
]);
// Not a full filter: catches the obvious ones. Reports cover the rest.
const BLOCKED = ["FUCK", "SHIT", "CUNT", "NIGG", "FAG", "RAPE", "NAZI", "PORN", "SLUT", "WHORE", "KILL", "DICK", "COCK", "PUSSY", "BITCH", "WANK", "TWAT"];

export function checkCustomCode(raw) {
  const code = normaliseCode(raw);
  if (code.length < CUSTOM_MIN || code.length > CUSTOM_MAX) {
    return { error: `Use ${CUSTOM_MIN} to ${CUSTOM_MAX} letters or numbers.` };
  }
  if (!/[A-Z]/.test(code)) return { error: "Include at least one letter." };
  if (RESERVED.has(code)) return { error: "That code is reserved. Try another." };
  const plain = code.replace(/0/g, "O").replace(/1/g, "I").replace(/3/g, "E").replace(/4/g, "A").replace(/5/g, "S").replace(/7/g, "T");
  if (BLOCKED.some((w) => plain.includes(w))) return { error: "That code isn't allowed. Try another." };
  return { code };
}

// Plus: choose your own code. Caller checks the plan and the weekly limit.
export async function setCustomCode(db, card, code) {
  if (card.code === code) return { code, same: true };
  if (await codeTaken(db, code, card.id)) return { error: "Someone already has that code. Try another.", taken: true };
  const ts = now();
  try {
    await db.batch(switchStmts(db, card, code, ts + OLD_CODE_GRACE_MS, ", code_custom = 1, code_changed_at = " + ts));
  } catch (e) {
    // Two people claimed the same code at the same moment: the primary key wins.
    if (/UNIQUE|constraint/i.test(String(e?.message || e))) return { error: "Someone already has that code. Try another.", taken: true };
    throw e;
  }
  return { code, changedAt: ts };
}

// Make sure every card has a permanent, registered code (mutates the rows).
// Cards from before codes became permanent still have code_rotates_at set;
// their current code is kept and made permanent.
export async function freshenCards(db, cards) {
  for (const card of cards) {
    if (!card.code) {
      const r = await rotateCardCode(db, card);
      card.code = r.code;
    } else if (card.code_rotates_at) {
      await db.batch([
        db.prepare("INSERT OR REPLACE INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)").bind(card.code, card.id, FOREVER),
        db.prepare("UPDATE cards SET code_rotates_at = NULL WHERE id = ?").bind(card.id),
      ]);
    }
    card.code_rotates_at = null;
  }
  return cards;
}

// F74: a card the admin made that is waiting to be claimed opens nothing, the same as a code that does not exist.
export async function findCardByCode(db, code) {
  return one(
    db,
    `SELECT c.id FROM card_codes k JOIN cards c ON c.id = k.card_id
     WHERE k.code = ? AND k.valid_until > ?
       AND NOT EXISTS (SELECT 1 FROM users pm WHERE pm.id = c.user_id AND pm.admin_made = 1 AND pm.is_guest = 1)`,
    code, now()
  );
}

/* ----------------------- wrong-guess throttling -------------------------- */

export function throttleKeys(c) {
  const ip = c.req.header("cf-connecting-ip") || "local";
  // Signed out, the IP is the only counter: one shared "nobody" counter let ten wrong guesses
  // from anyone lock every signed-out visitor out for ten minutes (F35.3).
  const u = c.get("user")?.id;
  return u ? [`code:ip:${ip}`, `code:u:${u}`] : [`code:ip:${ip}`];
}

// A guess takes its place on every counter BEFORE it is checked (F35.3). Checking the count first
// and adding to it afterwards let guesses sent at the same moment all pass the check. Each counter
// is one atomic write that returns the new count; false means a counter is over MISS_LIMIT and the
// guess must not be checked at all. A right guess hands its place back with giveBack(), so only
// wrong guesses stay counted, as before.
export async function takeTry(db, keys) {
  const ts = now();
  const since = ts - MISS_WINDOW_MS;
  let over = false;
  for (const k of keys) {
    const row = await one(db,
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start > ? THEN count + 1 ELSE 1 END,
         window_start = CASE WHEN window_start > ? THEN window_start ELSE ? END
       RETURNING count`, k, ts, since, since, ts);
    if ((row?.count ?? 1) > MISS_LIMIT) over = true;
  }
  // Tidy only short-lived throttle keys; longer windows (guest:, day:) are cleared by the daily purge.
  await run(db, "DELETE FROM rate_limits WHERE window_start < ? AND (key LIKE 'code:%' OR key LIKE 'auth:%')", ts - 6 * MISS_WINDOW_MS);
  return !over;
}

/** The guess was right: it does not count as a wrong one. */
export async function giveBack(db, keys) {
  await db.batch(keys.map((k) => db.prepare("UPDATE rate_limits SET count = count - 1 WHERE key = ? AND count > 0").bind(k)));
}
