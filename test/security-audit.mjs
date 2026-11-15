// F35: the security audit against the owner's list of common attacks
// (Lanyard-Vault/03 Technical/Security Audit 2026-11-15.md). One section per gap that was
// fixed, each with the attack tried for real against the Worker, plus proofs for rows that
// were already safe but had no test of their own. Concurrent attacks use Promise.all, with
// every query given a turn of the event loop (withLatency below) as on the real Worker.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeEnv, check, summary, becomeHost, PNG } from "./harness.mjs";

const SECRETS = { ADMIN_TOKEN: "adm-audit-token", TOTP_KEY: "audit-totp-key-0123456789", DROP_KEY: "audit-drop-key-0123456789abcdef", RESEND_ACCOUNTS_KEY: "re_auditAccounts_0123456789", RESEND_DECISIONS_KEY: "re_auditDecisions_0123456789", CLAUDE_API_KEY: "sk-ant-audit-0123456789" };
const T = await makeEnv({ ...SECRETS });
const { q, q1, env } = T;
// Every response any client in this file gets is kept, to search for secrets at the end (row 16).
const responses = [];
const client = (opts) => {
  const c = T.client(opts);
  for (const m of ["get", "post", "put", "del"]) {
    const f = c[m];
    c[m] = async (...a) => { const r = await f(...a); responses.push(r.text + JSON.stringify([...r.headers])); return r; };
  }
  return c;
};

// Real D1 answers every query over the network, so two requests interleave at every query.
// The in-memory database answers at once, so a request that has read its body runs to the end
// before the next one moves, which would hide check-then-write races. Give every single query
// one turn of the event loop; a batch stays one transaction that runs alone, as in D1.
function withLatency(db) {
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    ...db,
    prepare(sql) {
      const inner = db.prepare(sql);
      const s = {
        inner,
        bind(...p) { inner.bind(...p); return s; },
        async first() { await tick(); return inner.first(); },
        async all() { await tick(); return inner.all(); },
        async run() { await tick(); return inner.run(); },
      };
      return s;
    },
    batch: (stmts) => db.batch(stmts.map((s) => s.inner || s)),
  };
}
env.DB = withLatency(env.DB);
const ADMIN = { authorization: "Bearer " + SECRETS.ADMIN_TOKEN };
const admin = client({ ip: "198.51.100.250" });
let ipN = 0;
const freshIp = () => `198.51.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}`;

/* ------------------------------------------------------------------------------------------ */
console.log("\n# Row 9/10: event credits cannot be spent twice by pressing Create at once (F35.2)");
{
  const h = client({ site: "host", ip: freshIp() });
  await becomeHost(h, { kind: "company", name: "Race Co" });
  const org = q1("SELECT o.id FROM orgs o WHERE o.name = 'Race Co'");
  const credits = () => q1("SELECT COALESCE(SUM(events_granted),0) g, COALESCE(SUM(events_used),0) u FROM credits WHERE org_id = ?", org.id);
  const events = () => q1("SELECT COUNT(*) n FROM events WHERE org_id = ?", org.id).n;
  check("a new company starts with 3 credits", credits().g === 3 && credits().u === 0, credits());
  const a = await h.post("/api/host/events", { name: "One" });
  const b = await h.post("/api/host/events", { name: "Two" });
  check("two events one after the other use two credits", a.status === 201 && b.status === 201 && credits().u === 2 && events() === 2);
  // One credit left: 20 presses at once.
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => h.post("/api/host/events", { name: `Burst ${i}` })));
  const made = burst.filter((r) => r.status === 201).length;
  check("20 Create presses at once with one credit left make exactly one event", made === 1 && events() === 3, { made, events: events() });
  check("…every other press is told there are no credits (402), not a server error", burst.filter((r) => r.status !== 201).every((r) => r.status === 402 && r.json.code === "no_credits"), burst.map((r) => r.status));
  check("…and exactly 3 credits are used, never more than were granted", credits().u === 3, credits());
  // Duplicate takes the same path.
  const src = q1("SELECT id FROM events WHERE org_id = ? ORDER BY created_at LIMIT 1", org.id).id;
  const dup = await Promise.all(Array.from({ length: 10 }, () => h.post(`/api/host/events/${src}/duplicate`, {})));
  check("10 Duplicate presses at once with no credits make nothing", dup.every((r) => r.status === 402) && events() === 3, dup.map((r) => r.status));
  // Credits granted again: 10 presses with 2 credits give exactly 2 events.
  env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES ('audit-2', ?, 2, 0, NULL, 'test', 'test', ?)").run(org.id, Date.now());
  const two = await Promise.all(Array.from({ length: 10 }, (_, i) => h.post("/api/host/events", { name: `Pair ${i}` })));
  check("10 presses at once with 2 credits make exactly 2 events and use both", two.filter((r) => r.status === 201).length === 2 && events() === 5 && credits().u === 5, { made: two.filter((r) => r.status === 201).length, credits: credits() });
  check("no event exists without a credit behind it", events() === credits().u);

  // A society's free weekly event: 10 presses at once give one free event, the rest need a credit.
  const s = client({ site: "host", ip: freshIp() });
  await becomeHost(s, { email: "lead@campus.ac.uk", kind: "society", name: "Race Soc", extra: { leaderName: "Lead Person", orgLink: "https://example.org/soc", university: "Example Campus" } });
  const soc = q1("SELECT id FROM orgs WHERE name = 'Race Soc'");
  await admin.post(`/api/admin/orgs/${soc.id}/review`, { decision: "approve" }, ADMIN);
  const free = await Promise.all(Array.from({ length: 10 }, (_, i) => s.post("/api/host/events", { name: `Free ${i}` })));
  const socEvents = q1("SELECT COUNT(*) n FROM events WHERE org_id = ?", soc.id).n;
  check("10 presses at once for a society's one free event this week make exactly one", free.filter((r) => r.status === 201).length === 1 && socEvents === 1, { made: free.filter((r) => r.status === 201).length, socEvents });
  check("…the others are told the free event is used (402)", free.filter((r) => r.status !== 201).every((r) => r.status === 402 && r.json.code === "no_credits"));
  env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES ('audit-soc', ?, 1, 0, NULL, 'test', 'test', ?)").run(soc.id, Date.now());
  const paid = await Promise.all(Array.from({ length: 6 }, (_, i) => s.post("/api/host/events", { name: `Paid ${i}` })));
  const socCredit = q1("SELECT events_used u FROM credits WHERE id = 'audit-soc'").u;
  check("the free event used no credit, and with 1 credit, 6 presses at once make one more event and spend it",
    paid.filter((r) => r.status === 201).length === 1 && socCredit === 1 && q1("SELECT COUNT(*) n FROM events WHERE org_id = ?", soc.id).n === 2, { made: paid.filter((r) => r.status === 201).length, socCredit });
}

/* ------------------------------------------------------------------------------------------ */
async function person(name, { ip = freshIp() } = {}) {
  const c = client({ ip });
  await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  const id = (await c.get("/api/me")).json.user.id;
  return { c, id };
}
const others = (n, site = "main") => Array.from({ length: n }, () => client({ site, ip: freshIp() }));
const wrongFor = (code) => (i) => String((Number(code) + 1 + i) % 1e6).padStart(6, "0");

console.log("\n# Row 11: codes guessed all at once are still limited (F35.3)");
{
  // Attendee email sign-in: 5 tries per code, whatever the timing. Each guess comes from its own IP.
  const p = await person("Eve");
  env.DB.raw.prepare("UPDATE users SET recovery_email = 'eve@uni.test', email_verified = 1 WHERE id = ?").run(p.id);
  await client({ ip: freshIp() }).post("/api/auth/email/start", { email: "eve@uni.test" });
  const code = env.MAIL_OUTBOX.at(-1).text.match(/code is (\d{6})/)[1];
  const wrong = wrongFor(code);
  const res = await Promise.all(others(30).map((c, i) => c.post("/api/auth/email/verify", { email: "eve@uni.test", code: i === 29 ? code : wrong(i) })));
  check("email code: 29 wrong guesses and the right one sent at once do not sign in", res[29].status !== 200 && res.every((r) => r.status !== 200), res.map((r) => r.status).join());
  check("…the code took 5 tries and no more", q1("SELECT attempts FROM email_codes WHERE email = 'eve@uni.test'").attempts === 5);
  check("…and the right code is refused afterwards too", (await client({ ip: freshIp() }).post("/api/auth/email/verify", { email: "eve@uni.test", code })).status !== 200);
  // A fresh code with 4 wrong first still works on the 5th try (the burst above filled the per-address counter).
  env.DB.raw.prepare("DELETE FROM rate_limits WHERE key = 'auth:email:eve@uni.test'").run();
  await client({ ip: freshIp() }).post("/api/auth/email/start", { email: "eve@uni.test" });
  const code2 = env.MAIL_OUTBOX.at(-1).text.match(/code is (\d{6})/)[1];
  for (let i = 0; i < 4; i++) await client({ ip: freshIp() }).post("/api/auth/email/verify", { email: "eve@uni.test", code: wrongFor(code2)(i) });
  check("4 wrong tries and then the right code: signed in (the limit is 5, not fewer)", (await client({ ip: freshIp() }).post("/api/auth/email/verify", { email: "eve@uni.test", code: code2 })).status === 200);
  // The per-email counter: 10 wrong in 10 minutes, even spread over fresh codes and IPs.
  await client({ ip: freshIp() }).post("/api/auth/email/start", { email: "eve@uni.test" });
  const code3 = env.MAIL_OUTBOX.at(-1).text.match(/code is (\d{6})/)[1];
  env.DB.raw.prepare("UPDATE rate_limits SET count = 10 WHERE key = 'auth:email:eve@uni.test'").run();
  check("after 10 wrong guesses for one address, even the right code is refused (429)", (await client({ ip: freshIp() }).post("/api/auth/email/verify", { email: "eve@uni.test", code: code3 })).status === 429);

  // Adding an email: the same 5 tries, at once.
  const q2 = await person("Quinn");
  await q2.c.post("/api/account/email", { email: "quinn@uni.test" });
  const add = env.MAIL_OUTBOX.at(-1).text.match(/code is (\d{6})/)[1];
  const tries = await Promise.all(Array.from({ length: 12 }, (_, i) => q2.c.post("/api/account/email/confirm", { email: "quinn@uni.test", code: i === 11 ? add : wrongFor(add)(i) })));
  check("add-an-email code: 11 wrong and the right one at once do not confirm it", tries.every((r) => r.status !== 200) && !q1("SELECT email_verified v FROM users WHERE id = ?", q2.id).v, tries.map((r) => r.status).join());

  // Authenticator: 10 wrong guesses per account in 10 minutes, at once, from 40 IPs.
  const { hotp, unbase32 } = await import("../worker/totp.js");
  const a = await person("Tom");
  const setup = await a.c.post("/api/auth/totp/setup");
  const step = Math.floor(Date.now() / 30000);
  await a.c.post("/api/auth/totp/confirm", { code: await hotp(unbase32(setup.json.secret), step) });
  const right = await hotp(unbase32(setup.json.secret), step + 1);
  const burst = await Promise.all(others(40).map((c, i) => c.post("/api/auth/totp/redeem", { id: a.id, code: i === 39 ? right : String(100000 + i) })));
  check("authenticator: 39 wrong codes and the right one sent at once do not sign in", burst.every((r) => r.status !== 200), burst.map((r) => r.status).join());
  check("…at most 10 were checked; the rest were told to wait (429)", burst.filter((r) => r.status === 404).length <= 10 && burst.filter((r) => r.status === 429).length >= 30, [burst.filter((r) => r.status === 404).length, burst.filter((r) => r.status === 429).length]);
  check("…and a right code alone is refused while the account is locked", (await client({ ip: freshIp() }).post("/api/auth/totp/redeem", { id: a.id, code: await hotp(unbase32(setup.json.secret), step + 2) })).status === 429);

  // Host portal email code: 5 tries per code (it was already safe; proved here at once).
  const h0 = client({ site: "host", ip: freshIp() });
  await h0.post("/api/host/auth/start", { email: "boss@firm.example.com" });
  const hcode = env.MAIL_OUTBOX.at(-1).text.match(/code is (\d{6})/)[1];
  const hres = await Promise.all(others(30, "host").map((c, i) => c.post("/api/host/auth/verify", { email: "boss@firm.example.com", code: i === 29 ? hcode : wrongFor(hcode)(i) })));
  check("host code: 29 wrong and the right one at once do not sign in", hres.every((r) => r.status !== 200), hres.map((r) => r.status).join());
  check("…and the host code took 5 tries", q1("SELECT attempts FROM host_login_codes WHERE email = 'boss@firm.example.com'").attempts === 5);

  // The shared wrong-guess counter (sign-in link codes, recovery keys, card codes): 10 per IP.
  const one = client({ ip: "203.0.113.77" });
  const link = await Promise.all(Array.from({ length: 25 }, (_, i) => one.post("/api/auth/redeem", { code: `ZZZZ${String(1000 + i).slice(-4).replace(/[01]/g, "Z")}` })));
  check("25 sign-in link codes at once from one IP: at most 10 are checked", link.filter((r) => r.status === 404).length <= 10 && link.filter((r) => r.status === 429).length >= 15, link.map((r) => r.status).join());
  const card = client({ ip: "203.0.113.78" });
  const looks = await Promise.all(Array.from({ length: 25 }, (_, i) => card.get(`/api/code/QQ${String.fromCharCode(65 + i)}9`)));
  check("25 card codes at once from one IP: at most 10 are checked", looks.filter((r) => r.status === 404).length <= 10 && looks.filter((r) => r.status === 429).length >= 15, looks.map((r) => r.status).join());
  // A right guess does not count as a wrong one.
  const owner = await person("Rita", { ip: "203.0.113.79" });
  const myCode = (await owner.c.get("/api/me")).json.cards[0].code;
  const ok = [];
  for (let i = 0; i < 15; i++) ok.push((await client({ ip: "203.0.113.80" }).get(`/api/code/${myCode}`)).status);
  check("15 right card codes in a row from one IP are all answered (right guesses are handed back)", ok.every((s) => s === 200), ok.join());
  check("a signed-out visitor on another IP is not locked out by someone else's wrong guesses", (await client({ ip: "203.0.113.81" }).get(`/api/code/${myCode}`)).status === 200);
}

/* ------------------------------------------------------------------------------------------ */
console.log("\n# Row 15: event join codes cannot be found by guessing (F35.4)");
{
  const h = client({ site: "host", ip: freshIp() });
  await becomeHost(h, { kind: "company", name: "Guess Co" });
  const ev = await h.post("/api/host/events", { name: "Open evening" });
  const code = ev.json.code;
  const g = client({ ip: "203.0.113.90" });
  const seen = [];
  for (let i = 0; i < 30; i++) seen.push((await g.get(`/api/e/ZZ${String.fromCharCode(65 + (i % 26))}${i % 10}Q`)).status);
  check("30 wrong event codes from one IP are each a plain 404", seen.every((s) => s === 404), seen.join());
  const blocked = await g.get(`/api/e/${code}`);
  check("the 31st lookup from that IP is refused (429), even for a real code", blocked.status === 429 && blocked.json.code === "throttled", blocked.json);
  const checkin = await g.post(`/api/e/${code}/checkin`, { name: "Guesser", acceptTerms: true, over18: true });
  check("…and so is checking in from it", checkin.status === 429 && !q1("SELECT 1 x FROM checkins c JOIN events e ON e.id = c.event_id WHERE e.code = ?", code));
  const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => client({ ip: "203.0.113.91" }).get(`/api/e/QQ${String.fromCharCode(65 + (i % 26))}${i % 10}Z`)));
  check("40 wrong codes at once from one IP: at most 30 are looked up", burst.filter((r) => r.status === 404).length <= 30 && burst.filter((r) => r.status === 429).length >= 10, burst.map((r) => r.status).join());
  const venue = client({ ip: "203.0.113.92" });
  const fine = [];
  for (let i = 0; i < 40; i++) fine.push((await venue.get(`/api/e/${code}`)).status);
  check("40 people on one venue connection opening the real code are all answered", fine.every((s) => s === 200));
  const other = client({ ip: "203.0.113.93" });
  check("another IP is not affected, and checks in", (await other.get(`/api/e/${code}`)).status === 200
    && (await other.post(`/api/e/${code}/checkin`, { name: "Real Guest", acceptTerms: true, over18: true })).status === 200);
}

/* ------------------------------------------------------------------------------------------ */
console.log("\n# Row 9: limits and one-time codes hold when pressed at once (F35.5)");
{
  // The Free card limit (3) is a Plus feature: 10 new cards at once.
  const p = await person("Cara");
  const made = await Promise.all(Array.from({ length: 10 }, (_, i) => p.c.post("/api/cards", { name: "Card " + i })));
  const n = q1("SELECT COUNT(*) n FROM cards WHERE user_id = ?", p.id).n;
  check("10 new cards at once leave a Free account at its 3 cards", n === 3 && made.filter((r) => r.status === 201).length === 2, { n, st: made.map((r) => r.status).join() });
  check("…the rest are told the Free limit (402 plan_limit)", made.filter((r) => r.status !== 201).every((r) => r.status === 402 && r.json.code === "plan_limit"));
  check("…and no card code is registered for a card that was not made", q1("SELECT COUNT(*) n FROM card_codes WHERE card_id NOT IN (SELECT id FROM cards)").n === 0);
  const cards = (await p.c.get("/api/me")).json.cards;
  check("…every card that was made has its own working code", cards.length === 3 && (await Promise.all(cards.map((k) => client({ ip: freshIp() }).get(`/api/code/${k.code}`)))).every((r) => r.status === 200 && cards.some((k) => k.cardId === r.json.cardId)));

  // A team invite seats one person, however many press Join with it at once.
  const o = client({ site: "host", ip: freshIp() });
  await becomeHost(o, { kind: "company", name: "Invite Co" });
  const inv = await o.post("/api/host/team/invite", {});
  const joiners = [];
  for (let i = 0; i < 6; i++) { const j = client({ site: "host", ip: freshIp() }); await becomeHost(j, { kind: "individual", fullName: `Joiner ${i}` }); joiners.push(j); }
  const orgsBefore = q1("SELECT COUNT(*) n FROM orgs").n;
  const joins = await Promise.all(joiners.map((j) => j.post("/api/host/team/join", { code: inv.json.code })));
  const org = q1("SELECT id FROM orgs WHERE name = 'Invite Co'").id;
  check("6 people joining with one invite at once: exactly one gets in", q1("SELECT COUNT(*) n FROM host_org_members WHERE org_id = ?", org).n === 2 && joins.filter((r) => r.status === 200).length === 1, joins.map((r) => r.status).join());
  check("…the others are told the invite is not valid (404) and keep their own organisation", joins.filter((r) => r.status !== 200).every((r) => r.status === 404) && q1("SELECT COUNT(*) n FROM orgs").n === orgsBefore - 1);
  check("…and the invite is used up", !q1("SELECT 1 x FROM host_org_invites WHERE org_id = ?", org));

  // The Plus poster code (FIRST50): 60 people at once, 50 get Plus. (Already one transaction; proved here.)
  const people = [];
  for (let i = 0; i < 60; i++) {
    const x = await person("Plus" + i);
    env.DB.raw.prepare("UPDATE users SET email_verified = 1, recovery_email = ? WHERE id = ?").run(`plus${i}@uni.test`, x.id);
    people.push(x);
  }
  const claims = await Promise.all(people.map((x) => x.c.post("/api/redeem/FIRST50")));
  const granted = claims.filter((r) => r.json?.mine?.granted).length;
  check("60 people pressing Redeem on FIRST50 at once: exactly 50 get Plus", granted === 50 && q1("SELECT uses FROM promo_codes WHERE code = 'FIRST50'").uses === 50
    && q1("SELECT COUNT(*) n FROM users WHERE plan = 'plus'").n === 50, { granted, uses: q1("SELECT uses FROM promo_codes WHERE code = 'FIRST50'").uses });
  check("…every one of the 60 has one place, the places are 1 to 60 with none twice", new Set(claims.map((r) => r.json?.mine?.position)).size === 60 && Math.max(...claims.map((r) => r.json?.mine?.position)) === 60);
  const twice = await Promise.all(Array.from({ length: 5 }, () => people[0].c.post("/api/redeem/FIRST50")));
  check("one person pressing 5 times at once still has one claim", twice.every((r) => r.status === 200) && q1("SELECT COUNT(*) n FROM promo_claims WHERE user_id = ?", people[0].id).n === 1);
}

/* ------------------------------------------------------------------------------------------ */
console.log("\n# Row 14: Lanyard cannot be used to fill someone's inbox (F35.6)");
{
  const mails = (to) => env.MAIL_OUTBOX.filter((m) => m.to[0] === to).length;
  const o = client({ site: "host", ip: freshIp() });
  await becomeHost(o, { kind: "company", name: "Spam Co" });
  const statuses = [];
  for (let i = 0; i < 25; i++) {
    const r = await o.post("/api/host/team/invite", { email: "victim@target.example.com" });
    statuses.push(r.status);
    if (r.json?.code) await o.del(`/api/host/team/invite/${r.json.code.replace("-", "")}`);
  }
  check("invite, cancel, invite again 25 times sends one address 3 emails", mails("victim@target.example.com") === 3, mails("victim@target.example.com"));
  check("…the 4th and later are a 429 and make no invite", statuses.slice(3).every((s) => s === 429) && !q1("SELECT 1 x FROM host_org_invites WHERE email = 'victim@target.example.com'"), statuses.join());
  for (let i = 0; i < 12; i++) await o.post("/api/host/team/invite", { email: `person${i}@target.example.com` }).then((r) => r.json?.code && o.del(`/api/host/team/invite/${r.json.code.replace("-", "")}`));
  const sentToMany = Array.from({ length: 12 }, (_, i) => mails(`person${i}@target.example.com`)).reduce((a, b) => a + b, 0);
  check("one organisation sends at most 10 invite emails a day in all", sentToMany + 3 <= 10, sentToMany);
  check("an invite without an email (a code to pass on) still works", (await o.post("/api/host/team/invite", {})).status === 201);

  // Transfer emails go to a host account; one organisation can send 5 a day, one account gets 3.
  const t = client({ site: "host", ip: freshIp() });
  await becomeHost(t, { kind: null, email: "taker@other.example.com", fullName: "Taker" });
  const takerBefore = mails("taker@other.example.com"); // their own sign-in code
  const tr = [];
  for (let i = 0; i < 8; i++) tr.push((await o.post("/api/host/transfer", { email: "taker@other.example.com" })).status);
  check("8 hand-over requests to one account send it 3 emails", mails("taker@other.example.com") - takerBefore === 3 && tr.slice(0, 3).every((s) => s === 201) && tr.slice(3).every((s) => s === 429), [mails("taker@other.example.com") - takerBefore, tr.join()]);

  // Privacy requests are always recorded, but one address gets at most 3 acknowledgements a day.
  const acks = [];
  for (let i = 0; i < 10; i++) acks.push((await client({ ip: freshIp() }).post("/api/privacy-request", { email: "victim2@target.example.com", message: "Please tell me what you hold.", kind: "access" })).json);
  check("10 privacy requests from 10 networks for one address: all are recorded", acks.every((j) => j.ok) && q1("SELECT COUNT(*) n FROM privacy_requests WHERE email = 'victim2@target.example.com'").n === 10);
  check("…but the address gets 3 acknowledgement emails, and the rest say not acknowledged", mails("victim2@target.example.com") === 3 && acks.filter((j) => j.acknowledged).length === 3, mails("victim2@target.example.com"));
}

/* ------------------------------------------------------------------------------------------ */
// (JSON has no NaN or Infinity: a browser sending them sends null, which is in the list.)
const BAD_NUMBERS = [0, -1, 1.5, 21, 1e9, "2", "NaN", [2], { n: 2 }, true, null];
console.log("\n# Row 10: numbers from the browser are refused, not bent into range (F35.7)");
{
  const o = client({ site: "host", ip: freshIp() });
  await becomeHost(o, { kind: "company", name: "Number Co" });
  const org = q1("SELECT id FROM orgs WHERE name = 'Number Co'").id;
  const st = [];
  for (const quantity of BAD_NUMBERS) st.push((await o.post("/api/host/billing/request", { sku: "standard_5", quantity, email: "pay@firm.example.com" })).status);
  check("an invoice request with quantity 0, -1, 1.5, 21, 1e9, \"2\", \"NaN\", [2], an object, true or null is 400", st.every((s) => s === 400), st.join());
  check("…and saves nothing", q1("SELECT COUNT(*) n FROM billing_requests WHERE org_id = ?", org).n === 0);
  const good = await o.post("/api/host/billing/request", { sku: "standard_5", quantity: 2, email: "pay@firm.example.com", amountPence: 1, pence: 1 });
  check("quantity 2 is saved at the server's price, whatever amount the browser sends (row 7)", good.status === 201 && good.json.amountPence === 9900
    && q1("SELECT amount_pence a, quantity n FROM billing_requests WHERE id = ?", good.json.id).a === 9900, good.json);
  check("left out, the quantity is 1", (await o.post("/api/host/billing/request", { sku: "standard_1", email: "pay@firm.example.com" })).json?.amountPence === 1250);

  const ev = (await o.post("/api/host/events", { name: "Counted", rsvpCount: 40 })).json;
  const rs = [];
  for (const rsvpCount of [-1, 1.5, 100001, "40", "NaN", [4], true, { n: 4 }]) rs.push((await o.put(`/api/host/events/${ev.id}`, { rsvpCount })).status);
  check("an RSVP count of -1, 1.5, 100001, \"40\", \"NaN\", [4], true or an object is 400", rs.every((s) => s === 400), rs.join());
  check("…and the saved count is unchanged", q1("SELECT rsvp_count n FROM events WHERE id = ?", ev.id).n === 40);
  check("empty clears it, and 0 is a real count", (await o.put(`/api/host/events/${ev.id}`, { rsvpCount: "" })).status === 200 && q1("SELECT rsvp_count n FROM events WHERE id = ?", ev.id).n === null
    && (await o.put(`/api/host/events/${ev.id}`, { rsvpCount: 0 })).status === 200 && q1("SELECT rsvp_count n FROM events WHERE id = ?", ev.id).n === 0);
  check("a new event with a bad RSVP count is refused and uses no credit", (await o.post("/api/host/events", { name: "Bad", rsvpCount: -5 })).status === 400
    && q1("SELECT COUNT(*) n FROM events WHERE org_id = ?", org).n === 1);

  // Feedback ratings: the default form has an overall rating (1 to 5).
  const a = await person("Rater");
  await a.c.post(`/api/e/${ev.code}/checkin`, {});
  await o.post(`/api/host/events/${ev.id}/end`, {});
  env.DB.raw.prepare("UPDATE events SET ended_at = ? WHERE id = ?").run(Date.now() - 3 * 3600e3, ev.id);
  env.DB.raw.prepare("UPDATE checkins SET created_at = ? WHERE event_id = ?").run(Date.now() - 4 * 3600e3, ev.id);
  const form = (await a.c.get(`/api/e/${ev.id}/feedback`)).json;
  const rating = form.questions.find((x) => x.type === "rating");
  check("the feedback form is open and has a rating question", form.status === "open" && !!rating, form.status);
  const fr = [];
  for (const v of [0, 6, -1, 2.5, "5", [5], true, 1e9]) fr.push((await a.c.post(`/api/e/${ev.id}/feedback`, { answers: { [rating.id]: v } })).status);
  check("a rating of 0, 6, -1, 2.5, \"5\", [5], true or 1e9 is 400", fr.every((s) => s === 400), fr.join());
  check("…and no answer is stored for any of them", q1("SELECT COUNT(*) n FROM feedback_responses WHERE event_id = ?", ev.id).n === 0);
  check("a rating of 4 is stored", (await a.c.post(`/api/e/${ev.id}/feedback`, { answers: { [rating.id]: 4 } })).status === 200);
}

console.log("\n# Rows 1, 12 and 16: small hardening (F35.7)");
{
  const p = await person("Theo");
  const card = (await p.c.get("/api/me")).json.cards[0].cardId;
  const bad = await p.c.put(`/api/cards/${card}`, { theme: "\"><img src=x onerror=alert(1)>" });
  check("a card edit with a made-up theme is 400 and the theme is unchanged", bad.status === 400 && q1("SELECT theme FROM cards WHERE id = ?", card).theme === "default");
  check("a real theme still saves", (await p.c.put(`/api/cards/${card}`, { theme: "night" })).status === 200 && q1("SELECT theme FROM cards WHERE id = ?", card).theme === "night");

  const photos = [];
  for (let i = 0; i < 22; i++) photos.push((await p.c.put("/api/profile", { photoDataUrl: PNG })).status);
  check("20 new profile photos in an hour are taken, the 21st is a 429", photos.slice(0, 20).every((s) => s === 200) && photos.slice(20).every((s) => s === 429), photos.join());
  check("…and only one photo is kept in storage", [...env.MEDIA.store.keys()].filter((k) => k.startsWith("avatar/")).length === 1);
  check("other profile edits still work while photos are limited", (await p.c.put("/api/profile", { headline: "Still here" })).status === 200);

  const { emailLink } = await import("../worker/unsub.js");
  const link = new URL(await emailLink(env, "https://lanyard.test", p.id, "news"));
  const good = await client({ ip: freshIp() }).get(link.pathname + link.search);
  const t = link.searchParams.get("t");
  const forged = await client({ ip: freshIp() }).get(link.pathname + link.search.replace(t, t.slice(0, -1) + (t.endsWith("0") ? "1" : "0")));
  const short = await client({ ip: freshIp() }).get(link.pathname + link.search.replace(t, t.slice(0, 31)));
  check("an email link with its real signature opens; one wrong or missing character does not", /Unsubscribe\?/.test(good.text) && /not valid/.test(forged.text) && /not valid/.test(short.text));
  const unsub = readFileSync("worker/unsub.js", "utf8");
  check("…and the signature is compared character by character, not with === (source guard)", /sameText\(c\.req\.query\("t"\)/.test(unsub) && !/(===|!==)\s*\(?\s*await mac\(/.test(unsub));
}

/* ------------------------------------------------------------------------------------------ */
// F35.8: the rows that were already safe, each tried here so a later change cannot quietly undo them.
console.log("\n# Row 2: another account's ids give the same 404 as made-up ones, and change nothing (F35.8)");
{
  const a = await person("Alice");
  const b = await person("Bob");
  const cpeer = await person("Cleo");
  const bCard = (await b.c.post("/api/cards", { name: "Bob's second" })).json.id;
  await b.c.post("/api/cards/" + bCard + "/personal-note", { text: "for the next person" });
  const cCard = (await cpeer.c.get("/api/me")).json.cards[0].cardId;
  const bConn = (await b.c.post("/api/connect", { cardId: cCard, via: "qr" })).json.connectionId;
  await b.c.put(`/api/connections/${bConn}/note`, { text: "Bob's private note" });
  const fake = "0123456789";
  const pairs = [
    ["PUT", (id) => `/api/cards/${id}`, bCard, { name: "Hacked" }],
    ["DELETE", (id) => `/api/cards/${id}`, bCard],
    ["POST", (id) => `/api/cards/${id}/rotate-code`, bCard, {}],
    ["GET", (id) => `/api/cards/${id}/personal-note`, bCard],
    ["DELETE", (id) => `/api/cards/${id}/personal-note`, bCard],
    ["GET", (id) => `/api/connections/${id}`, bConn],
    ["PUT", (id) => `/api/connections/${id}/note`, bConn, { text: "Hacked" }],
    ["PUT", (id) => `/api/connections/${id}/meta`, bConn, { followedUp: true }],
    ["POST", (id) => `/api/connections/${id}/report`, bConn, { reason: "x", block: true }],
    ["POST", (id) => `/api/connections/${id}/selfie/remove`, bConn, {}],
    ["DELETE", (id) => `/api/connections/${id}`, bConn],
  ];
  const call = (c, [m, path, , body], id) => (m === "GET" ? c.get(path(id)) : m === "DELETE" ? c.del(path(id)) : m === "PUT" ? c.put(path(id), body) : c.post(path(id), body));
  const before = JSON.stringify([q("SELECT * FROM cards WHERE user_id = ? ORDER BY id", b.id), q("SELECT * FROM connections WHERE id = ?", bConn), q("SELECT * FROM notes WHERE connection_id = ?", bConn), q("SELECT id, card_id, text FROM card_notes WHERE card_id = ?", bCard)]);
  const out = [];
  for (const p of pairs) {
    const theirs = await call(a.c, p, p[2]);
    const madeUp = await call(a.c, p, fake);
    out.push([p[0] + " " + p[1](":id"), theirs.status, madeUp.status, theirs.text === madeUp.text]);
  }
  check(`${pairs.length} attendee routes: another account's real id gives the same 404 and body as a made-up id`, out.every(([, s1, s2, same]) => s1 === 404 && s2 === 404 && same), out.filter(([, s1, s2, same]) => !(s1 === 404 && s2 === 404 && same)));
  const after = JSON.stringify([q("SELECT * FROM cards WHERE user_id = ? ORDER BY id", b.id), q("SELECT * FROM connections WHERE id = ?", bConn), q("SELECT * FROM notes WHERE connection_id = ?", bConn), q("SELECT id, card_id, text FROM card_notes WHERE card_id = ?", bCard)]);
  check("…and Bob's cards, connection, private note and QR note are exactly as they were", before === after);

  // Hosts: another organisation's event.
  const hx = client({ site: "host", ip: freshIp() });
  await becomeHost(hx, { kind: "company", name: "Org X" });
  const hy = client({ site: "host", ip: freshIp() });
  await becomeHost(hy, { kind: "company", name: "Org Y" });
  const yEv = (await hy.post("/api/host/events", { name: "Y's event", venue: "Y hall" })).json;
  const hostPairs = [
    ["GET", (id) => `/api/host/events/${id}/live`], ["GET", (id) => `/api/host/events/${id}/report`], ["GET", (id) => `/api/host/events/${id}/report.csv`],
    ["GET", (id) => `/api/host/events/${id}/feedback`], ["GET", (id) => `/api/host/events/${id}/attendees`], ["GET", (id) => `/api/host/events/${id}/drops`],
    ["PUT", (id) => `/api/host/events/${id}`, { name: "Hacked" }], ["POST", (id) => `/api/host/events/${id}/rotate-code`, {}],
    ["POST", (id) => `/api/host/events/${id}/end`, {}], ["POST", (id) => `/api/host/events/${id}/duplicate`, {}],
    ["POST", (id) => `/api/host/events/${id}/drops`, { title: "x", kind: "same", items: "x" }],
  ];
  const evBefore = JSON.stringify(q("SELECT * FROM events WHERE org_id = (SELECT org_id FROM events WHERE id = ?)", yEv.id));
  const hout = [];
  for (const [m, path, body] of hostPairs) {
    const go = (id) => (m === "GET" ? hx.get(path(id)) : m === "PUT" ? hx.put(path(id), body) : hx.post(path(id), body));
    const theirs = await go(yEv.id);
    const madeUp = await go(fake);
    hout.push([m + " " + path(":id"), theirs.status, madeUp.status, theirs.text === madeUp.text]);
  }
  check(`${hostPairs.length} host routes: another organisation's event gives the same 404 and body as a made-up id`, hout.every(([, s1, s2, same]) => s1 === 404 && s2 === 404 && same), hout.filter(([, s1, s2, same]) => !(s1 === 404 && s2 === 404 && same)));
  check("…and Org Y's events are exactly as they were (no edit, new code, end or copy)", evBefore === JSON.stringify(q("SELECT * FROM events WHERE org_id = (SELECT org_id FROM events WHERE id = ?)", yEv.id)));
}

console.log("\n# Row 3: /admin and /api/admin (F35.8)");
{
  const bare = client({ ip: "203.0.113.150" });
  check("no token: 401", (await bare.get("/api/admin/queue")).status === 401);
  check("a token sent as a cookie or query does nothing: 401", (await bare.get(`/api/admin/queue?token=${SECRETS.ADMIN_TOKEN}`, { cookie: `admin=${SECRETS.ADMIN_TOKEN}` })).status === 401);
  const guesser = client({ ip: "203.0.113.154" });
  const wrong = [];
  for (let i = 0; i < 10; i++) wrong.push((await guesser.get("/api/admin/queue", { authorization: "Bearer not-the-token-" + i })).status);
  check("10 wrong tokens from one IP: each 401", wrong.every((s) => s === 401), wrong.join());
  check("the 11th try from that IP is 429 even with the right token", (await guesser.get("/api/admin/queue", ADMIN)).status === 429);
  check("the right token from another IP works", (await client({ ip: "203.0.113.151" }).get("/api/admin/queue", ADMIN)).status === 200);
  check("on the host site /api/admin is not served at all (401 wrong_site)", (await client({ site: "host", ip: "203.0.113.152" }).get("/api/admin/queue", ADMIN)).json?.code === "wrong_site");
  check("every admin call is written to the audit log", q1("SELECT COUNT(*) n FROM admin_audit WHERE action = 'GET /api/admin/queue'").n >= 1);
  const adminSrc = readFileSync("worker/admin.js", "utf8");
  check("the token is compared as two SHA-256 hashes over every character, never with === (source guard)",
    /sha256Hex\(given\), sha256Hex\(token\)/.test(adminSrc) && /diff \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/.test(adminSrc) && !/(given|token)\s*(===|!==)\s*(given|token)/.test(adminSrc));
  const page = (await client({ ip: "203.0.113.153" }).get("/admin")).text;
  check("/admin signed out is only the app shell, with no data in it", /<title>app<\/title>/.test(page) && !/lanyard_admin|ADMIN_TOKEN|queue/.test(page));
  const adminVue = readFileSync("src/views/Admin.vue", "utf8");
  check("the admin page loads nothing until a token is typed in this tab (source guard)", /v-if="!token"/.test(adminVue) && /if \(token\.value\) load\(\)/.test(adminVue));
}

console.log("\n# Row 6: sign-up and edits cannot set what only the server sets (F35.8)");
{
  const sneaky = { plan: "plus", plan_until: 9e15, planUntil: 9e15, is_guest: 0, email_verified: 1, emailVerified: true, verified_student: 1, is_admin: true, isAdmin: true, role: "admin", user_id: "0000000000", userId: "0000000000", credits: 999, recovery_email: "x@y.test", is_public: 0 };
  const c = client({ ip: freshIp() });
  const made = await c.post("/api/profile", { name: "Mallory", acceptTerms: true, over18: true, ...sneaky });
  const id = (await c.get("/api/me")).json.user.id;
  const row = () => q1("SELECT plan, plan_until, email_verified, verified_student, recovery_email FROM users WHERE id = ?", id);
  check("sign-up with plan, admin, verified and id fields: the account is plain Free", made.status === 201 && row().plan !== "plus" && !row().plan_until && !row().email_verified && !row().verified_student && !row().recovery_email, row());
  await c.put("/api/profile", sneaky);
  check("a profile edit with the same fields changes none of them", row().plan !== "plus" && !row().email_verified && (await c.get("/api/me")).json.plan.tier === "free");
  check("no other account was touched", !q1("SELECT 1 x FROM profiles WHERE user_id = '0000000000'"));

  const h = client({ site: "host", ip: freshIp() });
  await becomeHost(h, { kind: null, email: "lead2@campus.ac.uk" });
  await h.post("/api/host/account/details", { fullName: "Lead Two", survey: { useCase: "Socials", frequency: "Weekly" }, status: "disabled", email: "other@campus.ac.uk", terms_version: "x" });
  const acct = q1("SELECT email, status FROM host_accounts WHERE email = 'lead2@campus.ac.uk'");
  check("host details with status and email fields: the account keeps its email and stays active", acct?.status === "active");
  const soc = await h.post("/api/host/orgs", { kind: "society", name: "Sneaky Soc", leaderName: "Lead Two", orgLink: "https://example.org/s", university: "Example Campus", verification_status: "approved", status: "approved", plan: "pro", credits: 999 });
  const org = q1("SELECT id, verification_status, plan FROM orgs WHERE name = 'Sneaky Soc'");
  check("a society that says it is approved, with 999 credits, is still pending with no credits", soc.status === 201 && org.verification_status === "pending" && org.plan === "starter"
    && q1("SELECT COUNT(*) n FROM credits WHERE org_id = ?", org.id).n === 0);
  check("…and cannot create an event until an admin approves it", (await h.post("/api/host/events", { name: "Early" })).status === 403);
}

console.log("\n# Row 8: nothing outside can mark anything paid (F35.8)");
{
  const r1 = await client({ ip: freshIp() }).post("/api/integrations/rsvp", { eventCode: "ABCDE", count: 5 });
  const r2 = await client({ ip: freshIp() }).post("/api/integrations/rsvp", { eventCode: "ABCDE", count: 5 }, { authorization: "Bearer lyk_" + "0".repeat(48) });
  check("the only inbound API needs an organisation's real key (none: 401, made up: 401)", r1.status === 401 && r2.status === 401);
  const routes = readdirSync("worker").filter((f) => f.endsWith(".js")).map((f) => readFileSync(join("worker", f), "utf8")).join("\n");
  check("no route takes a payment provider's webhook yet (no stripe, checkout or paid webhook route)", !/\.(post|put)\("\/api\/[^"]*(stripe|webhook\/pay|checkout|payment)/i.test(routes));
}

console.log("\n# Row 12: uploads that are not photos (F35.8)");
{
  const p = await person("Uma");
  const b64 = (s) => Buffer.from(s).toString("base64");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>`;
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).toString("base64");
  const tries = {
    "an SVG": `data:image/svg+xml;base64,${b64(svg)}`,
    "an SVG that says it is a PNG": `data:image/png;base64,${b64(svg)}`,
    "HTML that says it is a PNG": `data:image/png;base64,${b64("<!doctype html><script>alert(1)</script>")}`,
    "HTML as text/html": `data:text/html;base64,${b64("<script>alert(1)</script>")}`,
    "a JPEG that says it is a PNG": `data:image/png;base64,${jpegBytes}`,
    "a GIF": `data:image/gif;base64,${b64("GIF89a\u0001\u0000\u0001\u0000")}`,
    "not base64": "data:image/png;base64,<script>",
    "a link to another site": "https://evil.example/x.png",
  };
  const res = {};
  for (const [k, v] of Object.entries(tries)) res[k] = (await p.c.put("/api/profile", { photoDataUrl: v })).status;
  check("each of these is refused (400) and nothing is stored: " + Object.keys(tries).join(", "), Object.values(res).every((s) => s === 400) && ![...env.MEDIA.store.keys()].some((k) => k.startsWith("avatar/") && q1("SELECT 1 x FROM profiles WHERE photo_key = ? AND user_id = ?", k, p.id)), res);
  const big = `data:image/png;base64,${"A".repeat(2 * 1024 * 1024)}`;
  check("a 1.5 MB+ upload is 413 before it is decoded", (await p.c.put("/api/profile", { photoDataUrl: big })).status === 413);
  await p.c.put("/api/profile", { photoDataUrl: PNG });
  const key = q1("SELECT photo_key k FROM profiles WHERE user_id = ?", p.id).k;
  const served = await client({ ip: freshIp() }).get(`/media/${key}`);
  check("a real photo is served as image/png with nosniff, a sandbox CSP and same-origin only",
    served.status === 200 && served.headers.get("content-type") === "image/png" && served.headers.get("x-content-type-options") === "nosniff"
    && /sandbox/.test(served.headers.get("content-security-policy")) && served.headers.get("cross-origin-resource-policy") === "same-origin");
  const paths = ["/media/avatar/..%2f..%2fwrangler.toml", "/media/avatar/x.svg", "/media/avatar/x.html", "/media/../.dev.vars", "/media/other/abc.png"];
  const st = [];
  for (const path of paths) st.push((await client({ ip: freshIp() }).get(path)).status);
  check("media paths outside the pattern (traversal, .svg, .html, other folders) are refused", st.every((s) => s === 400 || s === 404), st.join());
}

console.log("\n# Row 1: script in text is kept as text (F35.8)");
{
  const x = `<script>alert(1)</script><img src=x onerror=alert(1)>`;
  const p = await person(x);
  const card = (await p.c.get("/api/me")).json.cards[0].cardId;
  await p.c.put("/api/profile", { headline: x, links: { site: "javascript:alert(1)", ok: "https://example.org", data: "data:text/html,x" }, projects: [{ title: x, url: "javascript:alert(1)" }] });
  const view = (await client({ ip: freshIp() }).get(`/api/c/${card}`)).json;
  check("a name and headline with markup come back as the same plain text (Vue shows it as text)", view.profile.name === x && view.profile.headline === x);
  check("javascript: and data: links are dropped when saved; https stays", JSON.stringify(view.profile.links) === JSON.stringify({ ok: "https://example.org" }), view.profile.links);
  check("a project's javascript: link is emptied", view.profile.projects[0].url === "");
  const vfiles = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? vfiles(join(dir, f)) : f.endsWith(".vue") ? [join(dir, f)] : []));
  const vhtml = vfiles("src").flatMap((f) => [...readFileSync(f, "utf8").matchAll(/v-html="([^"]+)"/g)].map((m) => `${f.replace(/\\/g, "/")}: ${m[1]}`));
  const allowed = [/Icon\.vue: paths\[name\]$/, /AppShell\.vue: t\.paths$/, /Settings\.vue: SETTINGS_ICONS\[r\.key\]$/, /Settings\.vue: SETTINGS_ICONS\.logout$/];
  check("v-html is used only for the fixed icon paths, never for anything a person typed (source guard)", vhtml.length > 0 && vhtml.every((v) => allowed.some((re) => re.test(v))), vhtml);
  // The host's report CSV.
  const h = client({ site: "host", ip: freshIp() });
  await becomeHost(h, { kind: "company", name: "Csv Co" });
  const ev = (await h.post("/api/host/events", { name: `=HYPERLINK("https://evil.example","Click")` })).json;
  const csv = (await h.get(`/api/host/events/${ev.id}/report.csv`)).text;
  check("an event named =HYPERLINK(...) is written to the CSV with a ' in front, so it cannot run", csv.includes(`'=HYPERLINK`) && !/,"?=HYPERLINK/.test(csv));
  const s = client({ site: "host", ip: freshIp() });
  await becomeHost(s, { email: "lead3@campus.ac.uk", kind: "society", name: `<b>Bold</b> & "quoted"`, extra: { leaderName: "Lead Three", orgLink: "javascript:alert(1)", university: "Example Campus" } });
  check("a society link that is not https is refused", !q1("SELECT 1 x FROM orgs WHERE name LIKE '%Bold%'"));
  await s.post("/api/host/orgs", { kind: "society", name: `<b>Bold</b> & "quoted"`, leaderName: "Lead Three", orgLink: "https://example.org/b", university: "Example Campus" });
  const mail = env.MAIL_OUTBOX.filter((m) => m.to[0] === "lead3@campus.ac.uk").at(-1);
  check("an organisation name with markup is escaped in the email's HTML", /&lt;b&gt;Bold&lt;\/b&gt; &amp; &quot;quoted&quot;/.test(mail.html) && !/<b>Bold/.test(mail.html));
}

console.log("\n# Rows 4 and 16: no secret in the pages, the config or any response (F35.8)");
{
  const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
  const srcText = files("src").filter((f) => /\.(js|vue|json)$/.test(f)).map((f) => [f, readFileSync(f, "utf8")]);
  const names = /\b(ADMIN_TOKEN|TOTP_KEY|DROP_KEY|UNSUB_SECRET|RESEND_[A-Z_]*KEY|CLAUDE_API_KEY)\b|sk-ant-|re_[A-Za-z0-9]{8,}_|whsec_[0-9a-f]{8}|lyk_[0-9a-f]{8}/;
  const inSrc = srcText.filter(([f, t]) => names.test(t.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""))).map(([f]) => f);
  check("no file the browser loads (src/) uses a secret's name or holds a key-shaped string, outside comments", inSrc.length === 0, inSrc);
  const tomls = ["wrangler.toml", "wrangler.production.toml"].map((f) => [f, readFileSync(f, "utf8")]);
  const varsBad = tomls.filter(([, t]) => {
    const vars = (t.split(/^\[vars\]/m)[1] || "").split(/^\[/m)[0].split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    return /\b(ADMIN_TOKEN|TOTP_KEY|DROP_KEY|UNSUB_SECRET|RESEND_[A-Z_]*KEY|CLAUDE_API_KEY)\s*=/.test(vars) || /sk-ant-|re_[A-Za-z0-9]{8,}_|whsec_|lyk_/.test(vars);
  }).map(([f]) => f);
  check("neither wrangler*.toml puts a secret in [vars] (they are Worker secrets only)", varsBad.length === 0, varsBad);
  check(".dev.vars and .env files are ignored by git", /^\.dev\.vars$/m.test(readFileSync(".gitignore", "utf8")) && /^\.env$/m.test(readFileSync(".gitignore", "utf8")));
  if (existsSync("dist")) {
    const built = files("dist").filter((f) => /\.(js|html|css|json|webmanifest)$/.test(f));
    const leaks = built.filter((f) => { const t = readFileSync(f, "utf8"); return names.test(t) || /sourceMappingURL/.test(t) || Object.values(SECRETS).some((v) => t.includes(v)); });
    check(`the built dist/ (${built.length} text files) has no secret name, key-shaped string or source map link`, leaks.length === 0, leaks);
    check("…and no source map file is built", !files("dist").some((f) => f.endsWith(".map")));
  }
  // The admin AI page says whether a key is set, never the key.
  const ai = await client({ ip: "203.0.113.160" }).get("/api/admin/ai", ADMIN);
  check("the admin AI page reports the key as set or not, and holds no key", ai.status === 200 && !ai.text.includes(SECRETS.CLAUDE_API_KEY));
  const all = responses.join("\n");
  const found = Object.entries(SECRETS).filter(([k, v]) => k !== "ADMIN_TOKEN" && all.includes(v)).map(([k]) => k);
  check(`none of ${responses.length} responses in this file holds TOTP_KEY, DROP_KEY, either Resend key or the AI key`, found.length === 0, found);
  check("…and none holds ADMIN_TOKEN", !all.includes(SECRETS.ADMIN_TOKEN));
}

summary();
