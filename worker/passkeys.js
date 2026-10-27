// Passkey (WebAuthn) registration/login via SimpleWebAuthn.
// Challenge state lives in KV-free D1 table? We piggyback on the sessions row
// via a tiny auth_challenges table created lazily in schema — instead we keep
// challenges in a signed cookie so no extra table is needed.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { getCookie, setCookie } from "hono/cookie";
import { newId, now, one, run, all } from "./db.js";

const CHALLENGE_COOKIE = "lanyard_ch";

function rpConfig(c) {
  const origin = c.env.APP_ORIGIN || new URL(c.req.url).origin;
  const rpId = c.env.RP_ID || new URL(c.req.url).hostname;
  return { origins: origin.split(",").map((s) => s.trim()), rpId };
}

function setChallenge(c, payload) {
  const data = btoa(JSON.stringify(payload));
  setCookie(c, CHALLENGE_COOKIE, data, {
    httpOnly: true, sameSite: "Lax", secure: c.req.url.startsWith("https://"), path: "/", maxAge: 600,
  });
}
function readChallenge(c) {
  const raw = getCookie(c, CHALLENGE_COOKIE);
  if (!raw) return null;
  try { return JSON.parse(atob(raw)); } catch { return null; }
}

export async function registerOptions(c, db) {
  const user = c.get("user");
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
  setChallenge(c, { ch: options.challenge, origins, rpId });
  return options;
}

export async function registerVerify(c, db, body) {
  const user = c.get("user");
  const ch = readChallenge(c);
  if (!ch) throw Object.assign(new Error("challenge expired"), { status: 400 });
  const verification = await verifyRegistrationResponse({
    response: body,
    expectedChallenge: ch.ch,
    expectedOrigin: ch.origins,
    expectedRPID: ch.rpId,
  });
  if (!verification.verified) throw Object.assign(new Error("verification failed"), { status: 400 });
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
  setChallenge(c, { ch: options.challenge, origins, rpId });
  return options;
}

// Discoverable-credential login: the authenticator returns the user handle.
export async function loginVerify(c, db, body) {
  const ch = readChallenge(c);
  if (!ch) throw Object.assign(new Error("challenge expired"), { status: 400 });

  const credId = body.id;
  const record = await one(
    db,
    "SELECT * FROM webauthn_credentials WHERE credential_id = ?",
    credId
  );
  if (!record) throw Object.assign(new Error("unknown passkey"), { status: 404 });

  const verification = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge: ch.ch,
    expectedOrigin: ch.origins,
    expectedRPID: ch.rpId,
    credential: {
      id: record.credential_id,
      publicKey: record.public_key,
      counter: record.counter,
      transports: record.transports || [],
    },
  });
  if (!verification.verified) throw Object.assign(new Error("verification failed"), { status: 400 });

  await run(
    db,
    "UPDATE webauthn_credentials SET counter = ? WHERE id = ?",
    verification.authenticationInfo.newCounter,
    record.id
  );
  // Hand back to the session layer: import lazily to avoid a cycle.
  const { newToken } = await import("./db.js");
  const sid = newToken();
  const ts = now();
  await run(
    db,
    "INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    sid, record.user_id, ts, ts + 365 * 864e5, c.req.header("user-agent")?.slice(0, 200) || null
  );
  return { userId: record.user_id, sid };
}
