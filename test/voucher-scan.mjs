// F40: voucher QR codes and the staff scanner link. Offline: the real Worker on in-memory SQLite (test/harness.mjs).
import { readFileSync } from "node:fs";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";
import { readScan, scanWindow, SCAN_GRACE_MS } from "../worker/voucherScan.js";

const T = await makeEnv({ DROP_KEY: "test-drop-key-0123456789-abcdefghijklmnop" });
const { env, client, q1 } = T;
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

const H = client({ ip: "10.95.0.1", site: "host" });
const hostInfo = await becomeHost(H, { kind: "company", name: "Scan Co", email: "scan@company.example.com" });
env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 20, 0, 't', ?)").run("cr-scan", hostInfo.org.json.id, Date.now());
async function makeEvent(name, extra = {}) {
  const r = await H.post("/api/host/events", { name, ...extra });
  if (r.status !== 201) throw new Error("event: " + r.text);
  return r.json;
}
let ipN = 0;
async function person(name, ev) {
  ipN += 1;
  const c = client({ ip: `10.96.0.${ipN}` });
  await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  const r = await c.post(`/api/e/${ev.code}/checkin`, { acceptTerms: true, over18: true });
  if (r.status !== 200) throw new Error("checkin: " + r.text);
  return { c, id: (await c.get("/api/me")).json.user.id, name };
}

console.log("\n# Reading what was scanned");
{
  check("a voucher QR gives its drop and code", JSON.stringify(readScan("lanyard-voucher:abc123def4:012345")) === JSON.stringify({ dropId: "abc123def4", code: "012345" }));
  check("typed digits work with spaces or a dash", readScan("012 345").code === "012345" && readScan("012-345").code === "012345");
  check("anything else is not a voucher", readScan("https://lanyd.fyi/c/abc") === null && readScan("12345") === null && readScan("") === null);
  const ev = { starts_at: 1_000_000_000_000, ends_at: 1_000_000_000_000 + 3600_000, created_at: 1 };
  const w = scanWindow({}, ev);
  check("the link works from 15 minutes before the event to 15 minutes after it", w.from === ev.starts_at - SCAN_GRACE_MS && w.until === ev.ends_at + SCAN_GRACE_MS);
  const wv = scanWindow({ valid_from: ev.starts_at + 7200_000, valid_until: ev.starts_at + 9000_000 }, ev);
  check("…or the voucher's own times, when it has them", wv.from === ev.starts_at + 7200_000 - SCAN_GRACE_MS && wv.until === ev.starts_at + 9000_000 + SCAN_GRACE_MS);
}

const now = Date.now();
const ev = await makeEvent("Scan Night", { startsAt: now - 3600_000, endsAt: now + 3600_000 });
const base = `/api/host/events/${ev.id}/drops`;
const lunch = (await H.post(base, { kind: "voucher", title: "Lunch", perPerson: 1 })).json.id;
const coffee = (await H.post(base, { kind: "voucher", title: "Coffee", perPerson: 2 })).json.id;
const ann = await person("Ann Scanned", ev), ben = await person("Ben Scanned", ev), cat = await person("Cat Unopened", ev);
const staff = client({ ip: "10.97.0.1", site: "host" }); // no account

console.log("\n# A person's voucher code");
let annLunch, annCoffee;
{
  const r = await ann.c.post(`/api/e/${ev.id}/drops/${lunch}/code`);
  annLunch = r.json;
  check("opening a voucher gives a 6-digit code and a QR that names the voucher", r.status === 200 && /^\d{6}$/.test(r.json.code) && r.json.qr === `lanyard-voucher:${lunch}:${r.json.code}`);
  check("opening it again gives the same code", (await ann.c.post(`/api/e/${ev.id}/drops/${lunch}/code`)).json.code === annLunch.code);
  annCoffee = (await ann.c.post(`/api/e/${ev.id}/drops/${coffee}/code`)).json;
  check("each voucher has its own code", annCoffee.code !== annLunch.code);
  const outsider = client({ ip: "10.97.0.9" });
  await outsider.post("/api/profile", { name: "Out Sider", acceptTerms: true, over18: true });
  check("someone who did not check in gets no code (403)", (await outsider.post(`/api/e/${ev.id}/drops/${lunch}/code`)).status === 403);
  const list = (await ann.c.get(`/api/e/${ev.id}/drops`)).json;
  check("the voucher screen has her full name", list.me.name === "Ann Scanned");
}

console.log("\n# The host makes a scanner link");
let token;
{
  const before = (await H.get(base)).json.drops.find((d) => d.id === lunch);
  check("the host sees who checked in and who opened it, and that no link is out yet", before.checkedIn === 3 && before.opened === 1 && before.people === 0 && before.scanner === null);
  const r = await H.post(`${base}/${lunch}/scanner`);
  token = r.json.url?.split("/scan/")[1];
  check("a link is made, on the host site, with its window", r.status === 200 && /\/scan\/[0-9a-f]{64}$/.test(r.json.url) && r.json.from < now && r.json.until > now);
  check("only a hash of the link is kept", !JSON.stringify(q1("SELECT * FROM voucher_scanners WHERE drop_id = ?", lunch)).includes(token));
  check("the host's list shows a link is out, but never the link", (await H.get(base)).json.drops.find((d) => d.id === lunch).scanner?.since > 0 && !(await H.get(base)).text.includes(token));
  check("an item drop has no scanner (400)", (await H.post(`${base}/${(await H.post(base, { kind: "same", title: "Wifi", value: "pw-123" })).json.id}/scanner`)).status === 400);
}

console.log("\n# Staff scan with the link (no account)");
const scan = (code, t = token) => staff.post(`/api/host/scan/${t}`, { code });
{
  const v = await staff.get(`/api/host/scan/${token}`);
  check("the scanner page opens with no account: the voucher, the event and the figures", v.status === 200 && v.json.voucher.title === "Lunch" && v.json.event.name === "Scan Night" && v.json.stats.checkedIn === 3 && v.json.history.length === 0);
  const ok = await scan(annLunch.qr);
  check("scanning her QR marks it used and shows her name", ok.status === 200 && ok.json.person.name === "Ann Scanned" && ok.json.left === 0 && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ? AND user_id = ?", lunch, ann.id).n === 1);
  const again = await scan(annLunch.code);
  check("scanning it again (or typing the digits) says already used, and still shows who it is", again.status === 409 && again.json.code === "already_used" && again.json.person.name === "Ann Scanned" && again.json.lastUsedAt > 0);
  const wrong = await scan(annCoffee.qr);
  check("her Coffee QR at the Lunch scanner is the wrong voucher and marks nothing", wrong.status === 409 && wrong.json.code === "wrong_voucher" && /Coffee/.test(wrong.json.error) && q1("SELECT COUNT(*) n FROM voucher_uses WHERE drop_id = ?", coffee).n === 0);
  const wrongTyped = await scan(annCoffee.code);
  check("…and so are its typed digits", wrongTyped.status === 409 && wrongTyped.json.code === "wrong_voucher");
  check("a code nobody has is refused (404)", (await scan(annLunch.code === "000000" ? "111111" : "000000")).json.code === "no_such_code");
  check("something that isn't a voucher is refused (400)", (await scan("https://example.com")).status === 400);
  const benCode = (await ben.c.post(`/api/e/${ev.id}/drops/${lunch}/code`)).json;
  check("a second person scans fine", (await scan(benCode.code)).status === 200);
  const v2 = await staff.get(`/api/host/scan/${token}`);
  check("the history lists both, newest first, and the figures count them", v2.json.history.length === 2 && v2.json.history[0].name === "Ben Scanned" && v2.json.stats.scanned === 2 && v2.json.stats.opened === 2);
  const h = (await H.get(base)).json.drops.find((d) => d.id === lunch);
  check("the host sees 2 of 3 scanned and 2 opened", h.people === 2 && h.opened === 2 && h.checkedIn === 3);
  check("a made-up link is refused (404)", (await staff.get(`/api/host/scan/${"a".repeat(64)}`)).status === 404 && (await scan(annLunch.code, "b".repeat(64))).status === 404);
}

console.log("\n# Replacing, stopping and the window");
{
  const r2 = await H.post(`${base}/${lunch}/scanner`);
  const t2 = r2.json.url.split("/scan/")[1];
  check("a new link replaces the old one at once", (await staff.get(`/api/host/scan/${token}`)).status === 404 && (await staff.get(`/api/host/scan/${t2}`)).status === 200);
  await H.req("DELETE", `${base}/${lunch}/scanner`);
  check("a stopped link is refused", (await staff.get(`/api/host/scan/${t2}`)).status === 404);
  const t3 = (await H.post(`${base}/${coffee}/scanner`)).json.url.split("/scan/")[1];
  env.DB.raw.prepare("UPDATE drops SET valid_until = ? WHERE id = ?").run(Date.now() - SCAN_GRACE_MS - 1000, coffee);
  check("15 minutes after the voucher ends the link has expired (410)", (await staff.get(`/api/host/scan/${t3}`)).status === 410);
  env.DB.raw.prepare("UPDATE drops SET valid_from = ?, valid_until = ? WHERE id = ?").run(Date.now() + 3600_000, Date.now() + 7200_000, coffee);
  const early = await staff.get(`/api/host/scan/${t3}`);
  check("before its 15 minutes start, the link says when it opens and shows no names", early.status === 200 && early.json.early === true && !("history" in early.json));
  check("…and a scan is refused", (await staff.post(`/api/host/scan/${t3}`, { code: annCoffee.code })).json.code === "early");
  env.DB.raw.prepare("UPDATE drops SET valid_from = ?, valid_until = ? WHERE id = ?").run(Date.now() + 5 * 60_000, Date.now() + 7200_000, coffee);
  const soon = await staff.post(`/api/host/scan/${t3}`, { code: annCoffee.code });
  check("inside the 15 minutes before it starts, the link opens but the voucher itself is not open yet", soon.status === 409 && soon.json.code === "not_yet" && soon.json.person.name === "Ann Scanned");
}

console.log("\n# Leaving the event, and the screens");
{
  const catCode = (await cat.c.post(`/api/e/${ev.id}/drops/${lunch}/code`)).json.code;
  await cat.c.req("DELETE", `/api/my/events/${ev.id}`);
  check("leaving the event deletes the person's voucher codes", q1("SELECT COUNT(*) n FROM voucher_codes WHERE user_id = ?", cat.id).n === 0 && !!catCode);
  const hub = read("src/components/EventDrops.vue"), host = read("src/components/HostDrops.vue"), page = read("src/views/HostScanner.vue");
  check("the voucher screen is a centred dialog with the QR, the 6 digits, the name and the photo, and no PIN box", /modal/.test(hub) && /drawQR/.test(hub) && /data-code/.test(hub) && /me\.name/.test(hub) && !/type="password"/.test(hub));
  check("the host panel makes and stops scanner links and shows opened and scanned", /\/scanner`, "POST"/.test(host) && /\/scanner`, "DELETE"/.test(host) && /Opened it/.test(host) && !/Staff PIN/.test(host));
  check("the scanner page uses the camera, hides each result after about a second, and lists the history", /startScanner/.test(page) && /show\(\{ kind: "ok"[^]*?, 1[0-9]{3}\)/.test(page) && /data-history/.test(page));
  check("the scanner route is on the host site", /\/scan\/:token/.test(read("src/router/routes.host.js")));
}

summary();
