// F11: Student and Career mode. API validation, defaults for old profiles,
// what card, people and room views return, export and deletion.
// The formatter, search and source guards are added by later F11 tasks.
// Run: node test/mode.mjs
import { makeEnv, makeDb, readMigration, check, summary, becomeHost } from "./harness.mjs";
import { eraseUser } from "../worker/purge.js";

const T = await makeEnv();
const { client, q1, env } = T;

async function signup(name, ip, extra = {}) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...extra });
  if (r.status !== 201 && r.status !== 400) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, r, id: me.json.user?.id, card: me.json.cards?.[0]?.cardId, me: me.json };
}

console.log("\n# Migration 0019 on a profile in the old shape");
{
  const db = makeDb({ before: "0019" });
  db.exec("INSERT INTO users (id, created_at) VALUES ('u1', 1)");
  db.exec("INSERT INTO profiles (user_id, name, uni, course, updated_at) VALUES ('u1', 'Old', 'Some Uni', 'Maths', 1)");
  db.exec(readMigration("0019_profile_mode.sql"));
  const p = await db.prepare("SELECT mode, company, role, uni, course FROM profiles WHERE user_id = 'u1'").first();
  check("an existing profile becomes a student with no company or role", p.mode === "student" && p.company === "" && p.role === "" && p.uni === "Some Uni" && p.course === "Maths", p);
}

console.log("\n# Creating a profile");
const plain = await signup("Plain", "10.5.0.1", { uni: "Some Uni", course: "Maths" });
check("no mode given: student, empty company and role", plain.me.profile.mode === "student" && plain.me.profile.company === "" && plain.me.profile.role === "");
const bad = await signup("Bad", "10.5.0.2", { mode: "retired" });
check("an unknown mode is refused", bad.r.status === 400 && /mode/.test(bad.r.json.error), bad.r.text);
const badType = await signup("Bad2", "10.5.0.3", { mode: { x: 1 } });
check("a mode that is not a string is refused", badType.r.status === 400);
const long = "x".repeat(200);
const A = await signup("Ada", "10.5.0.4", { mode: "career", company: "  Acme  ", role: long, uni: "Studied Uni", course: "Design", year: "2020" });
check("career profile saves mode, trimmed company and capped role",
  A.r.status === 201 && A.me.profile.mode === "career" && A.me.profile.company === "Acme" && A.me.profile.role.length === 80, A.me.profile);

console.log("\n# Editing");
{
  const r = await A.c.put("/api/profile", { mode: "student" });
  const p = (await A.c.get("/api/me")).json.profile;
  check("switching to student keeps company, role and the studied-at fields", r.status === 200 && p.mode === "student" && p.company === "Acme" && p.role.length === 80 && p.uni === "Studied Uni" && p.course === "Design" && p.year === "2020", p);
  const back = await A.c.put("/api/profile", { mode: "career", role: "Product designer" });
  const p2 = (await A.c.get("/api/me")).json.profile;
  check("and back again loses nothing", back.status === 200 && p2.mode === "career" && p2.company === "Acme" && p2.role === "Product designer" && p2.uni === "Studied Uni", p2);
  const nope = await A.c.put("/api/profile", { mode: "boss", company: "Changed" });
  check("an unknown mode on edit is refused and nothing changes", nope.status === 400 && q1("SELECT company FROM profiles WHERE user_id = ?", A.id).company === "Acme");
  const only = await A.c.put("/api/profile", { headline: "Hello" });
  check("an edit without mode leaves the mode alone", only.status === 200 && q1("SELECT mode FROM profiles WHERE user_id = ?", A.id).mode === "career");
  const clear = await A.c.put("/api/profile", { company: "" });
  check("company can be cleared", q1("SELECT company FROM profiles WHERE user_id = ?", A.id).company === "" && clear.status === 200);
  await A.c.put("/api/profile", { company: "Acme" });
}

console.log("\n# What other people get");
{
  const B = await signup("Bob", "10.5.1.1");
  const pub = await B.c.get(`/api/c/${A.card}`);
  const pp = pub.json.card?.profile || pub.json.view?.profile || pub.json.profile;
  check("the public card carries mode, company and role", pp && pp.mode === "career" && pp.company === "Acme" && pp.role === "Product designer", pub.json);
  const old = await B.c.get(`/api/c/${plain.card}`);
  const op = old.json.card?.profile || old.json.view?.profile || old.json.profile;
  check("an old profile reads as a student", op && op.mode === "student" && op.company === "", old.json);
  const conn = await B.c.post("/api/connect", { cardId: A.card });
  check("connecting works", conn.status === 200, conn.text);
  const list = (await B.c.get("/api/connections")).json.connections[0].peer;
  check("the people list carries mode, company and role", list.mode === "career" && list.company === "Acme" && list.role === "Product designer", list);
  const one = (await B.c.get(`/api/connections/${conn.json.connectionId}`)).json.peer;
  check("so does one person", one.mode === "career" && one.company === "Acme" && one.role === "Product designer", one);

  // The event room.
  const H = client({ ip: "10.5.2.1", site: "host" });
  await becomeHost(H, { kind: "company", name: "ModeCo", email: "h@modeco.test" });
  const ev = (await H.post("/api/host/events", { name: "Mode Night", startsAt: Date.now() - 3600e3, endsAt: Date.now() + 3600e3 })).json;
  await A.c.post(`/api/e/${ev.code}/checkin`, { directoryConsent: true });
  await B.c.post(`/api/e/${ev.code}/checkin`, { directoryConsent: true });
  const room = (await B.c.get(`/api/e/${ev.id}/room`)).json.people.find((x) => x.name === "Ada");
  check("the room carries mode, company and role", room && room.mode === "career" && room.company === "Acme" && room.role === "Product designer", room);
}

console.log("\n# Export and deletion");
{
  const ex = (await A.c.get("/api/account/export")).json.profile;
  check("the data export includes mode, company and role", ex.mode === "career" && ex.company === "Acme" && ex.role === "Product designer", ex);
  await eraseUser(env, A.id);
  check("deleting the account removes the profile and with it mode, company and role", !q1("SELECT 1 x FROM profiles WHERE user_id = ?", A.id));
}

summary();
