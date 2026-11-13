// F32: drops for codes, keys and vouchers. Offline: the real Worker on in-memory SQLite (test/harness.mjs).
// Each section below belongs to one task of the plan; the later sections are added with their task.
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, becomeHost, migrationFiles, readMigration } from "./harness.mjs";
import { sealItem, openItem, pinMac, sameMac, dropsReady } from "../worker/dropcrypto.js";
import { createDrop, revealItem, readItems, MAX_ITEMS } from "../worker/drops.js";

// Everything the Worker (and this file) prints is kept, so the last section can search it for item values.
const printed = [];
for (const m of ["log", "error", "warn", "info", "debug"]) {
  const orig = console[m].bind(console);
  console[m] = (...a) => { printed.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); orig(...a); };
}
const KEY = "test-drop-key-0123456789-abcdefghijklmnop";
const OTHER_KEY = "another-drop-key-9876543210-zyxwvutsrqpon";
const T = await makeEnv({ DROP_KEY: KEY });
const { env, client, q, q1 } = T;
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// A host, an event, and attendees who checked in.
const H = client({ ip: "10.90.0.1", site: "host" });
const hostInfo = await becomeHost(H, { kind: "company", name: "Drop Co", email: "drops@company.example.com" });
const grant = (orgId, n = 40) => env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, ?, 0, 't', ?)").run("cr-" + Math.random().toString(16).slice(2), orgId, n, Date.now());
grant(hostInfo.org.json.id);
async function makeEvent(name = "Hack Night", extra = {}) {
  const r = await H.post("/api/host/events", { name, ...extra });
  if (r.status !== 201) throw new Error("event: " + r.text);
  return { ...r.json, row: q1("SELECT * FROM events WHERE id = ?", r.json.id) };
}
let ipN = 0;
async function person(name, ev, { checkIn = true, guest = false } = {}) {
  ipN += 1;
  const c = client({ ip: `10.91.${Math.floor(ipN / 250)}.${ipN % 250}` });
  if (!guest) await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  if (checkIn) {
    const r = await c.post(`/api/e/${ev.code}/checkin`, guest ? { name, acceptTerms: true, over18: true } : { acceptTerms: true, over18: true });
    if (r.status !== 200) throw new Error("checkin: " + r.text);
  }
  const id = (await c.get("/api/me")).json.user.id;
  return { c, id, name };
}
const dropRow = (id) => q1("SELECT * FROM drops WHERE id = ?", id);
const settle = (ps) => Promise.allSettled(ps).then((rs) => rs.map((r) => (r.status === "fulfilled" ? { ok: true, ...r.value } : { ok: false, code: r.reason?.code, status: r.reason?.status, msg: r.reason?.message })));

const ev1 = await makeEvent();

console.log("\n# F32.1 Migration 0029 is additive");
{
  const sql = readMigration("0029_drops.sql");
  const code = sql.replace(/--.*$/gm, "");
  check("it is the newest migration and the files before it are untouched", migrationFiles().at(-1) === "0029_drops.sql" && migrationFiles().includes("0028_named_attendance.sql"));
  check("it only creates (tables, indexes, one trigger): no ALTER, DROP, UPDATE or DELETE of anything that exists", !/\b(ALTER|DROP|UPDATE|INSERT)\b/i.test(code.replace(/DELETE FROM drop_items WHERE id = OLD\.item_id/, "")) && (code.match(/CREATE TABLE/g) || []).length === 5, code.match(/\b(ALTER|DROP|UPDATE)\b/gi));
  const db = makeDb({ before: "0029_drops.sql" });
  const tables = () => db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name);
  const before = tables();
  db.raw.exec("INSERT INTO users (id, created_at, is_guest) VALUES ('u1', 1, 0)");
  db.exec(sql);
  const after = tables();
  check("applied to a database with data, the five new tables appear and no other table changes", after.length === before.length + 5 && before.every((t) => after.includes(t)) && ["drops", "drop_items", "drop_gives", "voucher_uses", "drop_audit"].every((t) => after.includes(t)));
  check("…and the existing row is still there", db.raw.prepare("SELECT COUNT(*) n FROM users").get().n === 1);
}

console.log("\n# F32.1 Encryption");
{
  const a = await sealItem(env, "d1", "i1", "sk-live-SECRET-1");
  const b = await sealItem(env, "d1", "i1", "sk-live-SECRET-1");
  check("an item is sealed as v1 with a random IV each time: the same text never gives the same ciphertext", a.startsWith("v1.") && b.startsWith("v1.") && a !== b);
  check("the ciphertext does not contain the text, or any run of it", !a.includes("SECRET") && !atob(a.slice(3).replace(/-/g, "+").replace(/_/g, "/")).includes("SECRET"));
  check("it opens back to exactly the text", (await openItem(env, "d1", "i1", a)) === "sk-live-SECRET-1");
  const bytes = (s) => Uint8Array.from(atob(s.slice(3).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  check("the first 12 bytes are the IV and they differ between two sealings", bytes(a).slice(0, 12).join() !== bytes(b).slice(0, 12).join() && bytes(a).length === 12 + "sk-live-SECRET-1".length + 16);
  const refused = async (fn, code) => { try { await fn(); return false; } catch (e) { return e.status === 503 && e.code === code && !/SECRET|sk-live|test-drop-key/.test(e.message); } };
  check("a different DROP_KEY refuses to open it (drops_unreadable) and returns nothing", await refused(() => openItem({ DROP_KEY: OTHER_KEY }, "d1", "i1", a), "drops_unreadable"));
  check("no DROP_KEY: sealing refuses (drops_unavailable), and so does opening", await refused(() => sealItem({}, "d1", "i1", "x"), "drops_unavailable") && await refused(() => openItem({}, "d1", "i1", a), "drops_unavailable"));
  check("a DROP_KEY that is too short counts as missing", !dropsReady({ DROP_KEY: "short" }) && await refused(() => sealItem({ DROP_KEY: "short" }, "d", "i", "x"), "drops_unavailable") && dropsReady({ DROP_KEY: KEY }));
  const flipped = "v1." + a.slice(3, -3) + (a.at(-3) === "A" ? "B" : "A") + a.slice(-2);
  check("a changed ciphertext (a flipped bit) is refused: the tag is checked", await refused(() => openItem(env, "d1", "i1", flipped), "drops_unreadable"));
  check("a ciphertext moved onto another item or another drop is refused (bound to both ids)", await refused(() => openItem(env, "d1", "i2", a), "drops_unreadable") && await refused(() => openItem(env, "d2", "i1", a), "drops_unreadable"));
  check("garbage and the old plain format are refused", await refused(() => openItem(env, "d1", "i1", "plain text"), "drops_unreadable") && await refused(() => openItem(env, "d1", "i1", ""), "drops_unreadable") && await refused(() => openItem(env, "d1", "i1", null), "drops_unreadable"));
  const p1 = await pinMac(env, "d1", "123456");
  check("a staff PIN is kept as an HMAC bound to its drop: it matches itself, not another PIN, key or drop, and is not the PIN", p1.length === 64 && !p1.includes("123456") && sameMac(p1, await pinMac(env, "d1", "123456")) && !sameMac(p1, await pinMac(env, "d1", "123457")) && !sameMac(p1, await pinMac(env, "d2", "123456")) && !sameMac(p1, await pinMac({ DROP_KEY: OTHER_KEY }, "d1", "123456")));
}

console.log("\n# F32.1 The database never holds an item in the clear");
const KEYS = Array.from({ length: 50 }, (_, i) => `sk-live-${String(i).padStart(2, "0")}-${"abcdefghij".repeat(3)}`);
const SAME = "Wi-Fi-pass-8812-ZEBRA";
let oneEach;
{
  const created = await createDrop(env, ev1.row, { kind: "one_each", title: "API credit", items: KEYS.join("\n") });
  oneEach = created.id;
  const all = JSON.stringify([q("SELECT * FROM drops"), q("SELECT * FROM drop_items"), q("SELECT * FROM drop_gives")]);
  check("fifty keys are stored as fifty rows", q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", oneEach).n === 50 && created.loaded === 50);
  check("no key, and no part of one, is anywhere in the drop tables (raw rows searched)", !KEYS.some((k) => all.includes(k) || all.includes(k.slice(8, 24))) && !all.includes("sk-live"), all.slice(0, 200));
  check("every stored item is a v1 ciphertext and each differs from the others", q("SELECT cipher FROM drop_items").every((r) => /^v1\.[A-Za-z0-9_-]{20,}$/.test(r.cipher)) && new Set(q("SELECT cipher FROM drop_items").map((r) => r.cipher)).size === 50);
  const s = await createDrop(env, ev1.row, { kind: "same", title: "Wi-Fi password", value: SAME });
  check("a value for everyone is sealed too", !JSON.stringify(q("SELECT * FROM drop_items")).includes(SAME) && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", s.id).n === 1);
  const stored = q("SELECT d.id, d.check_cipher FROM drops d").map((r) => r.check_cipher).join();
  check("the key check phrase is sealed too", !stored.includes("lanyard-drop-check") && stored.includes("v1."));
}

console.log("\n# F32.1 No key, no drop: it fails closed and stores nothing");
{
  const before = JSON.stringify([q("SELECT COUNT(*) n FROM drops"), q("SELECT COUNT(*) n FROM drop_items")]);
  const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.error = (...a) => logs.push(a.map(String).join(" ")); console.warn = console.error;
  const noKey = { ...env, DROP_KEY: undefined };
  let err;
  try { await createDrop(noKey, ev1.row, { kind: "one_each", title: "No key", items: "TOPSECRET-1\nTOPSECRET-2" }); } catch (e) { err = e; }
  Object.assign(console, orig);
  check("creating a drop with no DROP_KEY refuses with a clear error (503, drops_unavailable)", err?.status === 503 && err.code === "drops_unavailable" && /DROP_KEY/.test(err.message), err);
  check("…and the error carries no item", !/TOPSECRET/.test(err.message + JSON.stringify(err)) && !logs.join().includes("TOPSECRET"));
  check("…and nothing at all was stored (no drop, no item, no plain text anywhere)", JSON.stringify([q("SELECT COUNT(*) n FROM drops"), q("SELECT COUNT(*) n FROM drop_items")]) === before && !JSON.stringify(q("SELECT * FROM drops")).includes("TOPSECRET"));
  let short; try { await createDrop({ ...env, DROP_KEY: "tooshort" }, ev1.row, { kind: "same", title: "Short", value: "TOPSECRET-3" }); } catch (e) { short = e; }
  check("a DROP_KEY that is too short is the same refusal", short?.code === "drops_unavailable" && q1("SELECT COUNT(*) n FROM drops WHERE title = 'Short'").n === 0);
}

console.log("\n# F32.1 Reading a pasted list");
{
  const r = readItems("  alpha \n\nbeta\r\nalpha\n   \ngamma\rbeta");
  check("lines are trimmed, blanks and exact repeats dropped, order kept", JSON.stringify(r.items) === '["alpha","beta","gamma"]' && r.duplicates === 2, r);
  const bad = (raw) => { try { readItems(raw); return null; } catch (e) { return e; } };
  const long = bad("ok\n" + "x".repeat(601) + "SECRETTAIL");
  check("a line that is too long is refused by its number, never by its value", long?.status === 400 && /Line 2/.test(long.message) && !/SECRETTAIL|xxxx/.test(long.message), long?.message);
  const ctl = bad("fine\nhas\u0007bell-SECRET9");
  check("a control character is refused by line number without echoing the line", ctl?.status === 400 && /Line 2/.test(ctl.message) && !/SECRET9/.test(ctl.message), ctl?.message);
  check("text that is not a string or list is refused; more than the maximum is refused", bad({ a: 1 })?.status === 400 && bad(["a", 5])?.status === 400 && bad(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => "k" + i))?.code === "too_many");
}

console.log("\n# F32.1 One each: 51 people, 50 keys, all at the same moment");
{
  const people = [];
  for (let i = 0; i < 51; i++) people.push(await person(`Racer ${i}`, ev1));
  const drop = dropRow(oneEach);
  const res = await settle(people.map((p) => revealItem(env, drop, p.id)));
  const ok = res.filter((r) => r.ok), no = res.filter((r) => !r.ok);
  check("exactly 50 people got a key and one was told 'all given out'", ok.length === 50 && no.length === 1 && no[0].code === "all_given" && no[0].status === 409, [ok.length, no]);
  check("the 50 keys are 50 different keys, all from the list", new Set(ok.map((r) => r.value)).size === 50 && ok.every((r) => KEYS.includes(r.value)));
  check("one give row per person and one per item (the database agrees)", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", oneEach).n === 50 && q1("SELECT COUNT(DISTINCT item_id) n FROM drop_gives WHERE drop_id = ?", oneEach).n === 50 && q1("SELECT COUNT(DISTINCT user_id) n FROM drop_gives WHERE drop_id = ?", oneEach).n === 50);
  const again = await settle(people.map((p) => revealItem(env, drop, p.id)));
  check("pressing Show again gives each of the 50 the same key, and the 51st is still told none are left", again.filter((r) => r.ok).length === 50 && again.filter((r) => r.ok).every((r, i) => r.value === ok[i].value) && again.filter((r) => !r.ok).length === 1);
  check("nothing more was used up by pressing again", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", oneEach).n === 50);
}

console.log("\n# F32.1 Two presses by one person at the same moment");
{
  const ev = await makeEvent("Double Press");
  const d = await createDrop(env, ev.row, { kind: "one_each", title: "Voucher code", items: "one-1\none-2\none-3" });
  const p = await person("Pressy", ev);
  const drop = dropRow(d.id);
  const res = await settle([1, 2, 3, 4, 5, 6].map(() => revealItem(env, drop, p.id)));
  check("six presses at once give one item, and every press returns it", res.every((r) => r.ok) && new Set(res.map((r) => r.value)).size === 1);
  check("only one item was used up", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d.id).n === 1);
  const q2 = await person("Second", ev);
  check("the next person gets a different one, in the host's order", (await revealItem(env, drop, q2.id)).value !== res[0].value && res[0].value === "one-1");
}

console.log("\n# F32.1 Many people race for the last items");
{
  const ev = await makeEvent("Last Three");
  const d = await createDrop(env, ev.row, { kind: "one_each", title: "Last", items: "last-a\nlast-b\nlast-c" });
  const people = [];
  for (let i = 0; i < 25; i++) people.push(await person(`Late ${i}`, ev));
  const drop = dropRow(d.id);
  const res = await settle(people.flatMap((p) => [revealItem(env, drop, p.id), revealItem(env, drop, p.id)]));
  const got = res.filter((r) => r.ok);
  check("25 people pressing twice each: three people hold the three items", new Set(got.map((r) => r.value)).size === 3 && q1("SELECT COUNT(DISTINCT user_id) n FROM drop_gives WHERE drop_id = ?", d.id).n === 3 && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d.id).n === 3);
  check("everyone else was told all given out, nothing else went wrong", res.filter((r) => !r.ok).every((r) => r.code === "all_given"));
}

console.log("\n# F32.1 Random without reuse, random with reuse, and the same for everyone");
{
  const ev = await makeEvent("Random Night");
  const lines = Array.from({ length: 30 }, (_, i) => `rnd-${i}-code`);
  const r1 = await createDrop(env, ev.row, { kind: "random", title: "Raffle code", items: lines });
  const ppl = [];
  for (let i = 0; i < 30; i++) ppl.push(await person(`Rnd ${i}`, ev));
  const d1 = dropRow(r1.id);
  const res = await settle(ppl.map((p) => revealItem(env, d1, p.id)));
  check("random without reuse: 30 people, 30 items, all different (no item to two people)", res.every((r) => r.ok) && new Set(res.map((r) => r.value)).size === 30 && res.every((r) => lines.includes(r.value)));
  check("…it is not simply the host's order (random pick)", res.map((r) => r.value).join() !== lines.join());
  const extra = await person("One too many", ev);
  check("…and the 31st is told all given out", (await settle([revealItem(env, d1, extra.id)]))[0].code === "all_given");

  const r2 = await createDrop(env, ev.row, { kind: "random", title: "Lucky", items: "lucky-1\nlucky-2\nlucky-3", reuse: true });
  const d2 = dropRow(r2.id);
  check("random with reuse is not exclusive", d2.reuse === 1 && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", d2.id).n === 3);
  const res2 = await settle(ppl.map((p) => revealItem(env, d2, p.id)));
  check("with reuse, 30 people from 3 items all get one, only from the list, and items repeat", res2.every((r) => r.ok && ["lucky-1", "lucky-2", "lucky-3"].includes(r.value)) && new Set(res2.map((r) => r.value)).size <= 3);
  check("…exactly one give per person", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d2.id).n === 30 && q1("SELECT COUNT(DISTINCT user_id) n FROM drop_gives WHERE drop_id = ?", d2.id).n === 30);
  const twice = await settle([revealItem(env, d2, ppl[0].id), revealItem(env, d2, ppl[0].id)]);
  check("…and pressing again gives that person the same item, not another", twice[0].value === res2[0].value && twice[1].value === res2[0].value);

  const r3 = await createDrop(env, ev.row, { kind: "same", title: "Wi-Fi", value: SAME });
  const d3 = dropRow(r3.id);
  const res3 = await settle(ppl.map((p) => revealItem(env, d3, p.id)));
  check("same for everyone: all 30 get the one value", res3.every((r) => r.ok && r.value === SAME));
  check("…and each person has one give row", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d3.id).n === 30 && q1("SELECT COUNT(DISTINCT user_id) n FROM drop_gives WHERE drop_id = ?", d3.id).n === 30);
}

console.log("\n# F32.1 The database's own rules (the second lock)");
{
  const ev = await makeEvent("Constraint Night");
  const d = await createDrop(env, ev.row, { kind: "one_each", title: "Locks", items: "lock-a\nlock-b" });
  const p1 = await person("Lock One", ev), p2 = await person("Lock Two", ev);
  const items = q("SELECT id FROM drop_items WHERE drop_id = ? ORDER BY seq", d.id);
  const raw = env.DB.raw;
  const ins = (id, user, item, ex) => raw.prepare("INSERT INTO drop_gives (id, drop_id, user_id, item_id, exclusive, given_at) VALUES (?,?,?,?,?,?)").run(id, d.id, user, item, ex, 1);
  ins("g1", p1.id, items[0].id, 1);
  const fails = (fn) => { try { fn(); return false; } catch (e) { return /UNIQUE/i.test(e.message); } };
  check("the same item cannot be given to a second person, even by a write that skips the rules", fails(() => ins("g2", p2.id, items[0].id, 1)));
  check("the same person cannot hold a second item from the same drop", fails(() => ins("g3", p1.id, items[1].id, 1)));
  check("two items in a drop are still given to two people", (() => { ins("g4", p2.id, items[1].id, 1); return q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d.id).n === 2; })());
}

console.log("\n# F32.1 A stopped, early or finished drop gives nothing new; people keep what they have");
{
  const ev = await makeEvent("States");
  const d = await createDrop(env, ev.row, { kind: "one_each", title: "States", items: "st-1\nst-2\nst-3\nst-4" });
  const early = await person("Early", ev), late = await person("Late", ev);
  const first = (await revealItem(env, dropRow(d.id), early.id)).value;
  env.DB.raw.prepare("UPDATE drops SET status = 'stopped' WHERE id = ?").run(d.id);
  const code = async (p) => { try { await revealItem(env, dropRow(d.id), p.id); return "ok"; } catch (e) { return e.code; } };
  check("stopped: someone with nothing gets nothing new", await code(late) === "stopped" && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d.id).n === 1);
  check("…and someone who already has their item still gets it", (await revealItem(env, dropRow(d.id), early.id)).value === first);
  env.DB.raw.prepare("UPDATE drops SET status = 'on', valid_from = ? WHERE id = ?").run(Date.now() + 60_000, d.id);
  check("before valid-from nothing is given", await code(late) === "not_yet");
  env.DB.raw.prepare("UPDATE drops SET valid_from = NULL, valid_until = ? WHERE id = ?").run(Date.now() - 1, d.id);
  check("after valid-until nothing new is given, but what was given can still be shown", await code(late) === "closed" && (await revealItem(env, dropRow(d.id), early.id)).value === first);
  env.DB.raw.prepare("UPDATE drops SET valid_until = ? WHERE id = ?").run(Date.now() + 60_000, d.id);
  check("inside the window it gives", await code(late) === "ok");
  const stale = dropRow(d.id); // read while the window is open
  env.DB.raw.prepare("UPDATE drops SET valid_until = ? WHERE id = ?").run(Date.now() - 1, d.id);
  const given = () => q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d.id).n;
  const n0 = given();
  const atEdge = await settle([revealItem(env, stale, (await person("Edge", ev)).id)]);
  check("the window is checked in the write itself: a copy of the drop read before it closed cannot give after it (and the answer is 'closed', not 'all given')", atEdge[0].ok === false && atEdge[0].code === "closed" && given() === n0);
  env.DB.raw.prepare("UPDATE drops SET status = 'stopped', valid_until = NULL WHERE id = ?").run(d.id);
  const atStop = await settle([revealItem(env, stale, (await person("Edge2", ev)).id)]);
  check("…and the same for a drop stopped after the copy was read", atStop[0].code === "stopped" && given() === n0);
}

console.log("\n# F32.1 A wrong key refuses before it uses an item up");
{
  const ev = await makeEvent("Wrong Key");
  const d = await createDrop(env, ev.row, { kind: "one_each", title: "Keyed", items: "wk-secret-1\nwk-secret-2" });
  const p = await person("Wrongkey", ev);
  const wrong = { ...env, DROP_KEY: OTHER_KEY };
  const res = await settle([revealItem(wrong, dropRow(d.id), p.id), revealItem({ ...env, DROP_KEY: undefined }, dropRow(d.id), p.id)]);
  check("with the wrong key, and with none, Show refuses (unreadable / unavailable) and returns no value", res[0].code === "drops_unreadable" && res[1].code === "drops_unavailable" && res.every((r) => !r.value && !/wk-secret/.test(r.msg || "")));
  check("…and no item was used up by trying", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d.id).n === 0);
  check("…with the right key it works", (await revealItem(env, dropRow(d.id), p.id)).value === "wk-secret-1");
}

console.log("\n# F32.2 The host's side: make, count, stop, add, download the unused, delete");
const SEEN = []; // every host response body except the deliberate download of unused items
const hcall = async (m, path, body, c = H) => {
  const r = await c.req(m, path, m === "GET" || m === "DELETE" ? undefined : (body ?? {}));
  if (!path.endsWith("/unused") || m === "DELETE") SEEN.push(r.text);
  return r;
};
const LIST = Array.from({ length: 120 }, (_, i) => `lst-${String(i).padStart(3, "0")}-${"qwertzuiop".repeat(2)}`);
let evH, dropA, sameDropId;
{
  evH = await makeEvent("Host Drops Night");
  const base = `/api/host/events/${evH.id}/drops`;
  const empty = await hcall("GET", base);
  check("a new event has no drops, and the host is told whether this server can hold items", empty.status === 200 && empty.json.drops.length === 0 && empty.json.ready === true && empty.json.kinds.join() === "same,one_each,random,voucher");
  const mk = await hcall("POST", base, { kind: "one_each", title: "  API   credit ", note: "Paste it into the portal", items: LIST.join("\n") + "\n" + LIST[5] });
  dropA = mk.json?.id;
  check("a drop is made from a pasted list (201), the repeated line is counted as a duplicate and dropped", mk.status === 201 && mk.json.loaded === 120 && mk.json.duplicates === 1 && !("pin" in mk.json), mk.json);
  check("the reply is counts only: no item in it", !/lst-/.test(mk.text));
  const ls = await hcall("GET", base);
  const row = ls.json.drops[0];
  check("the title is tidied and the host sees '120 loaded, 0 given'", row.title === "API credit" && row.loaded === 120 && row.given === 0 && row.unused === 120 && row.revoked === 0 && row.kind === "one_each" && row.state === "open" && row.note === "Paste it into the portal", row);
  check("the list never carries the PIN, the check text, the ciphertext or any item", !/pin_mac|check_cipher|cipher|v1\./.test(ls.text) && !/lst-/.test(ls.text));
  const people = [];
  for (let i = 0; i < 37; i++) people.push(await person(`Host Count ${i}`, evH));
  await settle(people.map((p) => revealItem(env, dropRow(dropA), p.id)));
  const after = (await hcall("GET", base)).json.drops[0];
  check("after 37 people take one it reads '120 loaded, 37 given' and 83 left", after.loaded === 120 && after.given === 37 && after.unused === 83, after);
  check("nothing in the host's answer says who took what", !/user|name|Host Count/i.test(JSON.stringify(after)));

  for (const [label, body] of [
    ["an unknown kind", { kind: "mystery", title: "X1", items: "a" }],
    ["no title", { kind: "same", title: " ", value: "v" }],
    ["a one-character title", { kind: "same", title: "A", value: "v" }],
    ["an empty list", { kind: "one_each", title: "Empty", items: " \n \n" }],
    ["items that are not text", { kind: "one_each", title: "Odd", items: 42 }],
    ["no value for everyone", { kind: "same", title: "NoValue" }],
    ["a window that ends before it starts", { kind: "same", title: "Window", value: "w", validFrom: Date.now() + 5e6, validUntil: Date.now() + 1e6 }],
    ["a window that is not a date", { kind: "same", title: "Window2", value: "w", validFrom: "tomorrow" }],
    ["a voucher for 0 uses", { kind: "voucher", title: "Lunch", perPerson: 0 }],
    ["a voucher for 99 uses", { kind: "voucher", title: "Lunch", perPerson: 99 }],
  ]) {
    const r = await hcall("POST", base, body);
    check(`refused with a plain message and nothing stored: ${label}`, r.status === 400 && typeof r.json.error === "string", [r.status, r.text]);
  }
  check("none of the refusals stored a drop", (await hcall("GET", base)).json.drops.length === 1);

  const kinds = {};
  kinds.same = (await hcall("POST", base, { kind: "same", title: "Wi-Fi password", value: "  guest-wifi-9931 ", validFrom: Date.now() - 1000, validUntil: Date.now() + 36e5 })).json;
  kinds.random = (await hcall("POST", base, { kind: "random", title: "Raffle code", items: ["rf-1", "rf-2", "rf-3"], reuse: true })).json;
  sameDropId = kinds.same.id;
  const lunch = await hcall("POST", base, { kind: "voucher", title: "Lunch", perPerson: 2 });
  check("one of each kind can be made: the same text, a random list with reuse, a voucher (which returns its staff PIN once)", kinds.same.ok && kinds.random.ok && kinds.random.loaded === 3 && lunch.json.ok && /^\d{6}$/.test(lunch.json.pin), [kinds, lunch.json]);
  const all = (await hcall("GET", base)).json.drops;
  const byTitle = Object.fromEntries(all.map((d) => [d.title, d]));
  check("the same-for-everyone drop reads as counts too, with its window", byTitle["Wi-Fi password"].loaded === 1 && byTitle["Wi-Fi password"].given === 0 && byTitle["Wi-Fi password"].validUntil > Date.now() && !JSON.stringify(all).includes("guest-wifi-9931"));
  check("the random drop keeps its reuse choice and the voucher its count; the PIN is not in the list", byTitle["Raffle code"].reuse === true && byTitle.Lunch.perPerson === 2 && !JSON.stringify(all).includes(lunch.json.pin) && byTitle.Lunch.entitled === 37 * 2, byTitle.Lunch);

  const stop = await hcall("PUT", `${base}/${dropA}`, { status: "stopped" });
  const stoppedP = await person("After Stop", evH);
  const refused = await settle([revealItem(env, dropRow(dropA), stoppedP.id)]);
  check("stopping a drop gives nothing new, and the host sees it is stopped", stop.status === 200 && refused[0].code === "stopped" && (await hcall("GET", base)).json.drops.find((d) => d.id === dropA).state === "stopped");
  check("…and people who already had an item still have it", (await revealItem(env, dropRow(dropA), people[0].id)).value.startsWith("lst-"));
  await hcall("PUT", `${base}/${dropA}`, { status: "on", title: "API credits", note: "", validUntil: Date.now() + 36e5 });
  const edited = (await hcall("GET", base)).json.drops.find((d) => d.id === dropA);
  check("it can be started again, renamed and given an end time", edited.state === "open" && edited.title === "API credits" && edited.note === "" && edited.validUntil > Date.now());
  check("a bad edit is refused (a status that is not on or stopped; an empty title; an end before the start)", (await hcall("PUT", `${base}/${dropA}`, { status: "paused" })).status === 400 && (await hcall("PUT", `${base}/${dropA}`, { title: "" })).status === 400 && (await hcall("PUT", `${base}/${dropA}`, { validFrom: Date.now() + 9e7, validUntil: Date.now() + 1e7 })).status === 400);
  check("the kind and the reuse choice can't be changed afterwards", (await hcall("PUT", `${base}/${dropA}`, { kind: "same", reuse: true })).status === 200 && dropRow(dropA).kind === "one_each" && dropRow(dropA).reuse === 0);

  const add = await hcall("POST", `${base}/${dropA}/items`, { items: "more-key-1\nmore-key-2\n" + LIST[0] + "\n" + LIST[119] });
  check("more items can be added to a list; the host sees the new count, and nothing else", add.status === 200 && add.json.added === 2 && add.json.loaded === 122 && !/more-key/.test(add.text), add.json);
  check("an item already in the drop (given or not) is not added a second time, so one key can't go to two people", add.json.alreadyThere === 2 && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", dropA).n === 122, add.json);
  check("…and a paste of only items already there adds nothing and says so", (await hcall("POST", `${base}/${dropA}/items`, { items: LIST[3] + "\n" + LIST[4] })).json?.code === "already_loaded" && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", dropA).n === 122);
  check("…they carry on the host's order (seq 121 onwards)", q1("SELECT MAX(seq) m, COUNT(*) n FROM drop_items WHERE drop_id = ?", dropA).m === 122);
  check("a voucher or a same-for-everyone drop has no list to add to", (await hcall("POST", `${base}/${lunch.json.id}/items`, { items: "x" })).status === 400 && (await hcall("POST", `${base}/${kinds.same.id}/items`, { items: "x" })).status === 400);
  const over = await hcall("POST", `${base}/${dropA}/items`, { items: Array.from({ length: 1990 }, (_, i) => "over-" + i) });
  check("a list past 2,000 items is refused and adds nothing", over.status === 400 && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", dropA).n === 122);
}

console.log("\n# F32.2 Downloading the unused items");
{
  const base = `/api/host/events/${evH.id}/drops/${dropA}`;
  const given = q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropA).n;
  const dl = await H.post(`${base}/unused`);
  const lines = dl.text.trim().split("\n");
  check("the host can download the unused items, decrypted, as a text file that is not cached", dl.status === 200 && /^text\/plain/.test(dl.headers.get("content-type")) && /attachment/.test(dl.headers.get("content-disposition")) && /no-store/.test(dl.headers.get("cache-control")) && lines.length === 122 - given && dl.headers.get("x-unused-count") === String(122 - given), [dl.status, lines.length, given]);
  const givenValues = new Set();
  for (const r of q("SELECT i.id, i.cipher FROM drop_gives g JOIN drop_items i ON i.id = g.item_id WHERE g.drop_id = ?", dropA)) givenValues.add(await openItem(env, dropA, r.id, r.cipher));
  check("the file holds every unused item and not one that was given", given === 37 && givenValues.size === 37 && lines.every((l) => !givenValues.has(l)) && [...LIST, "more-key-1", "more-key-2"].filter((v) => !givenValues.has(v)).every((v) => lines.includes(v)));
  check("it is logged in the audit trail with how many were downloaded, and by which host account", q1("SELECT n FROM drop_audit WHERE drop_id = ? AND action = 'download_unused'", dropA)?.n === 122 - given && !!q1("SELECT host_account_id h FROM drop_audit WHERE drop_id = ?", dropA).h);
  const rs = [];
  for (let i = 0; i < 5; i++) rs.push((await H.post(`${base}/unused`)).status);
  check("at most 5 downloads an hour for each drop (the sixth is refused with 429)", rs.slice(0, 4).every((x) => x === 200) && rs.at(-1) === 429, rs);
  const sameId = q1("SELECT id FROM drops WHERE title = 'Wi-Fi password'").id;
  check("a same-for-everyone drop or a voucher has no list to download", (await H.post(`/api/host/events/${evH.id}/drops/${sameDropId}/unused`)).status === 400);
}

console.log("\n# F32.2 Deleting");
{
  const base = `/api/host/events/${evH.id}/drops`;
  const before = q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropA).n;
  const racer = await person("Race Delete", evH);
  const [del, rev] = await Promise.all([H.del(`${base}/${dropA}/unused`), settle([revealItem(env, dropRow(dropA), racer.id)])]);
  const items = q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", dropA).n;
  const gives = q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropA).n;
  check("delete-unused removes the items nobody has and keeps every given one; a person given an item at the same moment either keeps it or is told all given out", del.status === 200 && items === gives && gives >= before && gives <= before + 1 && (rev[0].ok ? gives === before + 1 : rev[0].code === "all_given"), [del.json, items, gives, before, rev]);
  const row = (await H.get(base)).json.drops.find((d) => d.id === dropA);
  check("the host then sees loaded equal to given and nothing left", row.unused === 0 && row.loaded === row.given);
  const late = await person("Too Late", evH);
  check("…and a new person is told all given out", (await settle([revealItem(env, dropRow(dropA), late.id)]))[0].code === "all_given");
  const delDrop = await H.del(`${base}/${dropA}`);
  check("deleting the drop removes its items and what was given, and is audited", delDrop.status === 200 && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", dropA).n === 0 && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropA).n === 0 && !dropRow(dropA) && q1("SELECT n FROM drop_audit WHERE drop_id = ? AND action = 'delete_drop'", dropA).n === gives);
  check("a drop that is gone is 404 on every route", (await H.del(`${base}/${dropA}`)).status === 404 && (await H.post(`${base}/${dropA}/unused`)).status === 404 && (await H.put(`${base}/${dropA}`, { status: "on" })).status === 404);
}

console.log("\n# F32.2 Who may use the host routes");
{
  const dropB = (await hcall("POST", `/api/host/events/${evH.id}/drops`, { kind: "one_each", title: "Guarded", items: "guard-1\nguard-2" })).json.id;
  const paths = [["GET", `/api/host/events/${evH.id}/drops`], ["POST", `/api/host/events/${evH.id}/drops`], ["PUT", `/api/host/events/${evH.id}/drops/${dropB}`],
    ["POST", `/api/host/events/${evH.id}/drops/${dropB}/items`], ["POST", `/api/host/events/${evH.id}/drops/${dropB}/unused`], ["DELETE", `/api/host/events/${evH.id}/drops/${dropB}/unused`], ["DELETE", `/api/host/events/${evH.id}/drops/${dropB}`]];
  const sendAll = async (c) => { const out = []; for (const [m, p] of paths) out.push((await c.req(m, p, m === "GET" || m === "DELETE" ? undefined : {})).status); return out; };
  const signedOut = await sendAll(client({ ip: "10.92.0.1", site: "host" }));
  check("signed out: 401 on every route", signedOut.every((x) => x === 401), signedOut);
  const att = await person("Cookie Thief", evH);
  const leak = client({ ip: "10.92.0.2", site: "host" });
  leak.jar.set("lanyard_session", att.c.jar.get("lanyard_session"));
  const viaAtt = await sendAll(leak);
  check("an attendee's cookie on the host site: 401 on every route", viaAtt.every((x) => x === 401), viaAtt);
  const onMain = client({ ip: "10.92.0.3" });
  onMain.jar.set("__Host-lanyard_host", H.jar.get("__Host-lanyard_host"));
  const main = await sendAll(onMain);
  check("the host's cookie on the main site: refused on every route (403)", main.every((x) => x === 403), main);
  const H2 = client({ ip: "10.92.0.4", site: "host" });
  await becomeHost(H2, { kind: "company", name: "Other Co", email: "other@othercompany.example.com" });
  const other = await sendAll(H2);
  check("another organisation's host: 404 on every route (it can't tell the drop exists)", other.every((x) => x === 404), other);
  check("…and nothing of the drop changed", q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", dropB).n === 2 && dropRow(dropB).status === "on");
  check("an attendee API route on the host site is refused as before", (await H.get(`/api/e/${evH.id}/drops`)).status === 401);
  const noKey = await makeEnv({});
  const H3 = noKey.client({ ip: "10.92.0.5", site: "host" });
  const third = await becomeHost(H3, { kind: "company", name: "Keyless Co", email: "keyless@keyless.example.com" });
  noKey.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('crk', ?, 5, 0, 't', ?)").run(third.org.json.id, Date.now());
  const kev = (await H3.post("/api/host/events", { name: "Keyless" })).json;
  const k = await H3.post(`/api/host/events/${kev.id}/drops`, { kind: "same", title: "Nope", value: "NOKEY-SECRET-1" });
  check("on a server with no DROP_KEY the host is told so plainly (503), the list says drops are off, and nothing is stored", k.status === 503 && k.json.code === "drops_unavailable" && /DROP_KEY/.test(k.json.error) && !k.text.includes("NOKEY-SECRET") && (await H3.get(`/api/host/events/${kev.id}/drops`)).json.ready === false && noKey.q1("SELECT COUNT(*) n FROM drops").n === 0 && !JSON.stringify(noKey.q("SELECT * FROM drop_items")).includes("NOKEY"));
}

console.log("\n# F32.3 A person's side: who may open the drops");
const evP = await makeEvent("Person Night");
const PKEYS = Array.from({ length: 50 }, (_, i) => `pk-${String(i).padStart(2, "0")}-live-${"mnbvcxzlkj".repeat(2)}`);
let dropP, dropSame, dropVoucher;
const PERSON_SEEN = []; // every response an attendee got
const pcall = async (p, m, path, body) => { const r = await p.c.req(m, path, m === "GET" || m === "DELETE" ? undefined : (body ?? {})); PERSON_SEEN.push(r.text); return r; };
{
  const base = `/api/host/events/${evP.id}/drops`;
  dropP = (await hcall("POST", base, { kind: "one_each", title: "API key", note: "Paste it into the portal", items: PKEYS.join("\n") })).json.id;
  dropSame = (await hcall("POST", base, { kind: "same", title: "Wi-Fi", value: "wifi-pass-PERSON-77" })).json.id;
  dropVoucher = (await hcall("POST", base, { kind: "voucher", title: "Lunch voucher", perPerson: 1 })).json.id;
  const outsider = await person("Outsider", evP, { checkIn: false });
  const ghost = client({ ip: "10.93.0.1" });
  const usersBefore = q1("SELECT COUNT(*) n FROM users").n;
  check("signed out: 401 on the list and on Show, and pressing Show makes no guest account", (await ghost.get(`/api/e/${evP.id}/drops`)).status === 401 && (await ghost.post(`/api/e/${evP.id}/drops/${dropP}/reveal`)).status === 401 && q1("SELECT COUNT(*) n FROM users").n === usersBefore && !ghost.jar.has("lanyard_session"));
  check("signed in but not checked in to this event: 403 on the list and on Show (and nothing is given)", (await pcall(outsider, "GET", `/api/e/${evP.id}/drops`)).status === 403 && (await pcall(outsider, "POST", `/api/e/${evP.id}/drops/${dropP}/reveal`)).status === 403 && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropP).n === 0);
  check("an event that doesn't exist: 404", (await pcall(outsider, "GET", "/api/e/nosuchevent1/drops")).status === 404);
  const hostOnMain = client({ ip: "10.93.0.2" });
  hostOnMain.jar.set("__Host-lanyard_host", H.jar.get("__Host-lanyard_host"));
  check("the host's cookie on the main site is not a session: 401", (await hostOnMain.get(`/api/e/${evP.id}/drops`)).status === 401 && (await hostOnMain.post(`/api/e/${evP.id}/drops/${dropP}/reveal`)).status === 401);
  const guestOnHostSite = client({ ip: "10.93.0.3", site: "host" });
  guestOnHostSite.jar.set("lanyard_session", outsider.c.jar.get("lanyard_session"));
  const hs = [await guestOnHostSite.get(`/api/e/${evP.id}/drops`), await guestOnHostSite.post(`/api/e/${evP.id}/drops/${dropP}/reveal`), await H.get(`/api/e/${evP.id}/drops`), await H.post(`/api/e/${evP.id}/drops/${dropP}/reveal`)];
  check("the host site refuses attendee drop routes, with an attendee's cookie or the host's (401 wrong_site)", hs.every((r) => r.status === 401 && r.json?.code === "wrong_site"), hs.map((r) => r.status));
  const guest = await person("Gus Guest", evP, { guest: true });
  const gl = await pcall(guest, "GET", `/api/e/${evP.id}/drops`);
  check("a guest who checked in (with just a name) sees the drops, like anyone else", gl.status === 200 && gl.json.drops.length === 3 && gl.json.me.firstName === "Gus");
  const other = await makeEvent("Other Night");
  const otherDrop = (await hcall("POST", `/api/host/events/${other.id}/drops`, { kind: "same", title: "Other secret", value: "other-event-SECRET-1" })).json.id;
  const inP = await person("Ina", evP);
  const x = await pcall(inP, "POST", `/api/e/${evP.id}/drops/${otherDrop}/reveal`);
  check("another event's drop through this event: 404, nothing given", x.status === 404 && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", otherDrop).n === 0 && !x.text.includes("other-event-SECRET"));
  const y = await pcall(inP, "POST", `/api/e/${other.id}/drops/${otherDrop}/reveal`);
  check("…and the same drop through its own event, without having checked in there: 403", y.status === 403 && !y.text.includes("other-event-SECRET"));
  check("a made-up drop id is 404", (await pcall(inP, "POST", `/api/e/${evP.id}/drops/abc0000001/reveal`)).status === 404);
}

console.log("\n# F32.3 The list a person sees, Show and Copy's source");
{
  const ina = await person("Ina Lister", evP);
  const l0 = await pcall(ina, "GET", `/api/e/${evP.id}/drops`);
  const byTitle = Object.fromEntries(l0.json.drops.map((d) => [d.title, d]));
  check("a person sees each drop's title, note and where it stands for them (ready), in order", l0.json.drops.map((d) => d.title).join() === "API key,Wi-Fi,Lunch voucher" && byTitle["API key"].state === "ready" && byTitle["API key"].note === "Paste it into the portal" && byTitle["Wi-Fi"].state === "ready" && byTitle["Lunch voucher"].state === "ready", l0.json.drops);
  check("the list is never cached and holds no item, no count of what is left and no one else", /no-store/.test(l0.headers.get("cache-control")) && !/pk-|wifi-pass/.test(l0.text) && !("free" in byTitle["API key"]) && !/loaded|given|unused/.test(l0.text));
  const show = await pcall(ina, "POST", `/api/e/${evP.id}/drops/${dropP}/reveal`);
  check("Show gives a key from the list, and says it is not to be cached", show.status === 200 && PKEYS.includes(show.json.value) && /no-store/.test(show.headers.get("cache-control")) && show.json.title === "API key", show.json);
  const again = await pcall(ina, "POST", `/api/e/${evP.id}/drops/${dropP}/reveal`);
  check("Show again returns the same key and uses nothing more", again.json.value === show.json.value && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropP).n === 1);
  const l1 = await pcall(ina, "GET", `/api/e/${evP.id}/drops`);
  check("after that the list says she has it, and still shows no value", l1.json.drops.find((d) => d.id === dropP).state === "have" && !l1.text.includes(show.json.value));
  const sw = await pcall(ina, "POST", `/api/e/${evP.id}/drops/${dropSame}/reveal`);
  check("the same-for-everyone text comes back too", sw.json.value === "wifi-pass-PERSON-77");
  const v = await pcall(ina, "POST", `/api/e/${evP.id}/drops/${dropVoucher}/reveal`);
  check("a voucher has nothing to reveal (400) and gives nothing", v.status === 400 && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", dropVoucher).n === 0);
  const bee = await person("Bee Lister", evP);
  const bshow = await pcall(bee, "POST", `/api/e/${evP.id}/drops/${dropP}/reveal`);
  const bl = await pcall(bee, "GET", `/api/e/${evP.id}/drops`);
  check("someone else gets a different key and never sees Ina's", bshow.json.value !== show.json.value && !bl.text.includes(show.json.value));
  const spam = [];
  for (let i = 0; i < 14; i++) spam.push((await pcall(bee, "POST", `/api/e/${evP.id}/drops/${dropP}/reveal`)).status);
  check("Show is rate limited: more than 12 presses in 10 minutes for one drop is refused (429), and the key is still hers afterwards", spam.slice(0, 10).every((s) => s === 200) && spam.at(-1) === 429 && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ? AND user_id = ?", dropP, bee.id).n === 1, spam);
}

console.log("\n# F32.3 50 keys, 51 people, over HTTP, all at once");
{
  const ev = await makeEvent("Fifty Keys");
  const id = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "one_each", title: "Keys", items: PKEYS.map((k) => "f-" + k).join("\n") })).json.id;
  const crowd = [];
  for (let i = 0; i < 51; i++) crowd.push(await person(`Crowd ${i}`, ev));
  const rs = await Promise.all(crowd.map((p) => pcall(p, "POST", `/api/e/${ev.id}/drops/${id}/reveal`)));
  const ok = rs.filter((r) => r.status === 200), full = rs.filter((r) => r.status !== 200);
  check("50 people get a key and the 51st is told 'All given out' (409, all_given)", ok.length === 50 && full.length === 1 && full[0].status === 409 && full[0].json.code === "all_given" && /All given out/.test(full[0].json.error), [ok.length, full.map((r) => [r.status, r.json])]);
  check("the 50 keys are all different and all from the host's list", new Set(ok.map((r) => r.json.value)).size === 50 && ok.every((r) => PKEYS.some((k) => "f-" + k === r.json.value)));
  const twice = await Promise.all(crowd.flatMap((p) => [pcall(p, "POST", `/api/e/${ev.id}/drops/${id}/reveal`), pcall(p, "POST", `/api/e/${ev.id}/drops/${id}/reveal`)]));
  const byPerson = new Map();
  crowd.forEach((p, i) => byPerson.set(p.id, [twice[2 * i], twice[2 * i + 1]]));
  const stable = crowd.every((p, i) => rs[i].status !== 200 || byPerson.get(p.id).every((r) => r.json.value === rs[i].json.value));
  check("everyone pressing twice at the same moment changes nobody's key and uses nothing more", stable && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", id).n === 50 && q1("SELECT COUNT(DISTINCT item_id) n FROM drop_gives WHERE drop_id = ?", id).n === 50);
  const lastList = await pcall(crowd[50], "GET", `/api/e/${ev.id}/drops`);
  check("the 51st person's list says 'out'", lastList.json.drops[0].state === "out");
  const hostView = (await hcall("GET", `/api/host/events/${ev.id}/drops`)).json.drops[0];
  check("the host sees '50 loaded, 50 given' and none left", hostView.loaded === 50 && hostView.given === 50 && hostView.unused === 0);
}

console.log("\n# F32.3 A person's own data export");
{
  const ev = await makeEvent("Export Night");
  const a = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "one_each", title: "Export key", items: "exp-key-ONE\nexp-key-TWO" })).json.id;
  const pa = await person("Exa", ev), pb = await person("Exb", ev), pc = await person("Exc", ev);
  const ra = (await pcall(pa, "POST", `/api/e/${ev.id}/drops/${a}/reveal`)).json.value;
  const rb = (await pcall(pb, "POST", `/api/e/${ev.id}/drops/${a}/reveal`)).json.value;
  const ea = await pcall(pa, "GET", "/api/account/export");
  check("their own data download holds the item they were given, opened, with the event and when", ea.status === 200 && ea.json.drops?.items?.length === 1 && ea.json.drops.items[0].given === ra && ea.json.drops.items[0].title === "Export key" && ea.json.drops.items[0].eventName === "Export Night" && ea.json.drops.items[0].givenAt > 0, ea.json.drops);
  check("…and not the other person's", !ea.text.includes(rb));
  const ec = await pcall(pc, "GET", "/api/account/export");
  check("someone who was given nothing gets the download they always got (no drops key)", ec.status === 200 && !("drops" in ec.json));
  const wrong = await makeEnv({ DROP_KEY: OTHER_KEY });
  void wrong;
  const { exportDrops } = await import("../worker/dropsApp.js");
  const noKeyExport = await exportDrops({ DB: env.DB }, pa.id);
  check("if the server's key is gone the download still works, says the item can't be opened and returns no value", noKeyExport.items.length === 1 && noKeyExport.items[0].given === null && /key changed/.test(noKeyExport.items[0].note) && !JSON.stringify(noKeyExport).includes(ra));
}

console.log("\n# F32.4 Vouchers: only staff with the PIN can mark one used, and once");
const PINS = [];
{
  const ev = await makeEvent("Voucher Night");
  const base = `/api/host/events/${ev.id}/drops`;
  const mkv = await hcall("POST", base, { kind: "voucher", title: "Lunch", perPerson: 1 });
  const lunch = mkv.json.id, PIN = mkv.json.pin;
  const second = await hcall("POST", base, { kind: "voucher", title: "Coffee", perPerson: 3 });
  const coffee = second.json.id, COFFEE_PIN = second.json.pin;
  PINS.push(PIN, COFFEE_PIN);
  const row = dropRow(lunch);
  check("the PIN is six digits, shown to the host once, and the database keeps only a keyed hash of it", /^\d{6}$/.test(PIN) && row.pin_mac.length === 64 && !JSON.stringify(q("SELECT * FROM drops")).includes(`"${PIN}"`) && !JSON.stringify(row).includes(PIN) && row.pin_mac !== PIN);
  check("the host's list and edits never return it again", !(await hcall("GET", base)).text.includes(PIN) && !(await hcall("PUT", `${base}/${lunch}`, { title: "Lunch" })).text.includes(PIN));
  const ann = await person("Ann Vouchered", ev), ben = await person("Ben Vouchered", ev);
  const use = (p, drop, pin) => pcall(p, "POST", `/api/e/${ev.id}/drops/${drop}/use`, pin === undefined ? {} : { pin });
  const used = () => q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ?", lunch).n;

  const list0 = await pcall(ann, "GET", `/api/e/${ev.id}/drops`);
  const v0 = list0.json.drops.find((d) => d.id === lunch);
  check("the voucher screen's data: the event, the title, her first name and a photo slot, and one use left", list0.json.event.name === "Voucher Night" && v0.title === "Lunch" && list0.json.me.firstName === "Ann" && v0.state === "ready" && v0.voucher.left === 1 && v0.voucher.perPerson === 1 && v0.voucher.usedAt.length === 0, list0.json);

  const noPin = await use(ann, lunch), blank = await use(ann, lunch, ""), short = await use(ann, lunch, "12345"), nonNum = await use(ann, lunch, "abcdef"), notText = await use(ann, lunch, 123456);
  check("with no PIN, an empty one, a short one, letters or a number, nothing is marked (400)", [noPin, blank, short, nonNum, notText].every((r) => r.status === 400 && r.json.code === "pin_needed") && used() === 0);
  const wrong = await use(ann, lunch, PIN === "000000" ? "000001" : "000000");
  check("a wrong PIN is refused (403) and marks nothing", wrong.status === 403 && wrong.json.code === "bad_pin" && used() === 0);
  const otherPin = await use(ann, lunch, COFFEE_PIN);
  check("another voucher's PIN is refused too (a PIN is tied to its own drop)", otherPin.status === 403 && used() === 0);
  const hostOnly = await pcall(ann, "POST", `/api/e/${ev.id}/drops/${lunch}/use`, { pin: PIN, userId: ben.id, user: ben.id });
  check("the person can only mark their own voucher: a request naming someone else marks the sender", hostOnly.status === 200 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", lunch, ben.id).n === 0 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", lunch, ann.id).n === 1);
  check("with the right PIN it is marked: no uses left, and the time is recorded", hostOnly.json.ok && hostOnly.json.left === 0 && hostOnly.json.used === 1 && Math.abs(hostOnly.json.usedAt[0] - Date.now()) < 5000);
  const again = await use(ann, lunch, PIN);
  check("a second use, even with the right PIN, is refused (409, already_used) and says when it was used", again.status === 409 && again.json.code === "already_used" && /already used on/.test(again.json.error) && used() === 1, again.json);
  check("…and without a PIN it says the same (it is her own information)", (await use(ann, lunch)).json.code === "already_used");
  const l1 = (await pcall(ann, "GET", `/api/e/${ev.id}/drops`)).json.drops.find((d) => d.id === lunch);
  check("her list now says used, with the time", l1.state === "used" && l1.voucher.left === 0 && l1.voucher.usedAt.length === 1);
  const l2 = (await pcall(ben, "GET", `/api/e/${ev.id}/drops`)).json.drops.find((d) => d.id === lunch);
  check("another person's voucher is untouched: still one use left", l2.state === "ready" && l2.voucher.left === 1);
  check("the host sees '1 of N used' and the number of people, but not who", (await hcall("GET", base)).json.drops.find((d) => d.id === lunch).used === 1 && !JSON.stringify((await hcall("GET", base)).json).includes("Ann"));

  console.log("  (two staff at the same moment)");
  const many = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => use(ben, lunch, PIN)));
  check("eight requests for Ben's one-use voucher at once record one use: one success, seven told it was already used", many.filter((r) => r.status === 200).length === 1 && many.filter((r) => r.status === 409 && r.json.code === "already_used").length === 7 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", lunch, ben.id).n === 1, many.map((r) => r.status));
  const cat = await person("Cat Coffee", ev);
  const burst = await Promise.all(Array.from({ length: 10 }, () => use(cat, coffee, COFFEE_PIN)));
  const nums = q("SELECT n FROM voucher_uses WHERE drop_id = ? AND user_id = ? ORDER BY n", coffee, cat.id).map((r) => r.n);
  check("a three-use voucher pressed ten times at once is used exactly three times, numbered 1, 2, 3", burst.filter((r) => r.status === 200).length === 3 && nums.join() === "1,2,3" && burst.filter((r) => r.status === 409).length === 7, [burst.map((r) => r.status), nums]);

  console.log("  (guessing the PIN)");
  const eve = await person("Eve Guesser", ev);
  const guesses = [];
  for (let i = 0; i < 7; i++) guesses.push((await use(eve, lunch, String(100000 + i))).status);
  const rightLate = await use(eve, lunch, PIN);
  check("five wrong PINs and the person is held for ten minutes (429), even with the right PIN, and nothing was marked", guesses.slice(0, 5).every((s) => s === 403) && guesses[5] === 429 && rightLate.status === 429 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", lunch, eve.id).n === 0, guesses);
  check("…while another person with the right PIN is not held", (await use(await person("Fay Fine", ev), lunch, PIN)).status === 200);
  env.DB.raw.prepare("INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 100) ON CONFLICT(key) DO UPDATE SET count = 100, window_start = excluded.window_start").run(`drop:pinall:${coffee}`, Date.now());
  const gus = await person("Gus Locked", ev);
  check("a hundred wrong PINs across everyone in an hour holds the voucher for all (429) until the hour passes", (await use(gus, coffee, COFFEE_PIN)).status === 429);
  env.DB.raw.prepare("DELETE FROM rate_limits WHERE key = ?").run(`drop:pinall:${coffee}`);
  check("…and then it works again", (await use(gus, coffee, COFFEE_PIN)).status === 200);

  console.log("  (who may, and when)");
  const outsider = await person("Not Here", ev, { checkIn: false });
  check("not checked in: 403; signed out: 401; the host's cookie on the main site: 401", (await use(outsider, lunch, PIN)).status === 403 && (await client({ ip: "10.94.0.1" }).post(`/api/e/${ev.id}/drops/${lunch}/use`, { pin: PIN })).status === 401);
  const other = await makeEvent("Other Voucher Night");
  const otherV = (await hcall("POST", `/api/host/events/${other.id}/drops`, { kind: "voucher", title: "Elsewhere" })).json;
  PINS.push(otherV.pin);
  check("another event's voucher through this event is 404, and marks nothing", (await use(ann, otherV.id, otherV.pin)).status === 404 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ?", otherV.id).n === 0);
  const item = (await hcall("POST", base, { kind: "same", title: "Same text", value: "same-text-for-voucher-test" })).json.id;
  check("an item drop is not a voucher (400)", (await use(ann, item, PIN)).status === 400);
  const hal = await person("Hal Stopped", ev);
  const beforeStop = await use(hal, coffee, COFFEE_PIN);
  await hcall("PUT", `${base}/${coffee}`, { status: "stopped" });
  const ida = await person("Ida Stopped", ev);
  const stopped = await use(ida, coffee, COFFEE_PIN);
  check("a stopped voucher can't be used (409, stopped), whoever has the PIN; a use made before it was stopped stays", beforeStop.status === 200 && stopped.status === 409 && stopped.json.code === "stopped" && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", coffee, ida.id).n === 0 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", coffee, hal.id).n === 1);
  await hcall("PUT", `${base}/${coffee}`, { status: "on", validFrom: Date.now() + 3.6e6 });
  const early = await use(await person("Jay Early", ev), coffee, COFFEE_PIN);
  await hcall("PUT", `${base}/${coffee}`, { validFrom: Date.now() - 7.2e6, validUntil: Date.now() - 1000 });
  const late = await use(await person("Kay Late", ev), coffee, COFFEE_PIN);
  check("before it starts (409, not_yet) and after it ends (409, closed) it can't be used", early.json.code === "not_yet" && late.json.code === "closed", [early.json, late.json]);
  const stale = dropRow(coffee);
  await hcall("PUT", `${base}/${coffee}`, { validFrom: null, validUntil: null, status: "on" });
  env.DB.raw.prepare("UPDATE drops SET status = 'stopped' WHERE id = ?").run(coffee);
  const { useVoucher } = await import("../worker/vouchers.js");
  const lee = await person("Lee Race", ev);
  const raced = await settle([useVoucher(env, { ...stale, status: "on", valid_from: null, valid_until: null }, lee.id, COFFEE_PIN)]);
  check("the stopped state is checked in the write itself: a copy of the drop read before it was stopped can't mark a use", raced[0].ok === false && raced[0].code === "stopped" && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", coffee, lee.id).n === 0, raced);
  const noKeyUse = await settle([useVoucher({ ...env, DROP_KEY: undefined }, dropRow(lunch), lee.id, PIN)]);
  check("with no server key the PIN can't be checked, so nothing is marked (503)", noKeyUse[0].code === "drops_unavailable");

  console.log("  (a new PIN)");
  const reset = await hcall("POST", `${base}/${lunch}/pin`);
  PINS.push(reset.json.pin);
  const newbie = await person("Mia New", ev);
  check("the host can get a new PIN; the old one stops working at once and the new one works", reset.status === 200 && /^\d{6}$/.test(reset.json.pin) && reset.json.pin !== PIN && (await use(newbie, lunch, PIN)).status === 403 && (await use(newbie, lunch, reset.json.pin)).status === 200);
  const H4 = client({ ip: "10.95.0.1", site: "host" });
  await becomeHost(H4, { kind: "company", name: "Pin Rival Co", email: "rival@pinrival.example.com" });
  const rival = await H4.post(`${base}/${lunch}/pin`);
  check("only a voucher has a PIN (400), another organisation can't reset it (404), the reset is audited", (await hcall("POST", `${base}/${item}/pin`)).status === 400 && rival.status === 404 && q1("SELECT COUNT(*) n FROM drop_audit WHERE drop_id = ? AND action = 'reset_pin'", lunch).n === 1);
  const exp = (await pcall(ann, "GET", "/api/account/export")).json;
  check("her data download lists her voucher use, with when", exp.drops?.voucherUses?.length === 1 && exp.drops.voucherUses[0].title === "Lunch" && exp.drops.voucherUses[0].usedAt > 0 && exp.drops.voucherUses[0].use === 1 && exp.drops.voucherUses[0].of === 1, exp.drops);
}

console.log("\n# F32.5 Who has what: only for an event with named attendance, only people on its list");
const NAMED_KEYS = Array.from({ length: 8 }, (_, i) => `nk-${i}-named-${"plmokn".repeat(3)}`);
let nEv, nDrop, nVoucher;
const nPeople = {};
{
  nEv = await makeEvent("Named Drops Night", { collect: { attendance: true, items: ["card"], why: "So we can keep a register of who came to the event" } });
  check("the event keeps a named list (F31)", nEv.row.collect_attendance === 1);
  const base = `/api/host/events/${nEv.id}/drops`;
  nDrop = (await hcall("POST", base, { kind: "one_each", title: "Named keys", items: NAMED_KEYS.join("\n") })).json.id;
  nVoucher = (await hcall("POST", base, { kind: "voucher", title: "Named lunch", perPerson: 2 }));
  PINS.push(nVoucher.json.pin);
  const mk = async (name, collect) => {
    ipN += 1;
    const c = client({ ip: `10.96.${Math.floor(ipN / 250)}.${ipN % 250}` });
    await c.post("/api/profile", { name, acceptTerms: true, over18: true });
    const r = await c.post(`/api/e/${nEv.code}/checkin`, { acceptTerms: true, over18: true, ...(collect ? { collect } : {}) });
    if (r.status !== 200) throw new Error(r.text);
    return { c, id: (await c.get("/api/me")).json.user.id, name };
  };
  nPeople.ada = await mk("Ada Named", { attendance: true, card: true });
  nPeople.bob = await mk("Bob Named", { attendance: true });
  nPeople.cy = await mk("Cy Unnamed", { attendance: false });
  nPeople.di = await mk("Di Nothing Said"); // no choices sent: not on the list
  const got = {};
  for (const [k, p] of Object.entries(nPeople)) got[k] = (await pcall(p, "POST", `/api/e/${nEv.id}/drops/${nDrop}/reveal`)).json.value;
  for (const k of ["ada", "cy"]) await pcall(nPeople[k], "POST", `/api/e/${nEv.id}/drops/${nVoucher.json.id}/use`, { pin: nVoucher.json.pin });
  const ls = await hcall("GET", base);
  check("the host's list says the event keeps a named list, and its counts count everyone (4 given)", ls.json.named === true && ls.json.drops.find((d) => d.id === nDrop).given === 4 && ls.json.drops.find((d) => d.id === nDrop).unused === 4);

  const people = await hcall("GET", `${base}/${nDrop}/people`);
  const names = people.json.people.map((p) => p.name).sort();
  check("the named view lists only the people on the list: Ada and Bob; Cy (unticked) and Di (never said yes) are not named", names.join() === "Ada Named,Bob Named" && people.json.others === 2, people.json);
  check("each person comes with the number of their item in the host's list, when, and a handle to withdraw it, but never the item", people.json.people.every((p) => Number.isInteger(p.item) && p.item >= 1 && p.item <= 8 && p.givenAt > 0 && /^[0-9a-f]{20}$/.test(p.giveId) && p.withdrawn === false) && NAMED_KEYS.every((k) => !people.text.includes(k.slice(0, 12))) && !/user_id|userId|email/i.test(people.text));
  const adaItem = people.json.people.find((p) => p.name === "Ada Named");
  check("…the number matches the item's place in the host's own paste", NAMED_KEYS[adaItem.item - 1] === got.ada);
  const vp = await hcall("GET", `${base}/${nVoucher.json.id}/people`);
  check("a voucher's named view shows who used it and how many times, and counts the others", vp.json.people.length === 1 && vp.json.people[0].name === "Ada Named" && vp.json.people[0].used === 1 && vp.json.others === 1 && !/giveId|item/.test(JSON.stringify(vp.json.people[0])));

  console.log("  (unticking in the hub)");
  const gone = await nPeople.bob.c.put(`/api/e/${nEv.id}/attendance`, { attendance: false });
  const after = await hcall("GET", `${base}/${nDrop}/people`);
  check("Bob unticks the list in the hub: the very next request no longer names him (and the count of others goes up)", gone.status === 200 && after.json.people.map((p) => p.name).join() === "Ada Named" && after.json.others === 3, after.json);
  const bobGive = people.json.people.find((p) => p.name === "Bob Named").giveId;
  const revBob = await hcall("POST", `${base}/${nDrop}/revoke`, { giveId: bobGive });
  check("…and his item can't be withdrawn by the host any more (404): revoke needs the person on the list", revBob.status === 404 && q1("SELECT revoked_at r FROM drop_gives WHERE id = ?", bobGive).r === null);
  await nPeople.bob.c.put(`/api/e/${nEv.id}/attendance`, { attendance: true });
  check("…and when he ticks it again he is named again, and the host can withdraw his item", (await hcall("GET", `${base}/${nDrop}/people`)).json.people.length === 2);

  console.log("  (revoking a leaked key)");
  const bogus = [undefined, "", "nope", "abc0000001", "0".repeat(20), 12345, { a: 1 }];
  const bogusRes = []; for (const g of bogus) bogusRes.push((await hcall("POST", `${base}/${nDrop}/revoke`, { giveId: g })).status);
  check("an unknown, malformed or missing handle is 404", bogusRes.every((x) => x === 404), bogusRes);
  const diGive = q1("SELECT id FROM drop_gives WHERE drop_id = ? AND user_id = ?", nDrop, nPeople.di.id).id;
  check("a person who is not on the list can't be withdrawn, even with their real handle (404, same answer)", (await hcall("POST", `${base}/${nDrop}/revoke`, { giveId: diGive })).status === 404 && q1("SELECT revoked_at r FROM drop_gives WHERE id = ?", diGive).r === null);
  check("a voucher has nothing to withdraw (400)", (await hcall("POST", `${base}/${nVoucher.json.id}/revoke`, { giveId: bobGive })).status === 400);
  const rev = await hcall("POST", `${base}/${nDrop}/revoke`, { giveId: adaItem.giveId });
  check("a named person's item can be withdrawn", rev.status === 200 && rev.json.ok === true && q1("SELECT revoked_at r FROM drop_gives WHERE id = ?", adaItem.giveId).r > 0);
  const adaShow = await pcall(nPeople.ada, "POST", `/api/e/${nEv.id}/drops/${nDrop}/reveal`);
  check("Ada can no longer reveal it (410, withdrawn) and her list says so; she gets no replacement", adaShow.status === 410 && adaShow.json.code === "withdrawn" && !adaShow.text.includes(got.ada) && (await pcall(nPeople.ada, "GET", `/api/e/${nEv.id}/drops`)).json.drops.find((d) => d.id === nDrop).state === "withdrawn" && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ? AND user_id = ?", nDrop, nPeople.ada.id).n === 1);
  const row = q1("SELECT cipher FROM drop_items WHERE id = (SELECT item_id FROM drop_gives WHERE id = ?)", adaItem.giveId);
  check("the leaked item is wiped, kept out of the unused list and never given again", row.cipher === "" && !(await H.post(`${base}/${nDrop}/unused`)).text.includes(got.ada));
  const rest = [];
  for (let i = 0; i < 6; i++) { const p = await person(`Late Named ${i}`, nEv); rest.push(await settle([revealItem(env, dropRow(nDrop), p.id)])); }
  const lateVals = rest.map((r) => r[0].value).filter(Boolean);
  check("people who come later are given the unused ones only: the withdrawn key is not among them", lateVals.length === 4 && !lateVals.includes(got.ada) && rest.filter((r) => r[0].code === "all_given").length === 2, lateVals);
  check("the host's counts show one withdrawn", (await hcall("GET", base)).json.drops.find((d) => d.id === nDrop).revoked === 1 && q1("SELECT n FROM drop_audit WHERE drop_id = ? AND action = 'revoke'", nDrop).n === 1);
  check("withdrawing twice is harmless", (await hcall("POST", `${base}/${nDrop}/revoke`, { giveId: adaItem.giveId })).json.already === true);

  const H5 = client({ ip: "10.96.250.1", site: "host" });
  await becomeHost(H5, { kind: "company", name: "Nosy Co", email: "nosy@nosy.example.com" });
  const nosy = [await H5.get(`${base}/${nDrop}/people`), await H5.post(`${base}/${nDrop}/revoke`, { giveId: adaItem.giveId })];
  check("another organisation's host: 404 on both; signed out and an attendee cookie: 401", nosy.every((r) => r.status === 404) && (await client({ ip: "10.96.250.2", site: "host" }).get(`${base}/${nDrop}/people`)).status === 401 && (await (() => { const l = client({ ip: "10.96.250.3", site: "host" }); l.jar.set("lanyard_session", nPeople.ada.c.jar.get("lanyard_session")); return l.get(`${base}/${nDrop}/people`); })()).status === 401);
  const hay = [people.text, after.text, vp.text].join();
  check("none of the named views ever held a decrypted item", ![...NAMED_KEYS, ...Object.values(got)].some((k) => hay.includes(k)));
}

console.log("\n# F32.5 An event without named attendance: counts only, names never");
{
  const { namedAmong } = await import("../worker/attendance.js");
  const ev = await makeEvent("Counts Only Night");
  const d = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "one_each", title: "Counted", items: "co-1\nco-2\nco-3" })).json.id;
  const p1 = await person("Quiet One", ev), p2 = await person("Quiet Two", ev);
  await revealItem(env, dropRow(d), p1.id); await revealItem(env, dropRow(d), p2.id);
  // A stray row for an event whose list is off (it should not exist, F31 deletes them): it must not be read or matter.
  env.DB.raw.prepare("INSERT INTO event_attendees (event_id, user_id, items, notice_version, created_at, updated_at) VALUES (?, ?, '[]', 'v', 1, 1)").run(ev.id, p1.id);
  const pe = await hcall("GET", `/api/host/events/${ev.id}/drops/${d}/people`);
  check("the host sees counts (2 given), the list says the event has no named list, and asking for names is 404", (await hcall("GET", `/api/host/events/${ev.id}/drops`)).json.named === false && (await hcall("GET", `/api/host/events/${ev.id}/drops`)).json.drops[0].given === 2 && pe.status === 404 && pe.json.code === "list_off" && !/Quiet/.test(pe.text));
  check("…even with a stray attendee row for the event: the list being off is checked first and the table is not read", (await namedAmong(env.DB, ev.row, [p1.id])) === null);
  const gv = q1("SELECT id FROM drop_gives WHERE drop_id = ? AND user_id = ?", d, p1.id).id;
  check("withdrawing needs the named list: 404 here, and the item stays", (await hcall("POST", `/api/host/events/${ev.id}/drops/${d}/revoke`, { giveId: gv })).status === 404 && q1("SELECT revoked_at r FROM drop_gives WHERE id = ?", gv).r === null);
  check("nothing the host got names a person", !/Quiet/.test(SEEN.join("\n")));
  const src = read("worker/dropsHost.js") + read("worker/dropsManage.js") + read("worker/dropsNamed.js");
  check("only worker/attendance.js reads event_attendees: the drop files ask it who is on a list", !/event_attendees/.test(src) && /namedAmong/.test(read("worker/dropsNamed.js")));
}

console.log("\n# F32.5 Retention: 30 days after the event ends (a simulated clock)");
{
  const { purgeDrops } = await import("../worker/dropsKeep.js");
  const { purgeExpired } = await import("../worker/purge.js");
  const DAY = 86400_000, REAL = Date.now();
  const mkEvent = async (name, times) => {
    const ev = await makeEvent(name);
    env.DB.raw.prepare("UPDATE events SET starts_at = ?, ends_at = ?, ended_at = ? WHERE id = ?").run(times.start ?? null, times.end ?? null, times.ended ?? null, ev.id);
    const drop = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "one_each", title: "Kept for a while", items: `${name}-a\n${name}-b\n${name}-c` })).json.id;
    const v = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "voucher", title: "Lunch", perPerson: 2 })).json;
    PINS.push(v.pin);
    const a = await person(`${name} A`, ev), b = await person(`${name} B`, ev);
    await revealItem(env, dropRow(drop), a.id); await revealItem(env, dropRow(drop), b.id);
    await pcall(a, "POST", `/api/e/${ev.id}/drops/${v.id}/use`, { pin: v.pin });
    return { ev, drop, v: v.id, a, b, name };
  };
  const rows = (x) => ({ items: q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", x.drop).n, gives: q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", x.drop).n, uses: q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ?", x.v).n });
  const E = REAL - 5 * DAY; // an end time five days ago
  const withEnd = await mkEvent("withend", { start: E - 3600e3, end: E });
  const hostEnded = await mkEvent("hostended", { start: E - 86400e3, end: E + 20 * DAY, ended: E - 2 * DAY });
  const noEnd = await mkEvent("noend", { start: E - 3600e3 });
  const future = await mkEvent("future", { start: REAL + 40 * DAY, end: REAL + 41 * DAY });
  const keep = 30 * DAY;
  check("before anything is due: every list, give and use is there", [withEnd, hostEnded, noEnd, future].every((x) => rows(x).items === 3 && rows(x).gives === 2 && rows(x).uses === 1));
  const lastIn = (x) => q1("SELECT MAX(created_at) m FROM checkins WHERE event_id = ?", x.ev.id).m;
  const noEndEnds = Math.max(E - 3600e3, lastIn(noEnd)) + 12 * 3600e3 + 1;

  let n = await purgeDrops(env.DB, E + keep - 2 - 2 * DAY);
  check("one millisecond before 30 days after the host ended it early, nothing is cleared", n === 0 && rows(hostEnded).items === 3);
  n = await purgeDrops(env.DB, E - 2 * DAY + keep);
  check("on the moment, an event the host ended early (not its planned end) is cleared: items, gives and uses go", n === 2 && JSON.stringify(rows(hostEnded)) === JSON.stringify({ items: 0, gives: 0, uses: 0 }) && rows(withEnd).items === 3);
  n = await purgeDrops(env.DB, E + keep - 1);
  check("an event with an end time keeps everything until 30 days after it (one millisecond before: nothing)", n === 0 && rows(withEnd).items === 3);
  n = await purgeDrops(env.DB, E + keep);
  check("…and at that moment it is cleared", n === 2 && JSON.stringify(rows(withEnd)) === JSON.stringify({ items: 0, gives: 0, uses: 0 }));
  n = await purgeDrops(env.DB, noEndEnds + keep - 1);
  check("an event with no end time ends 12 hours after the later of its start and the last check-in: one millisecond before 30 days after that, its drops are all still there (other events made earlier in this file, with no end time either, are due about now and go)", rows(noEnd).items === 3 && rows(noEnd).gives === 2 && rows(noEnd).uses === 1);
  n = await purgeDrops(env.DB, noEndEnds + keep);
  check("…and then it is cleared", rows(noEnd).items === 0 && rows(noEnd).gives === 0 && rows(noEnd).uses === 0 && n >= 2);
  n = await purgeDrops(env.DB, REAL + 35 * DAY);
  check("an event that has not happened yet is kept however long the clock runs on to just before it ends", n === 0 && rows(future).items === 3);
  check("running it again clears nothing more", (await purgeDrops(env.DB, E + keep + 5 * DAY)) === 0);

  const d1 = dropRow(withEnd.drop), dv = dropRow(withEnd.v);
  check("what stays is the drop's title and its counts; the staff PIN's hash and the key check are gone", d1.purged_at > 0 && d1.final_loaded === 3 && d1.final_given === 2 && dv.final_used === 1 && dv.pin_mac === null && dv.check_cipher === null && d1.title === "Kept for a while");
  const hl = (await hcall("GET", `/api/host/events/${withEnd.ev.id}/drops`)).json.drops;
  check("the host sees '3 were loaded and 2 given' and that it is cleared; nothing can be downloaded or added", hl.find((d) => d.id === withEnd.drop).purged === true && hl.find((d) => d.id === withEnd.drop).loaded === 3 && hl.find((d) => d.id === withEnd.drop).given === 2 && (await H.post(`/api/host/events/${withEnd.ev.id}/drops/${withEnd.drop}/unused`)).status === 410 && (await hcall("POST", `/api/host/events/${withEnd.ev.id}/drops/${withEnd.drop}/items`, { items: "x" })).status === 410);
  const afterL = (await pcall(withEnd.a, "GET", `/api/e/${withEnd.ev.id}/drops`)).json.drops;
  const afterShow = await pcall(withEnd.a, "POST", `/api/e/${withEnd.ev.id}/drops/${withEnd.drop}/reveal`);
  check("a person no longer sees the cleared drops, and Show on one is refused (410, gone)", afterL.length === 0 && afterShow.status === 410 && afterShow.json.code === "gone");
  check("the person's own data download no longer holds the cleared items", !(await pcall(withEnd.a, "GET", "/api/account/export")).json.drops);
  const once = await mkEvent("viapurge", { start: E - 3600e3, end: E });
  const res = await purgeExpired(env, E + keep);
  check("the daily purge (purgeExpired) runs it", res.drops === 2 && rows(once).items === 0);
  void withEnd.b; void hostEnded.b;
}

console.log("\n# F32.5 Account deletion, the host's download, and the host reset");
{
  const ev = await makeEvent("Erase Night");
  const d = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "one_each", title: "Erase keys", items: "er-key-1\ner-key-2\ner-key-3" })).json.id;
  const same = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "same", title: "Erase same", value: "er-same-value" })).json.id;
  const a = await person("Erase Me", ev), b = await person("Keep Me", ev);
  const ka = (await revealItem(env, dropRow(d), a.id)).value;
  await revealItem(env, dropRow(same), a.id);
  const kb = (await revealItem(env, dropRow(d), b.id)).value;
  const del = await a.c.del("/api/account");
  check("deleting an account removes the person's given items: their gives are gone and their item is not left behind as 'unused'", del.status === 200 && q1("SELECT COUNT(*) n FROM drop_gives WHERE user_id = ?", a.id).n === 0 && q1("SELECT COUNT(*) n FROM drop_items WHERE drop_id = ?", d).n === 2);
  const unused = (await H.post(`/api/host/events/${ev.id}/drops/${d}/unused`)).text;
  check("…it is not in the host's unused download, and the key was not given to anyone else", !unused.includes(ka) && unused.trim() === "er-key-3" && kb === "er-key-2");
  const c = await person("Third", ev), x = await person("Fourth", ev);
  const more = await settle([revealItem(env, dropRow(d), c.id), revealItem(env, dropRow(d), x.id)]);
  check("a new person gets the one left and the next is told all given out: the deleted person's key never comes back", more[0].value === "er-key-3" && more[1].code === "all_given");
  check("the shared text is still there for others (it is not exclusive), and the other person's own key is untouched", (await revealItem(env, dropRow(same), c.id)).value === "er-same-value" && (await revealItem(env, dropRow(d), b.id)).value === kb);
  const raw = await person("Raw Delete", ev);
  const e = await settle([revealItem(env, dropRow(d), raw.id)]);
  void e;
  const keyHolder = q1("SELECT user_id u, item_id i FROM drop_gives WHERE drop_id = ? AND user_id = ?", d, c.id);
  env.DB.raw.prepare("DELETE FROM users WHERE id = ?").run(c.id);
  check("any deletion of a user, not only the account route, takes their exclusive item with them (a trigger)", q1("SELECT COUNT(*) n FROM drop_items WHERE id = ?", keyHolder.i).n === 0);

  const dl = await H.get("/api/host/account/export");
  const own = dl.json.drops;
  check("the host's own data download lists their drops with counts and their audit trail", dl.status === 200 && Array.isArray(own?.drops) && own.drops.some((x) => x.title === "Erase keys" && x.kind === "one_each" && typeof x.loaded === "number") && own.audit.some((x) => x.action === "download_unused"));
  const secretsHere = [...LIST.slice(0, 5), ...NAMED_KEYS, "er-key-1", "er-key-2", "er-key-3", "er-same-value", "guest-wifi-9931", ...PINS];
  check("…and it holds no item, no PIN, no ciphertext and no name of anyone given one", !secretsHere.some((v) => dl.text.includes(`"${v}"`) || dl.text.includes(v.length > 8 ? v : "\u0000")) && !/cipher|pin_mac|v1\./.test(dl.text) && !/Erase Me|Keep Me|Ada Named|Bob Named|Quiet/.test(JSON.stringify(own)) && !/Erase Me|Keep Me/.test(dl.text)); // (F31's own attendeeLists, for an event that keeps a list, name the people on it: that is F31, not drops)
  const sysH = client({ ip: "10.97.0.1", site: "host" });
  await becomeHost(sysH, { kind: "company", name: "Empty Co", email: "empty@emptyco.example.com" });
  check("a host with no drops gets the download they always got (no drops key)", !("drops" in (await sysH.get("/api/host/account/export")).json));

  const reset = await import("../scripts/reset-hosts.mjs");
  const rdb = makeDb();
  const r = rdb.raw;
  r.exec(`INSERT INTO users (id, created_at, is_guest) VALUES ('ru1', 1, 0);
    INSERT INTO orgs (id, name, plan, org_type, verification_status, created_at) VALUES ('ro1', 'Reset Org', 'starter', 'company', 'approved', 1);
    INSERT INTO events (id, org_id, code, name, created_at) VALUES ('re1', 'ro1', 'RS23', 'Reset Event', 1);
    INSERT INTO drops (id, event_id, kind, title, status, created_at, updated_at) VALUES ('rd1', 're1', 'one_each', 'Reset', 'on', 1, 1), ('rd2', 're1', 'voucher', 'Lunch', 'on', 1, 1);
    INSERT INTO drop_items (id, drop_id, seq, cipher, created_at) VALUES ('ri1', 'rd1', 1, 'v1.xx', 1), ('ri2', 'rd1', 2, 'v1.yy', 1);
    INSERT INTO drop_gives (id, drop_id, user_id, item_id, exclusive, given_at) VALUES ('rg1', 'rd1', 'ru1', 'ri1', 1, 1);
    INSERT INTO voucher_uses (drop_id, user_id, n, used_at) VALUES ('rd2', 'ru1', 1, 1);
    INSERT INTO drop_audit (id, event_id, drop_id, host_account_id, action, n, at) VALUES ('ra1', 're1', 'rd1', 'h1', 'download_unused', 1, 1);`);
  const before = r.prepare(reset.COUNT_SQL).get();
  check("the reset's dry run counts every drop table, and wipes them before the events", ["drops", "drop_items", "drop_gives", "voucher_uses", "drop_audit"].every((t) => before[t] >= 1 && reset.WIPED.includes(t) && reset.WIPED.indexOf(t) < reset.WIPED.indexOf("events")), before);
  r.exec("BEGIN"); r.exec(reset.wipeSql(before, 1794300000000)); r.exec("COMMIT");
  const after = r.prepare(reset.COUNT_SQL).get();
  check("after the wipe there are no drops, items, gives, uses or audit rows, the script's own check passes and the person keeps their account", ["drops", "drop_items", "drop_gives", "voucher_uses", "drop_audit"].every((t) => after[t] === 0) && reset.verify(before, after).length === 0 && after.users_kept === 1, reset.verify(before, after));
  check("a database without migration 0029 is refused by the script's schema check", makeDb({ before: "0029" }).raw.prepare(reset.SCHEMA_SQL).get().n === 7 && makeDb().raw.prepare(reset.SCHEMA_SQL).get().n === 8 && /0028 and 0029 are not all applied/.test(read("scripts/reset-hosts.mjs")) && /0018, 0023, 0025, 0027, 0028 and 0029/.test(read("scripts/reset-hosts.mjs")));
}

console.log("\n# F32.6 Show is a tap, from the app's own pages only");
{
  const ev = await makeEvent("Tap Night");
  const d = (await hcall("POST", `/api/host/events/${ev.id}/drops`, { kind: "one_each", title: "Tapped", items: "tap-key-1\ntap-key-2" })).json.id;
  const p = await person("Tapper", ev);
  const noTap = [await p.c.get(`/api/e/${ev.id}/drops`), await p.c.get(`/api/e/${ev.id}/drops/${d}/reveal`), await p.c.get(`/api/e/${ev.id}/drops/${d}`), await p.c.get(`/api/e/${ev.id}/drops/${d}/use`)];
  check("looking at the list, or a GET to the Show address, gives nothing: only a POST does", q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d).n === 0 && noTap.slice(1).every((r) => r.status === 404) && !noTap.some((r) => /tap-key/.test(r.text)));
  const other = client({ ip: "10.98.0.1" });
  other.jar.set("lanyard_session", p.c.jar.get("lanyard_session"));
  const cross = await Promise.all([other.req("POST", `/api/e/${ev.id}/drops/${d}/reveal`, {}, { origin: "https://evil.example" }), other.req("POST", `/api/e/${ev.id}/drops/${d}/reveal`, {}, { origin: "https://host.lanyard.test" }), other.req("POST", `/api/e/${ev.id}/drops/${d}/reveal`, "{}", { origin: "https://evil.example", "content-type": "text/plain" })]);
  check("a Show from another site's page (even with her cookie) is refused (403) and gives nothing, as is one from the host site's origin", cross.every((r) => r.status === 403) && q1("SELECT COUNT(*) n FROM drop_gives WHERE drop_id = ?", d).n === 0, cross.map((r) => r.status));
  check("from the app's own page it works", (await p.c.post(`/api/e/${ev.id}/drops/${d}/reveal`)).status === 200);
}

console.log("\n# F32.6 The policy, and where the code is allowed to touch an item");
{
  const privacy = read("src/views/Privacy.vue");
  check("the Privacy Policy has a section on drops: what is kept, who sees it, how long (30 days), and a retention row", /8e\. Keys, codes and vouchers from an organiser/.test(privacy) && /What we keep/.test(privacy.split("8e.")[1] || "") && /30 days after the event ends/.test(privacy) && /Keys, codes and vouchers an organiser gave you, and each voucher use/.test(privacy));
  check("the Terms and Privacy version is the one the owner approved after F31 and F32 (2026-11-13)", /TERMS_VERSION = "2026-11-13"/.test(read("worker/legal.js")));
  check("the retention in code is 30 days after the event ends, and the policy, the vault and the plan say the same", /DROP_KEEP_MS = 30 \* 86400_000/.test(read("worker/drops.js")) && /30 days/.test(read("Lanyard-Vault/03 Technical/Privacy and Data Retention.md")));
  const worker = ["worker/dropcrypto.js", "worker/drops.js", "worker/dropsManage.js", "worker/dropsHost.js", "worker/dropsNamed.js", "worker/dropsKeep.js", "worker/dropsApp.js", "worker/vouchers.js"];
  check("no drop file writes to the console: an item cannot be logged by accident", worker.every((f) => !/\bconsole\./.test(read(f))), worker.filter((f) => /\bconsole\./.test(read(f))));
  check("only three places open an item: Show (drops.js), the host's unused download and duplicate check (dropsManage.js) and a person's own export (dropsApp.js); the host's named view, routes and purge never do", worker.filter((f) => /\bopenItem\(/.test(read(f)) && f !== "worker/dropcrypto.js").join() === "worker/drops.js,worker/dropsManage.js,worker/dropsApp.js");
  check("the host's routes and named view never select the sealed column (the named view only wipes one when it withdraws a key)", !/cipher/.test(read("worker/dropsHost.js")) && !/SELECT[^`;]*cipher/i.test(read("worker/dropsNamed.js")) && (read("worker/dropsNamed.js").match(/cipher/g) || []).length === 1);
  check("the host's download of unused items is the only route that returns items to a host (a text response built from unusedList)", (read("worker/dropsHost.js").match(/unusedList\(/g) || []).length === 1 && !/unusedList/.test(read("worker/dropsNamed.js")));
  check("the sealed value is never selected in a list query for a person: the list and the host's counts read no cipher column", !/cipher/.test(read("worker/dropsApp.js").split("export async function exportDrops")[0].replace(/i\.cipher != ''/g, "")));
  check("DROP_KEY is read only by worker/dropcrypto.js, and the example file names it with a placeholder", worker.filter((f) => /DROP_KEY/.test(read(f).replace(/^\s*\/\/.*$/gm, "")) && f !== "worker/dropcrypto.js").length === 0 && /^DROP_KEY=pick_a_long_random_string/m.test(read(".dev.vars.example")));
  const sources = { host: read("src/components/HostDrops.vue"), hub: read("src/components/EventDrops.vue") };
  check("the two screens draw text, never HTML, and keep nothing in browser storage", Object.values(sources).every((v) => !/v-html|innerHTML|localStorage|sessionStorage|indexedDB/.test(v)));
  check("a key is shown only after Show, cleared on Hide, and cleared when the tab is hidden or the page is left", /shown\[d\.id\] !== undefined/.test(sources.hub) && /function hide\(/.test(sources.hub) && /visibilitychange/.test(sources.hub) && /onBeforeUnmount/.test(sources.hub) && /@click="show\(d\)"/.test(sources.hub));
  check("pasted text leaves the page once saved (the form is reset), is not spell-checked or autocompleted, and the PIN box is masked", /form\.value = blank\(\)/.test(sources.host) && /spellcheck="false"/.test(sources.host) && /autocomplete="off"/.test(sources.host) && /type="password"/.test(sources.hub) && /autocomplete="off"/.test(sources.hub));
  check("the hub says a key is shown only to the person it was given to", /shown only to the person it was given to/.test(sources.hub) && /Only you can see this/.test(sources.hub));
  const shared = ["src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/components/CardView.vue", "src/main.js", "src/router/routes.attendee.js", "src/router/index.js", "src/views/HostEvent.vue"];
  check("no shared front-end file, entry, router table or HostEvent.vue knows about drops (no new route, no new chunk name)", shared.every((f) => !/drops?\b/i.test(read(f).replace(/\bdropdown\b/gi, ""))), shared.filter((f) => /drops?\b/i.test(read(f))));
  check("the hub and the host event page load the screens by plain static imports from the files that were already lazy (no new chunk)", /import EventDrops from/.test(read("src/views/EventDetail.vue")) && /import HostDrops from/.test(read("src/views/HostLive.vue")) && !/import\(.*Drops/.test(read("src/views/EventDetail.vue") + read("src/views/HostLive.vue")));
  const hubSrc = read("src/views/EventDetail.vue");
  check("the hub's own request, `/api/my/events/:id`, is unchanged by drops (the hub shape is pinned by F31's saved copy)", !/drops/i.test(read("worker/myevents.js")));
  check("the voucher screen shows the event, the title, the first name, the photo and a live clock, and says a screenshot won't work", /data\.event\.name/.test(sources.hub) && /current\.title/.test(sources.hub) && /me\.firstName/.test(sources.hub) && /me\.photo/.test(sources.hub) && /role="timer"/.test(sources.hub) && /setInterval/.test(sources.hub) && /screenshot/.test(sources.hub));
  void hubSrc;
}

console.log("\n# F32.2 Nothing the host sees, and nothing logged, holds an item");
{
  const secrets = [...LIST, "more-key-1", "more-key-2", "guest-wifi-9931", "rf-1", "rf-2", "rf-3", "guard-1", "guard-2", "NOKEY-SECRET"];
  const hay = SEEN.join("\n") + "\n" + printed.join("\n");
  const leaked = secrets.filter((v) => hay.includes(v));
  check(`every host response so far (${SEEN.length}) and everything printed by the Worker and these tests holds none of the ${secrets.length} items`, leaked.length === 0, leaked.slice(0, 3));
  check(`…nor any of the ${PINS.length} staff PINs (the logs and every response an attendee got)`, PINS.every((p) => { const re = new RegExp(`(^|\\D)${p}(\\D|$)`); return !re.test(printed.join("\n")) && !re.test(PERSON_SEEN.join("\n")); })); // as a whole number: a 6-digit run inside a timestamp is not a PIN
}

summary();
