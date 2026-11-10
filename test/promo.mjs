// Promo codes (/redeem): first N get Plus, everyone gets a place in the queue.
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";

const T = await makeEnv({ ADMIN_TOKEN: "adm" });
const { client, q1, env } = T;
const DAY = 864e5;
let ip = 0;
const verify = (id, email) => env.DB.raw.prepare("UPDATE users SET email_verified = 1, recovery_email = ? WHERE id = ?").run(email, id);
async function person(name, { email = true } = {}) {
  const c = client({ ip: "10.5." + Math.floor(++ip / 200) + "." + (ip % 200) });
  await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  const id = (await c.get("/api/me")).json.user.id;
  if (email) verify(id, `${name.toLowerCase()}${ip}@uni.test`);
  return { c, id };
}
const admin = client({ ip: "10.4.0.1" });
const A = { authorization: "Bearer adm" };

console.log("\n# The poster code");
const pub = await client({ ip: "10.4.0.2" }).get("/api/redeem/first50");
check("FIRST50 exists out of the box, 50 left", pub.status === 200 && pub.json.promo.left === 50 && pub.json.promo.days === 365, pub.json);
check("anyone can look without an account", pub.json.mine === null);
const bad = await client({ ip: "10.4.0.3" }).get("/api/redeem/NOPE123");
check("an unknown code says so", bad.status === 404);

console.log("\n# No live code in the pages");
const seeded = /VALUES \('([A-Z0-9]+)'/.exec(readFileSync("migrations/0017_promo_codes.sql", "utf8"))?.[1];
const srcFiles = ["src/views", "src/components", "src/lib"].flatMap((d) => readdirSync(d).map((f) => d + "/" + f)).concat(["index.html"]);
const leaks = srcFiles.filter((f) => { try { return readFileSync(f, "utf8").toUpperCase().includes(seeded); } catch { return false; } });
check("the code seeded by migration 0017 is " + seeded, seeded === "FIRST50", seeded);
check("no page, component or lib file names the poster code (placeholders, help text, defaults)", leaks.length === 0, leaks);

console.log("\n# Who can redeem");
const anon = client({ ip: "10.4.0.4" });
const r0 = await anon.post("/api/redeem/FIRST50");
check("no card yet: told to make one (guest is created but has no card)", r0.status === 403 && r0.json.code === "needs_card", r0.json);
const noMail = await person("Nomail", { email: false });
const r1 = await noMail.c.post("/api/redeem/FIRST50");
check("no verified email: told to confirm it", r1.status === 403 && r1.json.code === "needs_email", r1.json);
check("…and that doesn't use up a place", q1("SELECT attempts FROM promo_codes WHERE code = 'FIRST50'").attempts === 0);

console.log("\n# First come, first served");
const first = await person("Ada");
const g = await first.c.post("/api/redeem/first50");
check("the first person gets a year of Plus", g.status === 200 && g.json.mine.granted && g.json.mine.position === 1, g.json);
const me1 = (await first.c.get("/api/me")).json;
check("their plan is Plus", me1.plan.tier === "plus");
const until = q1("SELECT plan_until FROM users WHERE id = ?", first.id).plan_until;
check("…for about 365 days", Math.abs(until - (Date.now() + 365 * DAY)) < 60e3);
const again = await first.c.post("/api/redeem/FIRST50");
check("redeeming twice changes nothing", again.json.already && again.json.mine.position === 1
  && q1("SELECT uses FROM promo_codes WHERE code='FIRST50'").uses === 1);

for (let i = 0; i < 49; i++) { const p = await person("P" + i); await p.c.post("/api/redeem/FIRST50"); }
check("50 granted", q1("SELECT uses FROM promo_codes WHERE code='FIRST50'").uses === 50);
const late = await person("Late");
const l = await late.c.post("/api/redeem/FIRST50");
check("the 51st is told their place and doesn't get Plus", l.status === 200 && !l.json.mine.granted && l.json.mine.position === 51 && l.json.mine.max === 50, l.json);
check("…is put on the Plus list", !!q1("SELECT 1 AS x FROM plus_waitlist WHERE user_id = ?", late.id));
check("…and stays free", (await late.c.get("/api/me")).json.plan.tier === "free");
check("the code now shows none left", (await client({ ip: "10.4.0.9" }).get("/api/redeem/FIRST50")).json.promo.status === "full");
const look = await late.c.get("/api/redeem/FIRST50");
check("looking again shows your own place", look.json.mine?.position === 51);

console.log("\n# Admin codes");
check("admin needs the token", (await admin.get("/api/admin/promos")).status === 401);
const mk = await admin.post("/api/admin/promos", { code: "soc-month", days: 30, maxUses: "", note: "AI Soc" }, A);
check("admin can make an unlimited 30-day code", mk.status === 200 && mk.json.code === "SOCMONTH", mk.json);
const plusLong = await first.c.post("/api/redeem/SOCMONTH");
check("redeeming on top of Plus adds the days", plusLong.json.mine.granted
  && Math.abs(q1("SELECT plan_until FROM users WHERE id = ?", first.id).plan_until - (until + 30 * DAY)) < 60e3);
await admin.post("/api/admin/promos/SOCMONTH/active", { active: false }, A);
check("a switched-off code stops working", (await late.c.post("/api/redeem/SOCMONTH")).status === 404);
const exp = await admin.post("/api/admin/promos", { code: "OLDCODE", days: 30, expiresAt: Date.now() - 1000 }, A);
check("an end date in the past is refused", exp.status === 400);

console.log("\n# Lookups are rate-limited");
const scraper = client({ ip: "10.4.1.1" });
let lastOk = 0, firstBlock = 0, blocked = null;
for (let i = 1; i <= 31; i++) {
  const r = await scraper.get("/api/redeem/FIRST50");
  if (r.status === 200) lastOk = i;
  else if (!firstBlock) { firstBlock = i; blocked = r; }
}
check("the first 30 lookups in 10 minutes from one IP work", lastOk === 30, lastOk);
check("the 31st gets a 429 with a friendly message", firstBlock === 31 && blocked.status === 429 && blocked.json.code === "throttled"
  && /wait/i.test(blocked.json.error) && !/error|exception/i.test(blocked.json.error), blocked?.json);
check("another IP is not affected", (await client({ ip: "10.4.1.2" }).get("/api/redeem/FIRST50")).status === 200);
const unknownIp = client({ ip: "10.4.1.3" });
for (let i = 0; i < 30; i++) await unknownIp.get("/api/redeem/ZZZ" + i);
check("wrong codes count too: the 31st guess is stopped", (await unknownIp.get("/api/redeem/ZZZ31")).status === 429);
// The same signed-in person from a fresh IP is limited by their own counter.
const sameUser = client({ ip: "10.4.1.4" });
await sameUser.post("/api/profile", { name: "Looker", acceptTerms: true, over18: true });
let userBlocked = 0;
for (let i = 1; i <= 31; i++) {
  const hop = client({ ip: "10.4.2." + i });
  for (const [k, v] of sameUser.jar) hop.jar.set(k, v);
  if ((await hop.get("/api/redeem/FIRST50")).status === 429) { userBlocked = i; break; }
}
check("one signed-in person hopping between IPs is stopped on lookup 31 as well", userBlocked === 31, userBlocked);

console.log("\n# Your data");
const ex = await first.c.get("/api/account/export");
check("the export lists codes you redeemed", Array.isArray(ex.json?.promoCodes) && ex.json.promoCodes.length === 2, ex.json?.promoCodes);
summary();
