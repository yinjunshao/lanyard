// Card codes: the 4-character "scan to connect" code.
//
// A code is a second way to reach a card, so it has to be harder to abuse than
// the 10-hex card link it stands in for:
//   - it ROTATES (every CODE_TTL_MS); the previous code keeps working for
//     CODE_GRACE_MS so nobody mid-conversation is cut off
//   - a wrong guess is counted per IP and per session, and too many wrong
//     guesses lock lookups for a few minutes
//   - only the owner is ever sent the code; the public card JSON omits it
// Rotation is lazy (no cron): a card's code is renewed the next time its owner
// loads their cards, and an expired code simply stops resolving.
import { now, one, all, run, randomCode } from "./db.js";

export const CODE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // rotate every 3 days
export const CODE_GRACE_MS = 6 * 60 * 60 * 1000; // old code still works for 6h
export const MISS_LIMIT = 10; // wrong guesses allowed ...
export const MISS_WINDOW_MS = 10 * 60 * 1000; // ... per 10 minutes

export function normaliseCode(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function allocCardCode(db) {
  for (let i = 0; i < 25; i++) {
    const code = randomCode(4);
    const hit = await one(
      db,
      "SELECT 1 AS x FROM card_codes WHERE code = ? UNION SELECT 1 FROM cards WHERE code = ?",
      code, code
    );
    if (!hit) return code;
  }
  throw new Error("could not allocate card code");
}

// For code paths that INSERT a brand-new card: returns the code plus the extra
// statement that registers it. Usage: insert the card with `code` and
// `code_rotates_at`, and add `parts.registerStmt(cardId)` to the same batch.
export async function newCardCode(db) {
  const code = await allocCardCode(db);
  const ts = now();
  return {
    code,
    rotatesAt: ts + CODE_TTL_MS,
    registerStmt: (cardId) =>
      db.prepare("INSERT INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)")
        .bind(code, cardId, ts + CODE_TTL_MS + CODE_GRACE_MS),
  };
}

// Replace a card's code. `immediate` kills the old code on the spot (the
// owner pressed "New code now" because it leaked); otherwise it lingers for
// the grace period.
export async function rotateCardCode(db, card, { immediate = false } = {}) {
  const ts = now();
  const code = await allocCardCode(db);
  const rotatesAt = ts + CODE_TTL_MS;
  const stmts = [];
  if (card.code) {
    // Cards imported from v1 have a code but no card_codes row yet.
    stmts.push(
      db.prepare("INSERT OR IGNORE INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)")
        .bind(card.code, card.id, ts + CODE_GRACE_MS)
    );
  }
  stmts.push(
    db.prepare("UPDATE card_codes SET valid_until = MIN(valid_until, ?) WHERE card_id = ?")
      .bind(immediate ? ts : ts + CODE_GRACE_MS, card.id),
    db.prepare("INSERT INTO card_codes (code, card_id, valid_until) VALUES (?, ?, ?)")
      .bind(code, card.id, rotatesAt + CODE_GRACE_MS),
    db.prepare("UPDATE cards SET code = ?, code_rotates_at = ? WHERE id = ?")
      .bind(code, rotatesAt, card.id),
    db.prepare("DELETE FROM card_codes WHERE valid_until < ?").bind(ts)
  );
  await db.batch(stmts);
  return { code, rotatesAt };
}

// Renew any stale codes in a list of card rows (mutates them).
export async function freshenCards(db, cards) {
  const ts = now();
  for (const card of cards) {
    if (!card.code || !card.code_rotates_at || card.code_rotates_at <= ts) {
      const r = await rotateCardCode(db, card);
      card.code = r.code;
      card.code_rotates_at = r.rotatesAt;
    }
  }
  return cards;
}

export async function findCardByCode(db, code) {
  return one(
    db,
    `SELECT c.id FROM card_codes k JOIN cards c ON c.id = k.card_id
     WHERE k.code = ? AND k.valid_until > ?`,
    code, now()
  );
}

/* ----------------------- wrong-guess throttling -------------------------- */

export function throttleKeys(c) {
  const ip = c.req.header("cf-connecting-ip") || "local";
  return [`code:ip:${ip}`, `code:u:${c.get("user")?.id || "none"}`];
}

export async function isThrottled(db, keys) {
  const since = now() - MISS_WINDOW_MS;
  const rows = await all(
    db,
    `SELECT count FROM rate_limits WHERE key IN (${keys.map(() => "?").join(",")}) AND window_start > ?`,
    ...keys, since
  );
  return rows.some((r) => r.count >= MISS_LIMIT);
}

export async function recordMiss(db, keys) {
  const ts = now();
  const since = ts - MISS_WINDOW_MS;
  await db.batch(
    keys.map((k) =>
      db.prepare(
        `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
         ON CONFLICT(key) DO UPDATE SET
           count = CASE WHEN window_start > ? THEN count + 1 ELSE 1 END,
           window_start = CASE WHEN window_start > ? THEN window_start ELSE ? END`
      ).bind(k, ts, since, since, ts)
    )
  );
  await run(db, "DELETE FROM rate_limits WHERE window_start < ?", ts - 6 * MISS_WINDOW_MS);
}
