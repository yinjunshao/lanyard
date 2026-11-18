// F32: marking a voucher as used. Decision D039: staff type a PIN the host set, on the voucher holder's own phone.
//
// Why a PIN: it needs no staff accounts, no second device and no camera, and the holder cannot mark their own
// voucher used without it (nor can anyone with a screenshot). The server keeps only an HMAC of the PIN, bound to
// the drop and the server key; the PIN is shown to the host once, and the host can replace it at any time.
// What a PIN holder can do is bounded: the request is made from the holder's own session, so it can only mark
// the holder's own voucher, and only up to its per-person count.
//
// A use is one conditional INSERT (below). It writes a row only when the drop is on and inside its window and the
// person still has uses left, and the primary key (drop, person, use number) is the second lock: two staff
// pressing at the same moment record one use, and the loser is told when it was used.
import { all, one, run } from "./db.js";
import { HttpError } from "./session.js";
import { bump, peek, HOUR } from "./ratelimit.js";
import { pinMac, sameMac, dropsReady, unavailable } from "./dropcrypto.js";
import { assertOpen } from "./drops.js";

const MIN10 = 10 * 60 * 1000;
export const PIN_TRIES = 5;         // wrong PINs per person per voucher in 10 minutes, then it waits
export const PIN_TRIES_DROP = 100;  // wrong PINs across everyone, per voucher per hour

const USE_SQL = `
INSERT INTO voucher_uses (drop_id, user_id, n, used_at)
SELECT d.id, ?2, COALESCE((SELECT MAX(u.n) FROM voucher_uses u WHERE u.drop_id = d.id AND u.user_id = ?2), 0) + 1, ?3
FROM drops d
WHERE d.id = ?1 AND d.kind = 'voucher' AND d.status = 'on' AND d.purged_at IS NULL
  AND (d.valid_from IS NULL OR d.valid_from <= ?3) AND (d.valid_until IS NULL OR d.valid_until > ?3)
  AND (SELECT COUNT(*) FROM voucher_uses u WHERE u.drop_id = d.id AND u.user_id = ?2) < d.per_person`;

const when = (ms) => new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Marks one use of a voucher for `userId`, if `pin` is the staff PIN. Throws HttpError with a code for every
 * refusal: bad_pin, throttled, already_used, stopped, not_yet, closed, gone, not_a_voucher, drops_unavailable.
 * Returns { ok, left, used, usedAt }.
 */
export async function useVoucher(env, drop, userId, pin, ts = Date.now()) {
  const db = env.DB;
  if (drop.kind !== "voucher") throw new HttpError(400, "This isn't a voucher.", "not_a_voucher");
  if (!dropsReady(env)) throw unavailable();
  assertOpen(drop, ts);
  const mine = (await all(db, "SELECT n, used_at FROM voucher_uses WHERE drop_id = ? AND user_id = ? ORDER BY n", drop.id, userId));
  if (mine.length >= drop.per_person) throw alreadyUsed(mine.at(-1).used_at);

  if (typeof pin !== "string" || !/^\d{6}$/.test(pin.trim())) throw new HttpError(400, "Staff type the 6-digit PIN here.", "pin_needed");
  const badKey = `drop:pinbad:${userId}:${drop.id}`, badAll = `drop:pinall:${drop.id}`;
  if ((await peek(db, badKey, MIN10)) >= PIN_TRIES || (await peek(db, badAll, HOUR)) >= PIN_TRIES_DROP) {
    throw new HttpError(429, "Too many wrong PINs. Wait a few minutes, then ask the staff to try again.", "throttled");
  }
  if ((await bump(db, `drop:use:${userId}:${drop.id}`, MIN10)) > 30) throw new HttpError(429, "Too many tries. Wait a few minutes.", "throttled");
  if (!drop.pin_mac || !sameMac(await pinMac(env, drop.id, pin.trim()), drop.pin_mac)) {
    await bump(db, badKey, MIN10);
    await bump(db, badAll, HOUR);
    throw new HttpError(403, "That PIN isn't right.", "bad_pin");
  }

  return recordUse(db, drop, userId, ts);
}

/**
 * Writes one use of `drop` for `userId`, if the drop is open and they have a use left. Shared by the staff PIN
 * (above) and the scanner link (voucherScan.js). Throws already_used, stopped, not_yet, closed, gone or conflict.
 */
export async function recordUse(db, drop, userId, ts = Date.now()) {
  let changed = 0;
  try {
    changed = (await run(db, USE_SQL, drop.id, userId, ts)).meta?.changes || 0;
  } catch (e) {
    // The primary key refused a second use with the same number: someone else got there first.
    if (!/UNIQUE|constraint/i.test(String(e?.message))) throw e;
  }
  const uses = await all(db, "SELECT n, used_at FROM voucher_uses WHERE drop_id = ? AND user_id = ? ORDER BY n", drop.id, userId);
  if (!changed) {
    // Nothing was written: either every use is taken, or the drop was stopped or closed a moment ago.
    if (uses.length >= drop.per_person) throw alreadyUsed(uses.at(-1).used_at);
    const now = await one(db, "SELECT status, valid_from, valid_until, purged_at FROM drops WHERE id = ?", drop.id);
    assertOpen(now || { purged_at: 1 }, ts);
    throw new HttpError(409, "That didn't go through. Try again.", "conflict");
  }
  return { ok: true, left: drop.per_person - uses.length, used: uses.length, usedAt: uses.map((u) => u.used_at) };
}

const alreadyUsed = (at) => new HttpError(409, `This voucher was already used on ${when(at)}.`, "already_used");
