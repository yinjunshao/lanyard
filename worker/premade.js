// F74 (D063): profiles the Lanyard admin makes for someone who is not on Lanyard yet, and the claim link that hands
// one over. The rules every other file asks about live here.
//
// An unclaimed admin-made account is `admin_made = 1 AND is_guest = 1`: a guest with a profile and one card, no session,
// no email and no way to sign in. It is private until claimed: its card is a 404 to everyone (the same answer as a card
// that does not exist), its code opens nothing, its photo is not served, it is never in a link preview, people search,
// People, Who to meet or an event list, and it can never be checked in or connected (the routes refuse, and two triggers
// in migration 0046 refuse in the database too). It is erased 30 days after it was made unless it is claimed.
//
// The claim link is /claim/p/<token>: 32 random bytes as base64url. Only the token's SHA-256 is stored (claim_links),
// it is compared by hash, it expires 30 days after the account was made, Copy link replaces it, and it works once.
// The token travels only in a page address and in POST bodies, never in a query string or an admin route, so it is
// never in admin_audit; the admin sees it once, in the answer that made or replaced it.
import { all, one, run, now } from "./db.js";
import { sha256Hex } from "./session.js";
import { eraseUser } from "./purge.js";
import { drainMediaDeletes } from "./branding.js";

const DAY = 86400_000;
export const PREMADE_MAX_AGE = 30 * DAY; // an unclaimed profile is erased 30 days after it was made
export const SOURCE_MAX = 80;

/** SQL: the account aliased `a` is an unclaimed admin-made one. */
export const UNCLAIMED = (a = "u") => `(${a}.admin_made = 1 AND ${a}.is_guest = 1)`;
/** SQL: the account `idExpr` (a column or a ?) is NOT an unclaimed admin-made one. */
export const NOT_PREMADE = (idExpr) => `NOT EXISTS (SELECT 1 FROM users pm WHERE pm.id = ${idExpr} AND ${UNCLAIMED("pm")})`;

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export function newClaimToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** The stored form of a token. A prefix keeps it from ever matching a hash made for anything else. */
export const hashClaimToken = (token) => sha256Hex(`claim-link:${token}`);
export const claimPath = (token) => `/claim/p/${token}`;

/** "Where the details came from": required, plain text, one line, at most SOURCE_MAX characters. */
export function readSource(raw) {
  if (typeof raw !== "string") return { error: "Say where the details came from, for example LinkedIn." };
  // Control, zero-width and direction characters are removed, and the line is one line.
  const s = raw.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return { error: "Say where the details came from, for example LinkedIn." };
  if ([...s].length > SOURCE_MAX) return { error: `Keep where the details came from to ${SOURCE_MAX} characters.` };
  return { source: s };
}

/** The unclaimed admin-made account with this id, or null (claimed, ordinary or missing accounts are all null). */
export function premadeById(db, id) {
  return one(db, `SELECT u.id, u.created_at FROM users u WHERE u.id = ? AND ${UNCLAIMED("u")}`, String(id || ""));
}

/** Is this an unclaimed admin-made account? */
export async function isPremade(db, userId) {
  return !!(await premadeById(db, userId));
}

/**
 * The live link a token opens: { userId, source, createdAt, expiresAt }, or null for a token that is malformed, unknown,
 * replaced, used (the row is gone) or past its time. All of those are one answer to the person.
 */
export async function linkByToken(db, token, ts = now()) {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return null;
  const row = await one(db,
    `SELECT l.user_id, l.source, l.created_at, l.expires_at FROM claim_links l JOIN users u ON u.id = l.user_id
      WHERE l.token_hash = ? AND l.expires_at > ? AND ${UNCLAIMED("u")}`,
    await hashClaimToken(token), ts);
  return row ? { userId: row.user_id, source: row.source, createdAt: row.created_at, expiresAt: row.expires_at, hash: await hashClaimToken(token) } : null;
}

/** Copy link: a new token for an account that has a link; the old one stops at once. Returns the token, shown once. */
export async function issueClaimLink(db, userId, accountCreatedAt) {
  const token = newClaimToken();
  const r = await run(db, "UPDATE claim_links SET token_hash = ?, created_at = ?, expires_at = ? WHERE user_id = ?",
    await hashClaimToken(token), now(), accountCreatedAt + PREMADE_MAX_AGE, userId);
  return r.meta?.changes ? { token, expiresAt: accountCreatedAt + PREMADE_MAX_AGE } : null;
}

/**
 * Erase an unclaimed admin-made account and its photo ("This isn't me", the admin's Delete, the 30-day purge).
 * The photo key goes in the media_deletes queue first (F66), so a failed R2 delete is tried again by the daily
 * clean-up instead of leaving the file behind; eraseUser then removes the rows (the claim link cascades).
 */
export async function erasePremade(env, userId) {
  const db = env.DB;
  if (!(await isPremade(db, userId))) return false;
  const p = await one(db, "SELECT photo_key FROM profiles WHERE user_id = ?", userId);
  if (p?.photo_key) await run(db, "INSERT OR IGNORE INTO media_deletes (key, queued_at) VALUES (?, ?)", p.photo_key, now());
  await eraseUser(env, userId);
  if (p?.photo_key) await drainMediaDeletes(env, [p.photo_key]);
  return true;
}

/** Is this media key the photo of an unclaimed admin-made profile? Such a photo is never served at /media. */
export async function isPremadePhoto(db, key) {
  // Starts from the admin-made accounts (a partial index, so only those rows) and looks each profile up by its id.
  return !!(await one(db,
    `SELECT 1 AS x FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.admin_made = 1 AND u.is_guest = 1 AND p.photo_key = ? LIMIT 1`, key));
}

/** F74.4: the daily purge erases unclaimed admin-made accounts 30 days after they were made. Claimed ones are never touched. */
export async function purgePremade(env, ts = now()) {
  const old = await all(env.DB,
    `SELECT u.id FROM users u WHERE ${UNCLAIMED("u")} AND u.created_at < ? LIMIT 200`, ts - PREMADE_MAX_AGE);
  let n = 0;
  for (const u of old) if (await erasePremade(env, u.id)) n += 1;
  return n;
}
