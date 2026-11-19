// Passkey (WebAuthn) registration/login via SimpleWebAuthn.
//
// Challenges are kept server-side (webauthn_challenges), single use and short
// lived. The browser only holds an opaque id in a cookie. The expected origin
// and RP ID always come from server config, never from anything the client
// sends, so a forged cookie can't make the server accept a replayed or
// cross-site assertion.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { newId, newToken, now, one, run, all } from "./db.js";
import { createSession, requireUser, HttpError } from "./session.js";
import { notifySignIn, notifyPasskeyRemoved } from "./alerts.js";

const CHALLENGE_COOKIE = "lanyard_ch";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rpConfig(c) {
  const origin = c.env.APP_ORIGIN || new URL(c.req.url).origin;
  const host = new URL(c.req.url).hostname;
  const dom = c.env.RP_DOMAIN;
  // Passkeys are bound to the domain they were made on. The custom domain gets
  // its own; the old workers.dev address keeps RP_ID so existing passkeys work.
  const rpId = dom && (host === dom || host.endsWith("." + dom)) ? dom : (c.env.RP_ID || host);
  // The host portal (host.*) is in APP_ORIGIN but has no passkeys (F10), so a
  // passkey made or used there is never accepted.
  const origins = origin.split(",").map((s) => s.trim()).filter((o) => o && !/^https?:\/\/host\./.test(o));
  return { origins, rpId };
}

async function setChallenge(c, challenge, userId = null) {
  const db = c.env.DB;
  const id = newToken();
  const ts = now();
  await run(db, "DELETE FROM webauthn_challenges WHERE expires_at < ?", ts);
  await run(db, "INSERT INTO webauthn_challenges (id, challenge, user_id, expires_at) VALUES (?, ?, ?, ?)",
    id, challenge, userId, ts + CHALLENGE_TTL_MS);
  setCookie(c, CHALLENGE_COOKIE, id, {
    httpOnly: true, sameSite: "Strict", secure: c.req.url.startsWith("https://"), path: "/api/passkey", maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

// Consumes the challenge: it can be used once, by the browser it was issued to.
async function takeChallenge(c, userId = null) {
  const id = getCookie(c, CHALLENGE_COOKIE);
  deleteCookie(c, CHALLENGE_COOKIE, { path: "/api/passkey" });
  if (!id || !/^[0-9a-f]{32}$/.test(id)) throw new HttpError(400, "That sign-in attempt expired. Try again.");
  const row = await one(c.env.DB,
    "DELETE FROM webauthn_challenges WHERE id = ? AND expires_at > ? RETURNING challenge, user_id", id, now());
  if (!row || (userId && row.user_id !== userId)) throw new HttpError(400, "That sign-in attempt expired. Try again.");
  return row.challenge;
}

export async function registerOptions(c, db) {
  const user = requireUser(c);
  const creds = await all(
    db,
    "SELECT credential_id AS id FROM webauthn_credentials WHERE user_id = ?",
    user.id
  );
  const { origins, rpId } = rpConfig(c);
  const options = await generateRegistrationOptions({
    rpName: "Lanyard",
    rpID: rpId,
    userName: user.recovery_email || user.id,
    // WebAuthn user handle must be ≤64 bytes and stable; our 10-char hex ids
    // are used verbatim.
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: creds.map((r) => ({ id: r.id })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await setChallenge(c, options.challenge, user.id);
  return options;
}

export async function registerVerify(c, db, body) {
  const user = requireUser(c);
  const challenge = await takeChallenge(c, user.id);
  const { origins, rpId } = rpConfig(c);
  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpId,
  }).catch(() => ({ verified: false }));
  if (!verification.verified) throw new HttpError(400, "That passkey couldn't be verified. Try again.");
  const reg = verification.registrationInfo;
  await run(
    db,
    `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(credential_id) DO NOTHING`,
    newId(),
    user.id,
    reg.credential.id,
    reg.credential.publicKey,
    reg.credential.counter,
    JSON.stringify(reg.credential.transports || []),
    now()
  );
  await run(db, "UPDATE users SET has_passkey = 1, is_guest = 0 WHERE id = ?", user.id);
  return { ok: true };
}

export async function loginOptions(c, db) {
  const { origins, rpId } = rpConfig(c);
  const options = await generateAuthenticationOptions({
    rpID: rpId,
    userVerification: "preferred",
  });
  await setChallenge(c, options.challenge);
  return options;
}

// Discoverable-credential login: the authenticator returns the user handle.
export async function loginVerify(c, db, body) {
  const challenge = await takeChallenge(c);
  const { origins, rpId } = rpConfig(c);

  const record = await one(db, "SELECT * FROM webauthn_credentials WHERE credential_id = ?", String(body?.id || ""));
  if (!record) throw new HttpError(404, "That passkey isn't registered here.");

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: challenge,
    expectedOrigin: origins,
    expectedRPID: rpId,
    credential: {
      id: record.credential_id,
      publicKey: record.public_key,
      counter: record.counter,
      transports: record.transports || [],
    },
  }).catch(() => ({ verified: false }));
  if (!verification.verified) throw new HttpError(400, "That passkey couldn't be verified. Try again.");

  await run(db, "UPDATE webauthn_credentials SET counter = ? WHERE id = ?",
    verification.authenticationInfo.newCounter, record.id);
  // F43: when this passkey was last used. Kept apart from the counter write, and allowed to fail,
  // so signing in never depends on the 0035 migration having been applied first.
  await run(db, "UPDATE webauthn_credentials SET last_used_at = ? WHERE id = ?", now(), record.id).catch(() => {});
  await createSession(c, db, record.user_id);
  await notifySignIn(c, db, record.user_id, "passkey");
  return { userId: record.user_id };
}

/* ---------------------- manage passkeys (F43) ---------------------- */

// Names are plain text: no control or zero-width characters, no angle brackets, 1 to 40 characters.
const NAME_MAX = 40;
export function cleanName(raw) {
  if (typeof raw !== "string" || raw.length > 400) return null;
  const s = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202f\u205f-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0<>]/g, "")
    .replace(/\s+/g, " ").trim();
  const n = [...s].length;
  return n >= 1 && n <= NAME_MAX ? s : null;
}

// Only the signed-in person's own rows. Never the public key, counter or credential id.
export async function listPasskeys(c, db) {
  const user = requireUser(c);
  const rows = await all(db,
    "SELECT id, name, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at, id", user.id);
  return { passkeys: rows.map((r) => ({ id: r.id, name: r.name || null, addedAt: r.created_at, lastUsedAt: r.last_used_at || null })) };
}

export async function renamePasskey(c, db, id, body) {
  const user = requireUser(c);
  const name = cleanName(body?.name);
  if (!name) throw new HttpError(400, `Give it a name of 1 to ${NAME_MAX} characters.`, "bad_name");
  const r = await run(db, "UPDATE webauthn_credentials SET name = ? WHERE id = ? AND user_id = ?", name, String(id), user.id);
  if (!r.meta?.changes) throw new HttpError(404, "We couldn't find that passkey.", "not_found");
  return { ok: true, name };
}

// One conditional DELETE decides it, so two requests racing to remove a person's last two
// passkeys cannot both pass: the second sees no other sign-in method left and removes nothing.
// A way back in is another passkey, a verified email, a recovery key or an authenticator app.
export async function removePasskey(c, db, id) {
  const user = requireUser(c);
  const before = await one(db, "SELECT name FROM webauthn_credentials WHERE id = ? AND user_id = ?", String(id), user.id);
  const [del] = await db.batch([
    db.prepare(
      `DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ? AND (
         EXISTS (SELECT 1 FROM webauthn_credentials o WHERE o.user_id = ? AND o.id != ?)
         OR EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND (u.email_verified = 1 OR u.has_recovery = 1 OR u.has_totp = 1)))`
    ).bind(String(id), user.id, user.id, String(id), user.id),
    db.prepare("UPDATE users SET has_passkey = EXISTS (SELECT 1 FROM webauthn_credentials WHERE user_id = ?) WHERE id = ?").bind(user.id, user.id),
  ]);
  if (del.meta?.changes) { await notifyPasskeyRemoved(c, db, user.id, before?.name || null); return { ok: true }; }
  const there = await one(db, "SELECT id FROM webauthn_credentials WHERE id = ? AND user_id = ?", String(id), user.id);
  if (!there) throw new HttpError(404, "We couldn't find that passkey.", "not_found");
  throw new HttpError(409, "This passkey is your only way to sign in. Add another way first (an email, a recovery key or an authenticator app, or another passkey), then remove it.", "last_method");
}
