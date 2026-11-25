// Fixes for the problems the 2026-11-25 rederive of the code found:
// a broadcast that fails part-way never mails anyone twice; a guest who connected (stub profile) is not kept for
// ever; expired email sign-in codes are purged daily; admin token tries are counted before they are checked;
// TOTP secrets are never stored in plain text; the admin can read abuse reports.
// Run: node test/rederive-fixes.mjs
import { makeEnv, check, summary, withLatency } from "./harness.mjs";
import { purgeExpired } from "../worker/purge.js";
import { hotp, unbase32, base32 } from "../worker/totp.js";

const DAY = 86400e3;
const ADMIN = { authorization: "Bearer test-admin-token" };

async function signup(client, name, ip) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0].cardId };
}

/* ------------------------------ broadcasts ------------------------------ */
{
  console.log("\n# A broadcast that fails part-way mails nobody twice");
  const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
  const { client, q1, env } = T;
  const sql = (s, ...p) => env.DB.raw.prepare(s).run(...p);
  for (let i = 0; i < 150; i++) {
    const id = (0x1000000000 + i).toString(16).slice(-10);
    sql("INSERT INTO users (id, created_at, is_guest, recovery_email, email_verified, marketing_optin) VALUES (?, ?, 0, ?, 1, 1)", id, Date.now(), `news${i}@example.com`);
  }
  // A batch (100) is pushed one message at a time; this outbox refuses once it holds `failAt` messages, so the
  // batch that would go past it is refused before any of it is recorded, as Resend refuses a whole batch.
  class Flaky extends Array { push(...m) { if (this.length >= this.failAt) throw new Error("Resend batch 500"); return super.push(...m); } }
  const outbox = new Flaky();
  env.MAIL_OUTBOX = outbox;
  const admin = client({ ip: "198.51.100.50" });
  const body = { subject: "News", body: "Hello" };

  // The first batch of 100 goes; the second fails.
  outbox.failAt = 100;
  const first = await admin.post("/api/admin/broadcast", body, ADMIN);
  check("a send that fails part-way says so, with the broadcast id and how many went", first.status === 502 && first.json.id && first.json.sent === 100, first.json);
  const id = first.json.id;
  check("the failed batch's claims are given back (only the 100 sent are recorded)", q1("SELECT COUNT(*) n FROM broadcast_sends WHERE broadcast_id = ?", id).n === 100);
  outbox.failAt = Infinity;
  const again = await admin.post("/api/admin/broadcast", { ...body, id }, ADMIN);
  check("pressing Send again with the id sends only the 50 left", again.status === 200 && again.json.sent === 50 && again.json.remaining === 0, again.json);
  const to = outbox.map((m) => m.to[0]);
  check("everyone got it exactly once", to.length === 150 && new Set(to).size === 150, { n: to.length, unique: new Set(to).size });
  const third = await admin.post("/api/admin/broadcast", { ...body, id }, ADMIN);
  check("a third press sends nothing", third.status === 200 && third.json.sent === 0 && outbox.length === 150);

  console.log("\n# Two presses at the same moment mail each person once");
  outbox.length = 0;
  outbox.failAt = 0;
  const start = await admin.post("/api/admin/broadcast", { subject: "Second", body: "Again" }, ADMIN);
  check("a send that fails at once records nobody", start.status === 502 && start.json.sent === 0 && q1("SELECT COUNT(*) n FROM broadcast_sends WHERE broadcast_id = ?", start.json.id).n === 0, start.json);
  outbox.failAt = Infinity;
  env.DB = withLatency(env.DB);
  const [p1, p2] = await Promise.all([
    admin.post("/api/admin/broadcast", { subject: "Second", body: "Again", id: start.json.id }, ADMIN),
    admin.post("/api/admin/broadcast", { subject: "Second", body: "Again", id: start.json.id }, ADMIN),
  ]);
  const to2 = outbox.map((m) => m.to[0]);
  check("both presses succeed and between them send to 150", p1.status === 200 && p2.status === 200 && p1.json.sent + p2.json.sent === 150, [p1.json, p2.json]);
  check("nobody is mailed twice", to2.length === 150 && new Set(to2).size === 150, { n: to2.length, unique: new Set(to2).size });
}

/* ------------------------------- retention ------------------------------ */
{
  console.log("\n# A guest who connected is not kept for ever");
  const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
  const { client, q1, env } = T;
  const sql = (s, ...p) => env.DB.raw.prepare(s).run(...p);
  const A = await signup(client, "Alice", "10.1.0.1");
  const guestConnect = async (name, ip) => {
    const g = client({ ip });
    const r = await g.post("/api/connect", { cardId: A.card, name, email: `${name.toLowerCase()}@example.com`, acceptTerms: true, over18: true });
    if (r.status !== 200) throw new Error(r.text);
    return (await g.get("/api/me")).json.user.id;
  };
  const old = await guestConnect("Gus", "10.1.0.2");
  const recent = await guestConnect("Gwen", "10.1.0.3");
  check("connecting as a new person makes a guest with a stub profile", q1("SELECT is_guest g FROM users WHERE id = ?", old).g === 1 && q1("SELECT 1 x FROM profiles WHERE user_id = ?", old));
  const ts = Date.now();
  sql("UPDATE users SET last_seen_at = ? WHERE id = ?", ts - 731 * DAY, old);
  sql("UPDATE users SET last_seen_at = ? WHERE id = ?", ts - 700 * DAY, recent);
  const mailedBefore = env.MAIL_OUTBOX.length; // the confirm emails both guests got when they connected
  const out = await purgeExpired(env, ts);
  check("a guest with a profile unused for 24 months is erased (no email to warn)", !q1("SELECT 1 x FROM users WHERE id = ?", old) && out.inactiveDeleted >= 1, out);
  check("their connection goes with them", !q1("SELECT 1 x FROM connections WHERE user_a = ? OR user_b = ?", old, old));
  check("a guest used within 24 months stays", !!q1("SELECT 1 x FROM users WHERE id = ?", recent));
  check("the card owner stays", !!q1("SELECT 1 x FROM users WHERE id = ?", A.id));
  check("the clean-up emails no guest (an unconfirmed address gets no warning)", !env.MAIL_OUTBOX.slice(mailedBefore).some((m) => /gwen|gus/.test(m.to[0])));

  console.log("\n# Expired email sign-in codes are purged daily");
  sql("INSERT INTO email_codes (email, purpose, user_id, code_hash, attempts, created_at, expires_at) VALUES ('old@example.com', 'signin', '', 'x', 0, ?, ?)", ts - DAY, ts - 1);
  sql("INSERT INTO email_codes (email, purpose, user_id, code_hash, attempts, created_at, expires_at) VALUES ('live@example.com', 'signin', '', 'y', 0, ?, ?)", ts, ts + 600e3);
  await purgeExpired(env, ts);
  check("an expired code is deleted", !q1("SELECT 1 x FROM email_codes WHERE email = 'old@example.com'"));
  check("a live code is kept", !!q1("SELECT 1 x FROM email_codes WHERE email = 'live@example.com'"));
}

/* ------------------------------ admin token ----------------------------- */
{
  console.log("\n# Admin token tries are counted before they are checked");
  const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
  const { client, q1, env } = T;
  env.DB = withLatency(env.DB);
  const bad = client({ ip: "198.51.100.60" });
  const res = await Promise.all(Array.from({ length: 30 }, () => bad.get("/api/admin/queue", { authorization: "Bearer wrong" })));
  const checked = res.filter((r) => r.status === 401).length;
  check("30 wrong tokens at once: at most 10 are compared, the rest refused", checked <= 10 && res.filter((r) => r.status === 429).length === 30 - checked, { checked });
  check("then even the right token waits", (await bad.get("/api/admin/queue", ADMIN)).status === 429);
  const good = client({ ip: "198.51.100.61" });
  const ok = await Promise.all(Array.from({ length: 8 }, () => good.get("/api/admin/queue", ADMIN)));
  check("the right token works, eight at once (as the Admin page loads)", ok.every((r) => r.status === 200), ok.map((r) => r.status));
  check("right tokens give their tries back", (q1("SELECT count FROM rate_limits WHERE key = 'adm:198.51.100.61'")?.count ?? 0) === 0);
}

/* --------------------------------- TOTP --------------------------------- */
{
  console.log("\n# TOTP secrets are never stored in plain text");
  const N = await makeEnv({});
  const nu = await signup(N.client, "Nia", "10.2.0.1");
  const refused = await nu.c.post("/api/auth/totp/setup");
  check("with no TOTP_KEY, setup is refused with plain words", refused.status === 503 && /isn't available/.test(refused.json?.error || ""), refused.json);
  check("and nothing is stored", N.q1("SELECT COUNT(*) n FROM totp_secrets").n === 0);

  const K = await makeEnv({ TOTP_KEY: "test-totp-key-0123456789" });
  const ku = await signup(K.client, "Kai", "10.2.0.2");
  const setup = await ku.c.post("/api/auth/totp/setup");
  check("with TOTP_KEY, setup works and the secret is sealed", setup.status === 200 && K.q1("SELECT secret s FROM totp_secrets WHERE user_id = ?", ku.id).s.startsWith("v1:"));

  // A secret stored in plain text before this fix still signs in, and is sealed when it does.
  const lu = await signup(K.client, "Lee", "10.2.0.3");
  const plain = base32(crypto.getRandomValues(new Uint8Array(20)));
  K.env.DB.raw.prepare("INSERT INTO totp_secrets (user_id, secret, confirmed, last_step, created_at) VALUES (?, ?, 1, 0, ?)").run(lu.id, plain, Date.now());
  K.env.DB.raw.prepare("UPDATE users SET has_totp = 1 WHERE id = ?").run(lu.id);
  const step = Math.floor(Date.now() / 30000);
  const r1 = await K.client({ ip: "10.2.0.9" }).post("/api/auth/totp/redeem", { id: lu.id, code: await hotp(unbase32(plain), step) });
  check("an old plain-text secret still signs in", r1.status === 200, r1.json);
  check("and is sealed by that sign-in", K.q1("SELECT secret s FROM totp_secrets WHERE user_id = ?", lu.id).s.startsWith("v1:"));
  const r2 = await K.client({ ip: "10.2.0.10" }).post("/api/auth/totp/redeem", { id: lu.id, code: await hotp(unbase32(plain), step + 1) });
  check("the sealed secret signs in with the next code", r2.status === 200, r2.json);
}

/* -------------------------------- reports ------------------------------- */
{
  console.log("\n# The admin can read abuse reports");
  const T = await makeEnv({ ADMIN_TOKEN: "test-admin-token" });
  const { client } = T;
  const A = await signup(client, "Ana", "10.3.0.1");
  const B = await signup(client, "Ben", "10.3.0.2");
  const C = await signup(client, "Cal", "10.3.0.3");
  const ab = await B.c.post("/api/connect", { cardId: A.card });
  const ac = await C.c.post("/api/connect", { cardId: A.card });
  await B.c.post(`/api/connections/${ab.json.connectionId}/report`, { reason: "Kept messaging after I said no." });
  await C.c.post(`/api/connections/${ac.json.connectionId}/report`, { reason: "Rude at the event." });
  const admin = client({ ip: "198.51.100.70" });
  check("without the token, reports are refused", (await admin.get("/api/admin/reports")).status === 401);
  const r = await admin.get("/api/admin/reports", ADMIN);
  const list = r.json?.reports || [];
  check("with it, both reports come back, newest first", r.status === 200 && list.length === 2 && list[0].reason === "Rude at the event.", r.json);
  check("each names who was reported, by whom, and how many reports they have", list.every((x) => x.target.id === A.id && x.target.name === "Ana" && x.target.reports === 2) && list[0].reporter.name === "Cal");
  check("reading them is in the admin audit log", !!T.q1("SELECT 1 x FROM admin_audit WHERE action = 'GET /api/admin/reports'"));
}

summary();
