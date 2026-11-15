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

summary();
