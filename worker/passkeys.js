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

const CHALLENGE_COOKIE = "lanyard_ch";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function rpConfig(c) {
  const origin = c.env.APP_ORIGIN || new URL(c.req.url).origin;
  const rpId = c.env.RP_ID || new URL(c.req.url).hostname;
  return { origins: origin.split(",").map((s) => s.trim()).filter(Boolean), rpId };
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
  await createSession(c, db, record.user_id);
  return { userId: record.user_id };
}
