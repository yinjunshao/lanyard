// F40: voucher QR codes and the staff scanner link. Replaces the staff PIN on the holder's phone (D039) for new use.
//
//   - Each person who opens a voucher gets a 6-digit code, unique within the event (migration 0032). Their voucher
//     shows it as a QR code (VOUCHER_QR below) and as digits, for when the camera can't read it.
//   - The host makes a scanner link for a voucher and sends it to staff. The link holds a random token; only its
//     SHA-256 is stored. A new link replaces the old one, and the host can stop it.
//   - The link works from 15 minutes before the voucher (or, with no start of its own, the event) starts until 15
//     minutes after it (or the event) ends. Outside that it is refused, and the voucher's own rules still apply to
//     every scan: a use is written by recordUse(), the same single conditional INSERT the PIN used.
//   - Whoever holds a working link sees, for that one voucher: who was scanned (name and photo), when, and counts.
import { all, newToken, one, run } from "./db.js";
import { HttpError, sha256Hex } from "./session.js";
import { bump } from "./ratelimit.js";
import { eventEndsAt } from "./presence.js";
import { openness } from "./drops.js";
import { recordUse } from "./vouchers.js";

export const SCAN_GRACE_MS = 15 * 60 * 1000;
const MIN10 = 10 * 60 * 1000;
export const SCAN_MISSES = 60; // unknown codes per link in 10 minutes, then it waits

/** What a voucher's QR code holds: the drop and the person's code, so the wrong voucher is caught. */
export const voucherQr = (dropId, code) => `lanyard-voucher:${dropId}:${code}`;

const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

/** This person's code for a voucher, made the first time they open it. Unique within the event. */
export async function codeFor(db, drop, userId, ts = Date.now()) {
  for (let i = 0; i < 8; i++) {
    const had = await one(db, "SELECT code FROM voucher_codes WHERE drop_id = ? AND user_id = ?", drop.id, userId);
    if (had) return had.code;
    // OR IGNORE: a second tab making theirs at the same moment, or (rarely) a code another person has, writes nothing.
    await run(db, "INSERT OR IGNORE INTO voucher_codes (drop_id, event_id, user_id, code, created_at) VALUES (?, ?, ?, ?, ?)",
      drop.id, drop.event_id, userId, sixDigits(), ts);
  }
  throw new HttpError(503, "Couldn't make your code. Try again.", "conflict");
}

/**
 * When a voucher's scanner link works: [from, until], either of which may be null (no limit that side). `since` is the
 * latest of the last check-in and when the link was made: an event with no times ends 12 hours after that, the same
 * rule the event's own status uses (eventEndsAt).
 */
export function scanWindow(drop, ev, since = 0) {
  const start = drop.valid_from || ev.starts_at || null;
  const end = drop.valid_until || eventEndsAt(ev, Math.max(ev.created_at || 0, since || 0));
  return { from: start ? start - SCAN_GRACE_MS : null, until: end ? end + SCAN_GRACE_MS : null };
}

/** Makes (or replaces) a voucher's scanner link. Returns the token, which is in this reply only. */
export async function newScanner(db, drop, hostId, ts = Date.now()) {
  if (drop.kind !== "voucher") throw new HttpError(400, "Only a voucher has a scanner.", "not_a_voucher");
  if (drop.purged_at) throw new HttpError(410, "This drop has been cleared away.", "gone");
  const token = newToken() + newToken();
  await run(db, `INSERT INTO voucher_scanners (drop_id, token_hash, host_account_id, created_at) VALUES (?, ?, ?, ?)
                 ON CONFLICT(drop_id) DO UPDATE SET token_hash = excluded.token_hash, host_account_id = excluded.host_account_id, created_at = excluded.created_at`,
    drop.id, await sha256Hex(token), hostId, ts);
  return token;
}

export const stopScanner = (db, drop) => run(db, "DELETE FROM voucher_scanners WHERE drop_id = ?", drop.id);

/** The figures for one voucher: checked in, opened it (has a code), scanned (used at least once), uses. */
export async function voucherStats(db, drop) {
  const r = await one(db,
    `SELECT (SELECT COUNT(*) FROM checkins WHERE event_id = ?2) AS checked_in,
            (SELECT COUNT(*) FROM (SELECT user_id FROM voucher_codes WHERE drop_id = ?1 UNION SELECT user_id FROM voucher_uses WHERE drop_id = ?1) o
               JOIN checkins ch ON ch.event_id = ?2 AND ch.user_id = o.user_id) AS opened,
            (SELECT COUNT(DISTINCT user_id) FROM voucher_uses WHERE drop_id = ?1) AS people,
            (SELECT COUNT(*) FROM voucher_uses WHERE drop_id = ?1) AS uses`,
    drop.id, drop.event_id);
  return { checkedIn: r?.checked_in || 0, opened: r?.opened || 0, scanned: r?.people || 0, uses: r?.uses || 0, perPerson: drop.per_person };
}

const photoOf = (key) => (key ? `/media/${key}` : null);

/** The scanner link's voucher, event and window, or the refusal: 404 for an unknown or replaced link, 410 once it has ended. */
export async function scannerFor(db, token, ts = Date.now()) {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) throw new HttpError(404, "This scanner link isn't valid. Ask the organisers for a new one.", "bad_link");
  const row = await one(db, `SELECT d.*, s.created_at AS link_at, (SELECT MAX(ch.created_at) FROM checkins ch WHERE ch.event_id = d.event_id) AS last_in
                             FROM voucher_scanners s JOIN drops d ON d.id = s.drop_id WHERE s.token_hash = ?`, await sha256Hex(token));
  if (!row) throw new HttpError(404, "This scanner link isn't valid any more. Ask the organisers for a new one.", "bad_link");
  const ev = await one(db, "SELECT id, name, starts_at, ends_at, ended_at, created_at FROM events WHERE id = ?", row.event_id);
  if (!ev || row.purged_at) throw new HttpError(410, "This voucher has been cleared away.", "gone");
  const win = scanWindow(row, ev, Math.max(row.link_at || 0, row.last_in || 0));
  if (win.until && ts > win.until) throw new HttpError(410, "This scanner link has expired.", "expired");
  return { drop: row, ev, win, early: !!(win.from && ts < win.from) };
}

/** What the scanner page shows: the voucher, the window, the figures and the history (newest first). */
export async function scannerView(db, s, ts = Date.now()) {
  const base = {
    now: ts, early: s.early, from: s.win.from, until: s.win.until,
    event: { name: s.ev.name }, voucher: { title: s.drop.title, note: s.drop.note, perPerson: s.drop.per_person, state: openness(s.drop, ts), validFrom: s.drop.valid_from || null, validUntil: s.drop.valid_until || null },
  };
  if (s.early) return base;
  const history = await all(db,
    `SELECT u.used_at, u.n, p.name, p.photo_key FROM voucher_uses u LEFT JOIN profiles p ON p.user_id = u.user_id
     WHERE u.drop_id = ? ORDER BY u.used_at DESC LIMIT 300`, s.drop.id);
  return {
    ...base,
    stats: await voucherStats(db, s.drop),
    history: history.map((h) => ({ name: h.name || "Guest", photo: photoOf(h.photo_key), at: h.used_at, use: h.n })),
  };
}

/** Reads a scanned QR or typed digits: { code, dropId? }, or null. */
export function readScan(raw) {
  const t = String(raw || "").trim();
  const qr = /^lanyard-voucher:([0-9a-f]{6,40}):(\d{6})$/.exec(t);
  if (qr) return { dropId: qr[1], code: qr[2] };
  const digits = t.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? { code: digits } : null;
}

/**
 * One scan at the scanner link. Returns { status, body }: 200 with the person and what is left, or a refusal
 * that still names the person where there is one (already used), so staff can see who is in front of them.
 */
export async function scanOnce(db, s, raw, ts = Date.now()) {
  if (s.early) return { status: 409, body: { error: `This scanner opens at ${clock(s.win.from)}.`, code: "early" } };
  const missKey = `vscan:miss:${s.drop.id}`;
  const bad = async (status, error, code) => {
    if ((await bump(db, missKey, MIN10)) > SCAN_MISSES) return { status: 429, body: { error: "Too many codes that didn't match. Wait a few minutes.", code: "throttled" } };
    return { status, body: { error, code } };
  };
  const got = readScan(raw);
  if (!got) return bad(400, "That isn't a Lanyard voucher. Scan the QR code on their voucher, or type its 6 digits.", "not_a_voucher");
  if (got.dropId && got.dropId !== s.drop.id) {
    const other = await one(db, "SELECT title FROM drops WHERE id = ? AND event_id = ?", got.dropId, s.drop.event_id);
    return bad(409, other ? `That's their ${other.title} voucher, not ${s.drop.title}.` : "That voucher is for a different event.", "wrong_voucher");
  }
  const vc = await one(db,
    `SELECT vc.drop_id, vc.user_id, d.title, p.name, p.photo_key FROM voucher_codes vc
     JOIN drops d ON d.id = vc.drop_id
     JOIN checkins ch ON ch.event_id = vc.event_id AND ch.user_id = vc.user_id
     LEFT JOIN profiles p ON p.user_id = vc.user_id
     WHERE vc.event_id = ? AND vc.code = ?`, s.drop.event_id, got.code);
  if (!vc) return bad(404, "No voucher has that code. Check the digits with them.", "no_such_code");
  if (vc.drop_id !== s.drop.id) return bad(409, `That's their ${vc.title} voucher, not ${s.drop.title}.`, "wrong_voucher");

  const person = { name: vc.name || "Guest", photo: photoOf(vc.photo_key) };
  const drop = await one(db, "SELECT * FROM drops WHERE id = ?", s.drop.id);
  try {
    const r = await recordUse(db, drop, vc.user_id, ts);
    return { status: 200, body: { ok: true, person, used: r.used, left: r.left, perPerson: drop.per_person, at: ts } };
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    const uses = await all(db, "SELECT used_at FROM voucher_uses WHERE drop_id = ? AND user_id = ? ORDER BY n", drop.id, vc.user_id);
    return { status: e.status, body: { error: e.message, code: e.code, person, used: uses.length, perPerson: drop.per_person, lastUsedAt: uses.at(-1)?.used_at || null } };
  }
}

const clock = (ms) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
