// Host accounts (F10): their own sessions, cookie and email-code sign-in,
// completely apart from attendee accounts (worker/session.js).
//
// - The host portal lives on its own address (host.<domain>). /api/host/* is
//   served only there; the main site refuses it, and the host site refuses the
//   attendee API (see index.js).
// - Cookie: "__Host-lanyard_host" on https ("lanyard_host" on plain-http local
//   dev). No Domain attribute, so the browser keeps it to the host site; the
//   __Host- prefix also stops the main site from setting one for it. The
//   attendee cookie (lanyard_session) is never read here.
// - SameSite=Lax does not separate lanyd.fyi from host.lanyd.fyi (they are the
//   same "site"), so every host API call must come from the host origin itself:
//   Origin and Sec-Fetch-Site are checked on reads as well as writes.
// - Sign-in: a 6-digit code to the email, stored hashed, 10 minutes, 5 tries,
//   single use. A new email gets an account when its code is entered. Replies
//   are the same whether or not an account exists.
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { newId, newToken, now, one, all, run } from "./db.js";
import { HttpError, sha256Hex } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";
import { isThrottled, recordMiss } from "./codes.js";
import { sendMail, hostCodeEmail } from "./mail.js";
import { TERMS_VERSION } from "./legal.js";

export const HOST_SESSION_MS = 30 * 24 * 3600 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_TRIES = 5;
export const CODES_PER_EMAIL_PER_HOUR = 5;
export const CODES_PER_IP_PER_HOUR = 20;

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const isSecure = (c) => c.req.url.startsWith("https://");
export const hostCookieName = (c) => (isSecure(c) ? "__Host-lanyard_host" : "lanyard_host");

/** True when this request was made to the host site (host.<domain>). */
export const isHostSite = (c) => new URL(c.req.url).hostname.startsWith("host.");

/** The host portal's public address, for links in emails. */
export function hostOrigin(env, c) {
  if (env.HOST_ORIGIN) return String(env.HOST_ORIGIN).replace(/\/$/, "");
  if (c && isHostSite(c)) return new URL(c.req.url).origin;
  const main = c ? new URL(c.req.url) : new URL(String(env.APP_ORIGIN || "https://lanyd.fyi").split(",")[0].trim());
  return `${main.protocol}//host.${main.host}`;
}

export const normHostEmail = (raw) => String(raw || "").trim().toLowerCase();
export const validHostEmail = (e) => e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/**
 * Middleware for /api/host/*: only on the host site, only from the host site's
 * own pages, then loads the host account (if any) from the host cookie.
 */
export async function hostGuard(c, next) {
  if (!isHostSite(c)) {
    return c.json({ error: "The host portal has its own address.", code: "wrong_site" }, 403);
  }
  const own = new URL(c.req.url).origin;
  const origin = c.req.header("origin");
  const site = c.req.header("sec-fetch-site");
  const write = !SAFE.has(c.req.method);
  // Another origin (the main site included) never gets in. A typed address
  // ("none") is fine for a read such as the CSV download; writes need Origin.
  if ((origin && origin !== own)
      || (site && site !== "same-origin" && !(site === "none" && !write))
      || (write && !origin)) {
    return c.json({ error: "Cross-site request blocked.", code: "bad_origin" }, 403);
  }
  await loadHost(c);
  await next();
}

async function loadHost(c) {
  c.set("host", null);
  const token = getCookie(c, hostCookieName(c));
  if (!token || !/^[0-9a-f]{32}$/.test(token)) return;
  const sid = await sha256Hex(token);
  const row = await one(c.env.DB,
    `SELECT s.id AS sid, a.* FROM host_sessions s JOIN host_accounts a ON a.id = s.host_account_id
      WHERE s.id = ? AND s.expires_at > ? AND a.status = 'active' AND a.deleted_at IS NULL`, sid, now());
  if (!row) return;
  c.set("hostSessionId", sid);
  delete row.sid;
  c.set("host", row);
}

/** The signed-in host account, or a 401. */
export function requireHost(c) {
  const h = c.get("host");
  if (!h) throw new HttpError(401, "Sign in to the host portal.", "signed_out");
  return h;
}

/** Where a signed-in account is in setup: details, terms, org or ready (org is decided by the caller). */
export function setupStep(account) {
  if (!account.full_name || !account.use_case || !account.event_frequency) return "details";
  if (account.terms_version !== TERMS_VERSION) return "terms";
  return null;
}

async function createHostSession(c, accountId) {
  const token = newToken();
  const sid = await sha256Hex(token);
  const ts = now();
  // A sign-in on a browser that was already signed in replaces that session.
  const old = c.get("hostSessionId");
  if (old) await run(c.env.DB, "DELETE FROM host_sessions WHERE id = ?", old);
  await run(c.env.DB,
    "INSERT INTO host_sessions (id, host_account_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
    sid, accountId, ts, ts + HOST_SESSION_MS, c.req.header("user-agent")?.slice(0, 200) || null);
  setCookie(c, hostCookieName(c), token, {
    httpOnly: true, secure: isSecure(c), sameSite: "Strict", path: "/", maxAge: HOST_SESSION_MS / 1000,
  });
  c.set("hostSessionId", sid);
}

export async function endHostSession(c) {
  const sid = c.get("hostSessionId");
  if (sid) await run(c.env.DB, "DELETE FROM host_sessions WHERE id = ?", sid);
  deleteCookie(c, hostCookieName(c), { path: "/", secure: isSecure(c) });
}

// The pepper keeps a stolen copy of host_login_codes from being brute-forced
// offline (a 6-digit code has only a million values).
const codeHash = (env, email, code) => sha256Hex(`host-login:${env.TOTP_KEY || env.ADMIN_TOKEN || ""}:${email}:${code}`);
const sixDigits = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
const ipOf = (c) => c.req.header("cf-connecting-ip") || "local";

const SENT = { ok: true, message: "If that address can get a code, it is on its way. It works for 10 minutes." };
const BAD_CODE = { error: "That code isn't right or has expired. Check the latest email, or ask for a new code.", code: "bad_code" };

/** POST /api/host/auth/start {email}: email a code. The reply never says whether an account exists. */
export async function startSignIn(c) {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const email = normHostEmail(b.email);
  if (!validHostEmail(email)) return c.json({ error: "That email doesn't look right.", code: "bad_email" }, 400);
  if ((await bump(db, `hmail:ip:${ipOf(c)}`, HOUR)) > CODES_PER_IP_PER_HOUR
      || (await bump(db, `hmail:e:${email}`, HOUR)) > CODES_PER_EMAIL_PER_HOUR) {
    return c.json({ error: "Too many codes asked for. Wait an hour and try again.", code: "throttled" }, 429);
  }
  const ts = now();
  const code = sixDigits();
  await run(db, "DELETE FROM host_login_codes WHERE expires_at < ?", ts);
  await run(db,
    `INSERT INTO host_login_codes (email, code_hash, attempts, created_at, expires_at, used_at) VALUES (?, ?, 0, ?, ?, NULL)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, created_at = excluded.created_at,
       expires_at = excluded.expires_at, used_at = NULL`,
    email, await codeHash(c.env, email, code), ts, ts + CODE_TTL_MS);
  // Disabled accounts get no mail, but the reply is the same.
  const acct = await one(db, "SELECT status FROM host_accounts WHERE email = ?", email);
  if (!acct || acct.status === "active") {
    await sendMail(c.env, "decisions", { to: email, ...hostCodeEmail(code, hostOrigin(c.env, c)) }).catch((e) => console.error(e));
  }
  return c.json(SENT);
}

/** POST /api/host/auth/verify {email, code}: signs in, creating the account the first time. */
export async function verifySignIn(c) {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const email = normHostEmail(b.email);
  const code = String(b.code || "").replace(/\s/g, "");
  const keys = [`hauth:ip:${ipOf(c)}`, `hauth:e:${email.slice(0, 120)}`];
  if (await isThrottled(db, keys)) return c.json({ error: "Too many wrong tries. Wait a few minutes and try again.", code: "throttled" }, 429);
  const ts = now();
  const row = validHostEmail(email) && /^\d{6}$/.test(code)
    ? await one(db, "SELECT * FROM host_login_codes WHERE email = ? AND expires_at > ? AND used_at IS NULL", email, ts)
    : null;
  if (!row || row.attempts >= CODE_TRIES || row.code_hash !== await codeHash(c.env, email, code)) {
    if (row) await run(db, "UPDATE host_login_codes SET attempts = attempts + 1 WHERE email = ?", email);
    await recordMiss(db, keys);
    return c.json(BAD_CODE, 400);
  }
  // Single use, even if two requests race.
  const used = await run(db, "UPDATE host_login_codes SET used_at = ? WHERE email = ? AND used_at IS NULL AND attempts < ?", ts, email, CODE_TRIES);
  if (used.meta?.changes !== 1) return c.json(BAD_CODE, 400);

  let acct = await one(db, "SELECT * FROM host_accounts WHERE email = ?", email);
  if (acct && (acct.status !== "active" || acct.deleted_at)) return c.json(BAD_CODE, 400);
  if (!acct) {
    const id = newId();
    await run(db, "INSERT INTO host_accounts (id, email, email_verified_at, status, created_at) VALUES (?, ?, ?, 'active', ?)", id, email, ts, ts);
    acct = { id };
  }
  await run(db, "UPDATE host_accounts SET last_login_at = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", ts, ts, acct.id);
  await createHostSession(c, acct.id);
  return c.json({ ok: true });
}

// Signed-in devices on the host account. The page gets an opaque handle per
// session, never the stored id (itself the hash of the cookie).
const handleOf = async (sid) => (await sha256Hex(`host-session-handle:${sid}`)).slice(0, 16);
const describe = (ua = "") => {
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" on ") || "Unknown device";
};

export async function listHostSessions(c) {
  const me = requireHost(c);
  const rows = await all(c.env.DB,
    "SELECT id, created_at, expires_at, user_agent FROM host_sessions WHERE host_account_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20",
    me.id, now());
  return c.json({
    sessions: await Promise.all(rows.map(async (r) => ({
      id: await handleOf(r.id), current: r.id === c.get("hostSessionId"),
      device: describe(r.user_agent || ""), at: r.created_at, until: r.expires_at,
    }))),
  });
}

export async function signOutHostDevice(c) {
  const me = requireHost(c);
  const handle = c.req.param("id");
  const gone = () => c.json({ error: "That device is not signed in any more.", code: "not_found" }, 404);
  if (!/^[0-9a-f]{16}$/.test(handle || "")) return gone();
  const rows = await all(c.env.DB, "SELECT id FROM host_sessions WHERE host_account_id = ? AND expires_at > ? LIMIT 50", me.id, now());
  let target = null;
  for (const r of rows) if ((await handleOf(r.id)) === handle) { target = r.id; break; }
  if (!target) return gone();
  if (target === c.get("hostSessionId")) return c.json({ error: "That is this device. Use Sign out instead.", code: "this_device" }, 400);
  await run(c.env.DB, "DELETE FROM host_sessions WHERE id = ? AND host_account_id = ?", target, me.id);
  return c.json({ ok: true });
}

export async function signOutOtherHosts(c) {
  const me = requireHost(c);
  const r = await run(c.env.DB, "DELETE FROM host_sessions WHERE host_account_id = ? AND id != ?", me.id, c.get("hostSessionId") || "");
  return c.json({ ok: true, signedOut: r.meta?.changes || 0 });
}
