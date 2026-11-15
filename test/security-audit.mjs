// F35: the security audit against the owner's list of common attacks
// (Lanyard-Vault/03 Technical/Security Audit 2026-11-15.md). One section per gap that was
// fixed, each with the attack tried for real against the Worker, plus proofs for rows that
// were already safe but had no test of their own. Concurrent attacks use Promise.all: the
// harness interleaves requests at every await, as the real Worker does.
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";

const T = await makeEnv({ ADMIN_TOKEN: "adm-audit-token", TOTP_KEY: "audit-totp-key-0123456789" });
const { client, q, q1, env } = T;

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
const ADMIN = { authorization: "Bearer adm-audit-token" };
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

summary();
