// F32: drops for codes, keys and vouchers. Offline: the real Worker on in-memory SQLite (test/harness.mjs).
// Each section below belongs to one task of the plan; the later sections are added with their task.
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, becomeHost, migrationFiles, readMigration } from "./harness.mjs";
import { sealItem, openItem, pinMac, sameMac, dropsReady } from "../worker/dropcrypto.js";
import { createDrop, revealItem, readItems, MAX_ITEMS } from "../worker/drops.js";

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

summary();
