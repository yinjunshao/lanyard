// F66 (D061): company branding on paid events. The real Worker on in-memory SQLite and the Map-backed R2 stand-in.
// Each line of the security and privacy bar in the plan note has a section here, with its negatives.
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { makeEnv, makeDb, migrationFiles, readMigration, check, summary, becomeHost, PNG } from "./harness.mjs";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const ADMIN = "test-admin-token-f66";
const { env, client, q, q1 } = await makeEnv({ ADMIN_TOKEN: ADMIN });

/* ------------------------------ pictures ------------------------------ */
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const be = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(type, data) {
  const t = Buffer.from(type, "latin1");
  const body = Buffer.concat([t, Buffer.from(data)]);
  return Buffer.concat([Buffer.from(be(data.length)), body, Buffer.from(be(crc32(body)))]);
}
// A real PNG: w x h, one colour, optional extra chunks (a tEXt with HTML in it, a big padding chunk).
function png(w, h, { text = null, pad = 0 } = {}) {
  const ihdr = [...be(w), ...be(h), 8, 2, 0, 0, 0];
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set([196, 68, 30], y * (w * 3 + 1) + 1 + x * 3);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr)];
  if (text) parts.push(chunk("tEXt", Buffer.from(`Comment\0${text}`, "latin1")));
  if (pad) parts.push(chunk("pAdD", Buffer.alloc(pad, 7)));
  parts.push(chunk("IDAT", deflateSync(rows)), chunk("IEND", []));
  return Buffer.concat(parts);
}
const dataUrl = (bytes, type = "image/png") => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
const LOGO = dataUrl(png(64, 32, { text: "<script>alert(1)</script>" }));

/* ------------------------------ people ------------------------------ */
let ipN = 0;
const ip = () => `10.66.${Math.floor(++ipN / 200)}.${(ipN % 200) + 1}`;
async function hostOf(name, extra = {}) {
  const c = client({ site: "host", ip: ip() });
  const r = await becomeHost(c, { kind: "company", name, ...extra });
  const me = (await c.get("/api/host/me")).json;
  // Plenty of bought event credits (granted_by 'polar', as a paid order grants them), so every event a test makes is paid unless
  // it is a society's free one. The starter credit a new host gets runs out sooner, so it would be spent first and that event
  // would not be paid (only bought credits count, 2026-11-25); it is removed here, and the starter case is tested on its own.
  q("DELETE FROM credits WHERE org_id = ?", me.org.id);
  q("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, 50, 0, NULL, 'card:test', 'polar', 1)", "t" + me.org.id, me.org.id);
  return Object.assign(c, { org: me.org, email: r.email });
}
async function person(name) {
  const c = client({ ip: ip() });
  await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  return c;
}

const A = await hostOf("Acme Ltd");
const B = await hostOf("Other Co");
const brandPath = (org, rest = "") => `/api/host/orgs/${org.id}/brand${rest}`;

console.log("\n# The migration is additive and safe before the new code");
{
  const files = migrationFiles();
  check("0044 follows 0043 and is the newest but two (0045, F70, and 0046, F74, follow it)", files.indexOf("0044_host_branding.sql") === files.indexOf("0043_event_strap_ink.sql") + 1 && files.at(-3) === "0044_host_branding.sql" && files.at(-2) === "0045_metrics_daily.sql" && files.at(-1) === "0046_admin_made_profiles.sql");
  const sql = readMigration("0044_host_branding.sql").replace(/--.*$/gm, "");
  check("it only adds columns (with defaults where NOT NULL), one table and two triggers; it drops, updates and deletes nothing", !/\bDROP\b|DELETE FROM|\bUPDATE \w+ SET|RENAME/i.test(sql) && (sql.match(/CREATE TABLE/g) || []).length === 1 && (sql.match(/CREATE TRIGGER/g) || []).length === 2 && (sql.match(/ALTER TABLE \w+ ADD COLUMN/g) || []).length === 5 && /use_branding INTEGER NOT NULL DEFAULT 1/.test(sql) && /brand_off INTEGER NOT NULL DEFAULT 0/.test(sql));
  const old = makeDb({ before: "0044" });
  old.raw.prepare("INSERT INTO orgs (id, name, org_type, verification_status, created_at) VALUES ('o1', 'Old Org', 'company', 'approved', 1)").run();
  old.raw.prepare("INSERT INTO events (id, org_id, code, name, theme, is_paid, created_at) VALUES ('e1', 'o1', 'ABCDE', 'Old', 'night', 1, 1)").run();
  old.raw.exec(readMigration("0044_host_branding.sql"));
  const o = old.raw.prepare("SELECT * FROM orgs WHERE id = 'o1'").get(), e = old.raw.prepare("SELECT * FROM events WHERE id = 'e1'").get();
  check("an existing organisation has no branding and is not switched off; an existing event keeps every value, switch on", o.brand_name === null && o.brand_logo_key === null && o.brand_logo_version === null && o.brand_off === 0 && o.name === "Old Org" && e.use_branding === 1 && e.theme === "night" && e.is_paid === 1);
  check("the older code's statements (without the columns) still work", (() => { try { old.raw.prepare("INSERT INTO events (id, org_id, code, name, created_at) VALUES ('e2', 'o1', 'ABCDF', 'Older', 1)").run(); old.raw.prepare("DELETE FROM orgs WHERE id = 'o1'").run(); return true; } catch (x) { return x.message; } })() === true);
  check("deleting an organisation with no logo queues nothing", old.raw.prepare("SELECT COUNT(*) n FROM media_deletes").get().n === 0);
}

console.log("\n# An event is paid when it spends a credit (events.is_paid)");
{
  const ev = await A.post("/api/host/events", { name: "Paid night" });
  check("a company's event made with a credit is paid", ev.status === 201 && q1("SELECT is_paid FROM events WHERE id = ?", ev.json.id).is_paid === 1);
  const S = await hostOf("Club Org");
  q("UPDATE orgs SET org_type = 'society' WHERE id = ?", S.org.id);
  const free = await S.post("/api/host/events", { name: "Free social" });
  const paid = await S.post("/api/host/events", { name: "Second social" });
  check("a society's free event of the week is not paid; its next one, which spends a credit, is", free.status === 201 && paid.status === 201 && q1("SELECT is_paid FROM events WHERE id = ?", free.json.id).is_paid === 0 && q1("SELECT is_paid FROM events WHERE id = ?", paid.json.id).is_paid === 1);
  const dup = await A.post(`/api/host/events/${ev.json.id}/duplicate`, { name: "Paid again" });
  check("a copy spends a credit, so it is paid too", dup.status === 201 && q1("SELECT is_paid FROM events WHERE id = ?", dup.json.id).is_paid === 1);
  const sneaky = await A.post("/api/host/events", { name: "Sneaky", isPaid: false, is_paid: 0 });
  const sneakyS = await S.post("/api/host/events", { name: "Sneaky free", isPaid: true, is_paid: 1 });
  check("is_paid comes from the credit rule in the same INSERT, never from the request", /CASE WHEN \$\{freeWeekNow\} THEN 0 WHEN \(SELECT granted_by FROM credits WHERE id = \(\$\{nextCredit\}\)\) = 'polar' THEN 1 ELSE 0 END/.test(read("worker/hosts.js")) && q1("SELECT is_paid FROM events WHERE id = ?", sneaky.json.id).is_paid === 1 && q1("SELECT is_paid FROM events WHERE id = ?", sneakyS.json.id).is_paid === 1);
  // Only a bought credit makes an event paid (the owner's decision, 2026-11-25): a starter or promo credit spends, but is not paid.
  for (const [label, by, reason] of [["a starter credit", "self-serve", "starter"], ["a promo credit", "promo", "promo:TEST"]]) {
    const H = await hostOf(`Unpaid ${by} Org`);
    q("DELETE FROM credits WHERE org_id = ?", H.org.id);
    q("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, 1, 0, NULL, ?, ?, 1)", "u" + H.org.id, H.org.id, reason, by);
    const e = await H.post("/api/host/events", { name: `On ${by}` });
    check(`an event made with ${label} spends it but is not paid`, e.status === 201 && q1("SELECT is_paid FROM events WHERE id = ?", e.json.id).is_paid === 0 && q1("SELECT events_used FROM credits WHERE id = ?", "u" + H.org.id).events_used === 1);
  }
  {
    // Both kinds: the credit that runs out first is spent first, and the event is paid only when that one was bought.
    const H = await hostOf("Mixed credits Org");
    q("DELETE FROM credits WHERE org_id = ?", H.org.id);
    q("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, 1, 0, ?, 'starter', 'self-serve', 1)", "ms" + H.org.id, H.org.id, Date.now() + 86400000);
    q("INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (?, ?, 1, 0, NULL, 'card:test', 'polar', 1)", "mp" + H.org.id, H.org.id);
    const before = (await H.get("/api/host/me")).json.credits.nextBought;
    const first = await H.post("/api/host/events", { name: "Starter first" });
    const between = (await H.get("/api/host/me")).json.credits.nextBought;
    const second = await H.post("/api/host/events", { name: "Bought second" });
    check("with a starter and a bought credit, the first event spends the starter (not paid) and the next the bought one (paid)",
      q1("SELECT is_paid FROM events WHERE id = ?", first.json.id).is_paid === 0 && q1("SELECT is_paid FROM events WHERE id = ?", second.json.id).is_paid === 1 &&
      q1("SELECT events_used FROM credits WHERE id = ?", "ms" + H.org.id).events_used === 1 && q1("SELECT events_used FROM credits WHERE id = ?", "mp" + H.org.id).events_used === 1);
    check("/api/host/me says whether the next event spends a bought credit, so Create can offer branding: no before the starter is used, yes after", before === false && between === true, [before, between]);
  }
  Object.assign(globalThis, { SOCIETY: S, SOC_FREE: free.json, SOC_PAID: paid.json });
}

console.log("\n# Roles: only the owner changes branding; staff 403, another organisation 404, signed out 401, attendees refused");
{
  const inv = await A.post("/api/host/team/invite", {});
  const staff = client({ site: "host", ip: ip() });
  const st = await becomeHost(staff, { kind: null });
  const joined = await staff.post("/api/host/team/join", { code: inv.json.code });
  check("a colleague joins as staff", joined.status === 200 && q1("SELECT m.role FROM host_org_members m JOIN host_accounts a ON a.id = m.host_account_id WHERE m.org_id = ? AND a.email = ?", A.org.id, st.email)?.role === "staff");
  const sr = await staff.get(brandPath(A.org));
  check("staff can read the settings (canEdit false)", sr.status === 200 && sr.json.canEdit === false && sr.json.defaultName === "Acme Ltd");
  const s1 = await staff.put(brandPath(A.org), { name: "Staff Name" });
  const s2 = await staff.post(brandPath(A.org, "/logo"), { dataUrl: LOGO });
  const s3 = await staff.del(brandPath(A.org, "/logo"));
  check("staff get 403 setting the name, uploading and removing the logo, and nothing changes", [s1, s2, s3].every((r) => r.status === 403 && r.json.code === "not_owner") && q1("SELECT brand_name, brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_name === null && ![...env.MEDIA.store.keys()].some((k) => k.startsWith("logo/")));
  const b = [await B.get(brandPath(A.org)), await B.put(brandPath(A.org), { name: "Hijack" }), await B.post(brandPath(A.org, "/logo"), { dataUrl: LOGO }), await B.del(brandPath(A.org, "/logo"))];
  check("another organisation's host gets 404 reading, naming, uploading and removing, and sees nothing of A", b.every((r) => r.status === 404) && !b.some((r) => /Acme/.test(r.text)) && q1("SELECT brand_name FROM orgs WHERE id = ?", A.org.id).brand_name === null);
  const out = client({ site: "host", ip: ip() });
  const o = [await out.get(brandPath(A.org)), await out.put(brandPath(A.org), { name: "X" }), await out.post(brandPath(A.org, "/logo"), { dataUrl: LOGO }), await out.del(brandPath(A.org, "/logo"))];
  check("signed out: 401 on every route", o.every((r) => r.status === 401), o.map((r) => r.status));
  const att = await person("Ada Attendee");
  const onMain = await att.put(brandPath(A.org), { name: "X" });
  const withCookie = await att.req("PUT", `https://host.lanyard.test${brandPath(A.org)}`, { name: "X" }, { origin: "https://host.lanyard.test" });
  check("an attendee session is refused: on the main site 403 wrong_site, its cookie sent to the host site 401", onMain.status === 403 && onMain.json.code === "wrong_site" && withCookie.status === 401 && q1("SELECT brand_name FROM orgs WHERE id = ?", A.org.id).brand_name === null);
  const own = await A.get(brandPath(A.org));
  check("the owner reads them with canEdit, the organisation's name as the default and no logo", own.status === 200 && own.json.canEdit === true && own.json.name === "" && own.json.logo === null && own.json.has === false);
}

console.log("\n# The display name: 60 characters, cleaned, kept as text");
{
  const r = await A.put(brandPath(A.org), { name: "  Acme​ Careers‮\u0007 " });
  check("control, zero-width and direction-changing characters are removed and the ends trimmed", r.status === 200 && r.json.name === "Acme Careers" && q1("SELECT brand_name FROM orgs WHERE id = ?", A.org.id).brand_name === "Acme Careers", r.json);
  check("61 characters are refused with 400; 60 are kept", (await A.put(brandPath(A.org), { name: "x".repeat(61) })).status === 400 && (await A.put(brandPath(A.org), { name: "y".repeat(60) })).json.name === "y".repeat(60));
  check("a name that is not text is 400", (await A.put(brandPath(A.org), { name: 5 })).status === 400 && (await A.put(brandPath(A.org), {})).status === 400);
  const x = await A.put(brandPath(A.org), { name: "<script>alert(1)</script>" });
  check("markup is kept as the characters typed (the pages show it as text, tested in F66.3)", x.json.name === "<script>alert(1)</script>");
  check("an empty name clears it (the organisation's name is the default)", (await A.put(brandPath(A.org), { name: "   " })).json.name === "" && q1("SELECT brand_name FROM orgs WHERE id = ?", A.org.id).brand_name === null);
  await A.put(brandPath(A.org), { name: "Acme Careers" });
}

console.log("\n# Logo types: PNG, JPEG or WebP by their bytes; 1 MB; 1024 px");
{
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'><rect width='9' height='9'/></svg>";
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const cases = {
    "an SVG": dataUrl(Buffer.from(svg), "image/svg+xml"),
    "an SVG declared as PNG": dataUrl(Buffer.from(svg), "image/png"),
    "a GIF": dataUrl(gif, "image/gif"),
    "a GIF declared as PNG": dataUrl(gif, "image/png"),
    "HTML declared as PNG": dataUrl(Buffer.from("<!doctype html><script>alert(1)</script>"), "image/png"),
    "a PNG-named file holding HTML": dataUrl(Buffer.from("<html><body onload=alert(1)>"), "image/png"),
    "PNG bytes declared as JPEG (a polyglot)": dataUrl(png(8, 8), "image/jpeg"),
    "PNG bytes declared as WebP": dataUrl(png(8, 8), "image/webp"),
    "PNG bytes declared as SVG": dataUrl(png(8, 8), "image/svg+xml"),
    "PNG bytes declared as text/html": dataUrl(png(8, 8), "text/html"),
    "not a data URL": "https://example.com/logo.png",
  };
  for (const [name, url] of Object.entries(cases)) {
    const r = await A.post(brandPath(A.org, "/logo"), { dataUrl: url });
    check(`${name} is refused with 400`, r.status === 400, [r.status, r.json]);
  }
  const big = png(64, 64, { pad: 1024 * 1024 + 10 });
  const r1 = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(big) });
  const two = png(64, 64, { pad: 2 * 1024 * 1024 });
  const r2 = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(two) });
  check("a PNG just over 1 MB and a 2 MB PNG are refused with 400", r1.status === 400 && r1.json.code === "logo_large" && r2.status === 400 && r2.json.code === "logo_large", [r1.status, r2.status]);
  const wide = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(1025, 4)) });
  const tall = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(4, 1100)) });
  check("a picture over 1024 px on its longest side is refused with 400 (the host page shrinks one first)", wide.status === 400 && wide.json.code === "logo_side" && tall.status === 400);
  check("nothing refused reached R2", ![...env.MEDIA.store.keys()].some((k) => k.startsWith("logo/")));
  const edge = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(1024, 2)) });
  check("1024 px is allowed", edge.status === 201);
  const ok = await A.post(brandPath(A.org, "/logo"), { dataUrl: LOGO });
  const key = q1("SELECT brand_logo_key, brand_logo_version FROM orgs WHERE id = ?", A.org.id);
  const stored = env.MEDIA.store.get(key.brand_logo_key);
  check("a PNG is stored in R2 under the organisation, with its real type and a new version", ok.status === 201 && new RegExp(`^logo/${A.org.id}/[0-9a-f]{20}\\.png$`).test(key.brand_logo_key) && stored?.httpMetadata.contentType === "image/png" && key.brand_logo_version === 2 && ok.json.logo === `/media/${key.brand_logo_key}?v=2`, key);
  check("its text chunk (with the HTML in it) is removed before it is stored", !Buffer.from(stored.bytes).includes("script") && Buffer.from(stored.bytes).subarray(1, 4).toString() === "PNG");
  check("the 1024 px one it replaced is gone from R2 at once, and nothing is left queued", [...env.MEDIA.store.keys()].filter((k) => k.startsWith("logo/")).length === 1 && q1("SELECT COUNT(*) n FROM media_deletes").n === 0);
  const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z", "base64");
  const webp = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");
  const { imageSize } = await import("../worker/media.js");
  check("the size is read from a JPEG and a WebP header too", JSON.stringify(imageSize(jpeg, "jpg")) === '{"h":1,"w":1}' && JSON.stringify(imageSize(webp, "webp")) === '{"w":1,"h":1}' && JSON.stringify(imageSize(png(30, 20), "png")) === '{"w":30,"h":20}');
  Object.assign(globalThis, { KEY1: key.brand_logo_key });
}

console.log("\n# Paid events only: a free event never shows branding, on any response");
{
  const S = globalThis.SOCIETY;
  await S.put(brandPath(S.org), { name: "Club Brand" });
  await S.post(brandPath(S.org, "/logo"), { dataUrl: LOGO });
  const live = async (H, id) => (await H.get(`/api/host/events/${id}/live`)).json;
  const freeLive = await live(S, globalThis.SOC_FREE.id), paidLive = await live(S, globalThis.SOC_PAID.id);
  check("the free event has use_branding 1 and the organisation has a name and a logo", q1("SELECT use_branding FROM events WHERE id = ?", globalThis.SOC_FREE.id).use_branding === 1 && q1("SELECT brand_name, brand_logo_key FROM orgs WHERE id = ?", S.org.id).brand_logo_key);
  const watcher = await person("Wendy Watcher");
  const freePub = await watcher.get(`/api/e/${freeLive.event.code}`);
  await watcher.post(`/api/e/${freeLive.event.code}/checkin`, {});
  const freeHub = await watcher.get(`/api/my/events/${globalThis.SOC_FREE.id}`);
  const noBrand = (r) => !("brand" in (r.json.event || {})) && !("brand" in r.json) && !/Club Brand|logo\//.test(r.text);
  check("the free event's public page, its hub and the host's live view (Present and print) carry no brand fields", [freePub, freeHub].every(noBrand) && !("brand" in freeLive) && !/Club Brand|logo\//.test(JSON.stringify(freeLive)), [freePub.json.event?.brand, freeHub.json.event?.brand, freeLive.brand]);
  const paidPub = await watcher.get(`/api/e/${paidLive.event.code}`);
  await watcher.post(`/api/e/${paidLive.event.code}/checkin`, {});
  const paidHub = await watcher.get(`/api/my/events/${globalThis.SOC_PAID.id}`);
  const logo = q1("SELECT brand_logo_key, brand_logo_version v FROM orgs WHERE id = ?", S.org.id);
  const want = JSON.stringify({ name: "Club Brand", logo: `/media/${logo.brand_logo_key}?v=${logo.v}` });
  check("the same organisation's paid event carries exactly { name, logo } on the public page, the hub and the live view", JSON.stringify(paidPub.json.event.brand) === want && JSON.stringify(paidHub.json.event.brand) === want && JSON.stringify(paidLive.brand) === want, [paidPub.json.event.brand, paidHub.json.event.brand, paidLive.brand]);
  const offSwitch = await S.put(`/api/host/events/${globalThis.SOC_PAID.id}`, { useBranding: false });
  check("the host's per-event switch off: the paid event goes back to the Lanyard look everywhere", offSwitch.status === 200 && q1("SELECT use_branding FROM events WHERE id = ?", globalThis.SOC_PAID.id).use_branding === 0 && noBrand(await watcher.get(`/api/e/${paidLive.event.code}`)) && noBrand(await watcher.get(`/api/my/events/${globalThis.SOC_PAID.id}`)) && !("brand" in await live(S, globalThis.SOC_PAID.id)));
  await S.put(`/api/host/events/${globalThis.SOC_PAID.id}`, { useBranding: true });
  check("…and on again", JSON.stringify((await watcher.get(`/api/e/${paidLive.event.code}`)).json.event.brand) === want);
  check("an edit that does not mention the switch leaves it alone", (await S.put(`/api/host/events/${globalThis.SOC_PAID.id}`, { name: "Second social!" })).status === 200 && q1("SELECT use_branding FROM events WHERE id = ?", globalThis.SOC_PAID.id).use_branding === 1);
  const made = await A.post("/api/host/events", { name: "Off from the start", useBranding: false });
  check("an event made with the switch off keeps it off, and a copy of it too", q1("SELECT use_branding FROM events WHERE id = ?", made.json.id).use_branding === 0 && q1("SELECT use_branding FROM events WHERE id = ?", (await A.post(`/api/host/events/${made.json.id}/duplicate`, {})).json.id).use_branding === 0);
  // An organisation with a logo but no name: the organisation's name goes with the logo (its alt text).
  await S.put(brandPath(S.org), { name: "" });
  check("with no display name the organisation's own name is used", (await watcher.get(`/api/e/${paidLive.event.code}`)).json.event.brand.name === "Club Org");
  await S.del(brandPath(S.org, "/logo"));
  check("with neither a name nor a logo there is no brand at all", noBrand(await watcher.get(`/api/e/${paidLive.event.code}`)));
  await S.put(brandPath(S.org), { name: "Club Brand" });
  Object.assign(globalThis, { WATCHER: watcher, PAID_CODE: paidLive.event.code });
}

console.log("\n# Serving the logo: real type, nosniff, no HTML, a long cache only once it is public");
{
  // Logos are public by nature once they are on a public page. Until then, only the organisation's own hosts see one.
  await B.put(brandPath(B.org), { name: "Other Brand" });
  await B.post(brandPath(B.org, "/logo"), { dataUrl: dataUrl(png(16, 16)) });
  const bKey = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", B.org.id).brand_logo_key;
  const anon = client({ ip: ip() });
  check("B has no event yet: a stranger gets 404 for its logo, by its exact key", (await anon.get(`/media/${bKey}?v=1`)).status === 404);
  const mine = await B.get(`/media/${bKey}?v=1`);
  check("…while B's own host, on the host site, gets it privately (the settings preview)", mine.status === 200 && mine.headers.get("cache-control") === "private, max-age=3600" && mine.headers.get("content-type") === "image/png");
  check("A's host, asking for B's logo by its exact key, gets 404", (await A.get(`/media/${bKey}?v=1`)).status === 404);
  await B.post("/api/host/events", { name: "B unbranded", useBranding: false });
  check("a paid event of B's with branding off does not make it public", (await anon.get(`/media/${bKey}`)).status === 404);
  const key = globalThis.KEY1;
  check("A has a paid event with branding on", !!q1("SELECT id FROM events WHERE org_id = ? AND is_paid = 1 AND use_branding = 1 LIMIT 1", A.org.id));
  const pub = await anon.get(`/media/${key}?v=2`);
  check("A's logo is public: 200 with its real content type and nosniff", pub.status === 200 && pub.headers.get("content-type") === "image/png" && pub.headers.get("x-content-type-options") === "nosniff");
  check("never served as HTML or a download: no Content-Disposition, a sandbox CSP, same-origin resource policy", !pub.headers.get("content-disposition") && /sandbox/.test(pub.headers.get("content-security-policy")) && pub.headers.get("cross-origin-resource-policy") === "same-origin" && !/html/.test(pub.headers.get("content-type")));
  check("a long cache, safe because the address carries the version", pub.headers.get("cache-control") === "public, max-age=31536000, immutable");
  const guessed = await anon.get(`/media/logo/${B.org.id}/${"a".repeat(20)}.png`);
  const odd = await anon.get(`/media/${key.replace(".png", ".svg")}`);
  const up = await anon.get(`/media/logo/${A.org.id}/..%2F..%2Favatar%2Fx.png`);
  check("a guessed key, another extension and a traversal are each a 404", [guessed, odd, up].every((r) => r.status === 404), [guessed.status, odd.status, up.status]);
  Object.assign(globalThis, { BKEY: bKey });
}

console.log("\n# Admin: view, remove and switch off, in the audit log; nobody else");
{
  const adm = client({ ip: ip() });
  const H = { authorization: `Bearer ${ADMIN}` };
  const list = await adm.get("/api/admin/brands", H);
  const a = list.json.brands.find((x) => x.id === A.org.id);
  check("the admin lists organisations with branding: name, display name, logo, switched off, paid branded events", list.status === 200 && a.name === "Acme Ltd" && a.brandName === "Acme Careers" && a.hasLogo === true && a.off === false && a.paidBrandedEvents >= 1, a);
  const view = await adm.get(`/api/admin/orgs/${A.org.id}/brand/logo`, H);
  check("the admin sees the logo itself (not cached)", view.status === 200 && view.headers.get("content-type") === "image/png" && view.headers.get("cache-control") === "private, no-store" && view.headers.get("x-content-type-options") === "nosniff");
  const strangers = [client({ ip: ip() }), await person("Nosy Attendee")];
  const refused = [];
  for (const c of strangers) refused.push(await c.get("/api/admin/brands"), await c.del(`/api/admin/orgs/${A.org.id}/brand/logo`), await c.post(`/api/admin/orgs/${A.org.id}/brand`, { off: true }));
  refused.push(await adm.del(`/api/admin/orgs/${A.org.id}/brand/logo`, { authorization: "Bearer wrong" }), await A.get("/api/admin/brands", H), await A.del(`/api/admin/orgs/${A.org.id}/brand/logo`, H));
  check("without the admin token (signed out, an attendee, a wrong token) it is refused with 401; a host on the host site gets the host site's 401 even with the token", refused.every((r) => r.status === 401), refused.map((r) => r.status));
  check("…and nothing changed", !!q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key && q1("SELECT brand_off FROM orgs WHERE id = ?", A.org.id).brand_off === 0);
  const key = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key;
  const rm = await adm.del(`/api/admin/orgs/${A.org.id}/brand/logo`, H);
  check("the admin removes the logo: the row points at nothing and the R2 object is deleted", rm.status === 200 && rm.json.removed === true && q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key === null && !env.MEDIA.store.has(key));
  check("the audit log records it, naming the organisation", !!q1("SELECT 1 FROM admin_audit WHERE action = ?", `DELETE /api/admin/orgs/${A.org.id}/brand/logo`));
  await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(30, 30)) });
  const off = await adm.post(`/api/admin/orgs/${A.org.id}/brand`, { off: true }, H);
  check("the admin switches the organisation's branding off, and that is in the audit log", off.status === 200 && q1("SELECT brand_off FROM orgs WHERE id = ?", A.org.id).brand_off === 1 && !!q1("SELECT 1 FROM admin_audit WHERE action = ?", `POST /api/admin/orgs/${A.org.id}/brand`));
  const AE = q1("SELECT code FROM events WHERE org_id = ? AND is_paid = 1 AND use_branding = 1 LIMIT 1", A.org.id);
  const pub = await globalThis.WATCHER.get(`/api/e/${AE.code}`);
  const newKey = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key;
  check("switched off: paid events show no branding and the logo is no longer public", !("brand" in pub.json.event) && (await client({ ip: ip() }).get(`/media/${newKey}`)).status === 404);
  const hostTry = [await A.put(brandPath(A.org), { name: "Back again" }), await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(9, 9)) })];
  const settings = (await A.get(brandPath(A.org))).json;
  check("the host cannot undo it: 403 brand_off to name or upload; the settings say it is off", hostTry.every((r) => r.status === 403 && r.json.code === "brand_off") && settings.off === true);
  check("…but can still remove the logo", (await A.del(brandPath(A.org, "/logo"))).status === 200 && !env.MEDIA.store.has(newKey));
  check("the switch takes only true or false, and a made-up organisation is 404", (await adm.post(`/api/admin/orgs/${A.org.id}/brand`, { off: "yes" }, H)).status === 400 && (await adm.post("/api/admin/orgs/nope/brand", { off: true }, H)).status === 404 && (await adm.del("/api/admin/orgs/nope/brand/logo", H)).status === 404);
  await adm.post(`/api/admin/orgs/${A.org.id}/brand`, { off: false }, H);
  await A.post(brandPath(A.org, "/logo"), { dataUrl: LOGO });
  check("switched back on, branding shows again", !!(await globalThis.WATCHER.get(`/api/e/${AE.code}`)).json.event.brand?.logo);
  globalThis.KEY1 = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key;
}

console.log("\n# Isolation: the brand fields only in the host's own settings and paid, branded events' public responses");
{
  const meA = (await A.get("/api/host/me")).json, meB = (await B.get("/api/host/me")).json;
  check("each host's /me has its own organisation's settings and nothing of the other's", meA.brand.name === "Acme Careers" && meB.brand.name === "Other Brand" && !JSON.stringify(meB).includes("Acme Careers") && !JSON.stringify(meA).includes("Other Brand") && !JSON.stringify(meB).includes(`logo/${A.org.id}`));
  check("each event on /me says whether its switch is on", meA.events.length > 0 && meA.events.every((e) => typeof e.useBranding === "boolean"));
  const bLive = await B.get(`/api/host/events/${meB.events[0].id}/live`);
  check("B's live view never carries A's branding", bLive.status === 200 && !bLive.text.includes("Acme Careers") && !bLive.text.includes(`logo/${A.org.id}`));
  const exB = await B.get("/api/host/account/export");
  check("B's data download has B's own display name and whether it has a logo, and nothing of A's", exB.json.organisations[0].brand_name === "Other Brand" && exB.json.organisations[0].brand_logo === 1 && !exB.text.includes("Acme Careers") && !/logo\//.test(exB.text));
  const w = globalThis.WATCHER;
  const ex = await w.get("/api/account/export");
  const list = await w.get("/api/my/events");
  check("an attendee's data download and their events list carry no brand fields (only what they had before)", ex.status === 200 && !/"brand|logo\/|Club Brand|Acme Careers/.test(ex.text) && list.status === 200 && !/"brand|logo\//.test(list.text));
  const src = ["worker/events.js", "worker/myevents.js", "worker/hosts.js"].map(read).join("\n");
  check("the brand reaches a page only through eventBrand (paid, branding on), in the three event responses", (src.match(/await eventBrand\(/g) || []).length === 3 && /\.\.\.\(brand \? \{ brand \} : \{\}\)/.test(read("worker/events.js")));
}

console.log("\n# Replacing and removing delete the old object; so does deleting the organisation");
{
  // Uploads are limited to 20 an hour per organisation, refused ones included; this organisation has used most of them.
  let last, keyBefore, tries = 0;
  do { keyBefore = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key; last = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(41, 41)) }); tries += 1; } while (last.status !== 429 && tries < 25);
  check("past 20 uploads in an hour the next is 429, and it stores nothing", last.status === 429 && q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key === keyBefore && [...env.MEDIA.store.keys()].filter((k) => k.startsWith(`logo/${A.org.id}/`)).length === 1);
  q("DELETE FROM rate_limits WHERE key LIKE 'brand:logo:%'");
  const k1 = keyBefore;
  const v1 = q1("SELECT brand_logo_version v FROM orgs WHERE id = ?", A.org.id).v;
  const r = await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(40, 40)) });
  const k2 = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key;
  check("replacing: the new one is stored and the old object is deleted from R2 at once", r.status === 201 && k2 !== k1 && env.MEDIA.store.has(k2) && !env.MEDIA.store.has(k1) && q1("SELECT COUNT(*) n FROM media_deletes").n === 0);
  check("the old address now answers 404, and the new one carries the next version", (await client({ ip: ip() }).get(`/media/${k1}?v=2`)).status === 404 && r.json.logo.endsWith(`?v=${v1 + 1}`));
  const del = await A.del(brandPath(A.org, "/logo"));
  check("removing: the R2 object goes, the row points at nothing, and the name stays", del.status === 200 && del.json.logo === null && !env.MEDIA.store.has(k2) && q1("SELECT brand_logo_key, brand_name FROM orgs WHERE id = ?", A.org.id).brand_logo_key === null && del.json.name === "Acme Careers");
  check("removing again is fine and changes nothing", (await A.del(brandPath(A.org, "/logo"))).status === 200);
  // An R2 failure at the moment of replacing leaves the old object queued, and the daily clean-up deletes it.
  await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(20, 20)) });
  const k3 = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key;
  const realDelete = env.MEDIA.delete;
  env.MEDIA.delete = async () => { throw new Error("R2 is down"); };
  await A.post(brandPath(A.org, "/logo"), { dataUrl: dataUrl(png(21, 21)) });
  env.MEDIA.delete = realDelete;
  check("if R2 fails while replacing, the old one stays queued", env.MEDIA.store.has(k3) && q1("SELECT key FROM media_deletes")?.key === k3);
  const { purgeExpired } = await import("../worker/purge.js");
  const out = await purgeExpired(env);
  check("…and the daily clean-up deletes it", !env.MEDIA.store.has(k3) && q1("SELECT COUNT(*) n FROM media_deletes").n === 0 && out.mediaDeletes === 1);
  // Deleting organisations: the host reset (scripts/reset-hosts.mjs) deletes every organisation with plain SQL.
  const bKey = globalThis.BKEY, aKey = q1("SELECT brand_logo_key FROM orgs WHERE id = ?", A.org.id).brand_logo_key;
  const { wipeSql, COUNT_SQL, BRAND_LOGO_SQL, BRAND_COLUMN_SQL } = await import("../scripts/reset-hosts.mjs");
  check("the reset script lists the organisations' logos before it wipes", q(BRAND_LOGO_SQL).map((x) => x.brand_logo_key).sort().join() === [aKey, bKey].sort().join() && q1(BRAND_COLUMN_SQL).n === 1);
  const db2 = makeDb({ before: "0044" });
  check("…and runs on a database without 0044 (no logo column, nothing to list)", db2.raw.prepare(BRAND_COLUMN_SQL).get().n === 0);
  const snapshot = new Map(env.MEDIA.store);
  env.DB.raw.exec(wipeSql(q1(COUNT_SQL)));
  check("the wipe deletes the organisations and the database queues both logos", q1("SELECT COUNT(*) n FROM orgs").n === 0 && q("SELECT key FROM media_deletes").map((x) => x.key).sort().join() === [aKey, bKey].sort().join() && env.MEDIA.store.has(aKey));
  const out2 = await purgeExpired(env);
  check("the daily clean-up then deletes both from the R2 stand-in", !env.MEDIA.store.has(aKey) && !env.MEDIA.store.has(bKey) && out2.mediaDeletes === 2 && q1("SELECT COUNT(*) n FROM media_deletes").n === 0);
  check("the reset script deletes them from R2 straight after the wipe too, with local or remote and --apply", /F66: the organisations are gone[\s\S]*brandLogos[\s\S]*r2DeleteArgs\(where, key\)/.test(read("scripts/reset-hosts.mjs")) && !/"media_deletes"/.test(read("scripts/reset-hosts.mjs").match(/export const WIPED = \[[\s\S]*?\];/)[0]));
  check("nothing else in R2 was touched", [...snapshot.keys()].filter((k) => !k.startsWith("logo/")).every((k) => env.MEDIA.store.has(k)));
}

console.log("\n# F66.2 The host's side: the Branding section, the logo made ready in the browser, the per-event switch");
{
  const acct = read("src/views/HostAccount.vue");
  check("the Branding section reads the settings from /api/host/me and changes them only through the four brand routes", /setBrand\(me\.value\.brand\)/.test(acct) && /HostApi\.hostSetBrandName\(me\.value\.org\.id/.test(acct) && /HostApi\.hostUploadLogo\(me\.value\.org\.id/.test(acct) && /HostApi\.hostRemoveLogo\(me\.value\.org\.id/.test(acct) && /hostBrand: \(org\) => api\(`\/api\/host\/orgs\/\$\{encodeURIComponent\(org\)\}\/brand`\)/.test(read("src/lib/hostapi.js")));
  check("only the owner can use the controls (the name field, Save and Add a logo are disabled otherwise, Remove is not drawn), and a switched-off organisation is told so", /const canEditBrand = computed\(\(\) => !!brand\.value\?\.canEdit && !brand\.value\?\.off\)/.test(acct) && /:disabled="!canEditBrand"/.test(acct) && /:disabled="!canEditBrand \|\| !!working" @click="chooseLogo"/.test(acct) && /v-if="brand\.logo && brand\.canEdit"/.test(acct) && /Only the organisation's owner can change the branding/.test(acct) && /Lanyard switched off branding for this organisation/.test(acct));
  check("the name field holds 60 characters, and the file picker offers only PNG, JPEG and WebP", /:maxlength="brand\.nameMax"/.test(acct) && /:accept="LOGO_TYPES\.join\(','\)"/.test(acct));
  check("the preview shows the Present head and the check-in head, each with the logo or the name, and Check in with Lanyard", /data-brand-preview/.test(acct) && /class="bp-present"/.test(acct) && /class="profile event-brand default bp-checkin"/.test(acct) && (acct.match(/Check in with Lanyard/g) || []).length >= 2 && /\{\{ shownName \}\}/.test(acct));
  check("the name and logo are shown as text and as an <img>, never as HTML", !/v-html|innerHTML/.test(acct) && /<img v-if="brand\.logo" :src="brand\.logo"/.test(acct));
  check("the Host Terms are linked from where a logo is added", /termsUrl = `\$\{MAIN_ORIGIN\}\/terms#hosts`/.test(acct) && /Only add a name or logo you have the right to use/.test(acct));
  const L = await import("../src/lib/logo.js");
  check("the browser side refuses an SVG, a GIF or anything without an image type before reading it", await Promise.all(["image/svg+xml", "image/gif", "text/html", ""].map((type) => L.prepareLogo({ type, size: 10 }).then(() => false, (e) => e.message === L.LOGO_TYPE_ERROR))).then((r) => r.every(Boolean)) && JSON.stringify(L.LOGO_TYPES) === '["image/png","image/jpeg","image/webp"]');
  check("a picture over 1024 px is drawn smaller keeping its shape, as a PNG (transparency kept), and one small enough is sent as it is", JSON.stringify(L.fitWithin(4000, 1000)) === '{"w":1024,"h":256}' && JSON.stringify(L.fitWithin(300, 2048)) === '{"w":150,"h":1024}' && JSON.stringify(L.fitWithin(800, 600)) === '{"w":800,"h":600}' && /canvas\.toDataURL\("image\/png"\)/.test(read("src/lib/logo.js")) && /if \(Math\.max\(w, h\) <= LOGO_MAX_SIDE && file\.size <= LOGO_MAX_BYTES\) return original;/.test(read("src/lib/logo.js")));
  check("the browser's limits are the Worker's", L.LOGO_MAX_BYTES === (await import("../worker/branding.js")).LOGO_MAX_BYTES && L.LOGO_MAX_SIDE === (await import("../worker/branding.js")).LOGO_MAX_SIDE && L.dataUrlBytes("data:image/png;base64,AAAA") === 3);
  const { createBody, detailsBody } = await import("../src/lib/eventform.js");
  const { blankForm } = await import("../src/lib/eventsteps.js");
  const f = blankForm();
  check("Create sends nothing new unless the host unticked the switch (so a default form sends what it always did)", !("useBranding" in createBody(f)) && createBody({ ...f, useBranding: false }).useBranding === false && !("useBranding" in createBody({ ...f, useBranding: true })));
  check("Details sends the switch once it has read it, and not before", !("useBranding" in detailsBody({ name: "x", perks: [] })) && detailsBody({ name: "x", perks: [], useBranding: false }).useBranding === false && detailsBody({ name: "x", perks: [], useBranding: true }).useBranding === true);
  const dash = read("src/views/HostDashboard.vue"), live = read("src/views/HostLive.vue");
  check("Create knows whether the event will be paid (not a society's free event of the week, and the next credit was bought) and passes the settings to step 2", /:look="\{ brand, paid: paidNext \}"/.test(dash) && /const paidNext = computed\(\(\) => !freeNow\.value && !!credits\.value\?\.nextBought\);/.test(dash) && /brand\.value = d\.brand \|\| null;/.test(dash) && /:look="look"/.test(read("src/components/EventCreate.vue")));
  check("Details reads the event's own switch and whether it is paid from /api/host/me (the live route is unchanged)", /look\.value = \{ brand: me\.brand \|\| null, paid: !!ev\?\.isPaid \};/.test(live) && /useBranding: ev\.useBranding !== false/.test(live));

  globalThis.location ??= new URL("https://host.lanyard.test/"); // the swatches read the store, which reads the site address
  const { createServer } = await import("vite");
  const { renderToString } = await import("vue/server-renderer");
  const { createSSRApp, h } = await import("vue");
  const vite = await createServer({ configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
  try {
    const EventLook = (await vite.ssrLoadModule("/src/components/EventLook.vue")).default;
    const render = (props) => renderToString(createSSRApp({ render: () => h(EventLook, props) }).component("router-link", { render() { return h("a", {}, this.$slots.default?.()); } })).then((x) => x.replace(/<!--[\s\S]*?-->/g, ""));
    const form = (o = {}) => ({ theme: "default", strapColor: "", strapInk: "", ...o });
    const box = (html) => (html.match(/<label class="[^"]*el-brand[^"]*"[^>]*data-use-branding[^>]*>[\s\S]*?<\/label>/) || [""])[0];
    const has = { has: true, off: false, name: "Acme Careers", defaultName: "Acme Ltd", logo: "/media/logo/x.png?v=1" };
    const paidOn = box(await render({ form: form(), brand: has, paid: true }));
    check("a paid event of an organisation with branding: the switch is on and can be changed", /<input type="checkbox" checked/.test(paidOn) && !/disabled/.test(paidOn.match(/<input[^>]*>/)[0]) && /Check in with Lanyard/.test(paidOn));
    const paidOff = box(await render({ form: form({ useBranding: false }), brand: has, paid: true }));
    check("…unticked by the host, it shows unticked", !/checked/.test(paidOff.match(/<input[^>]*>/)[0]));
    const free = box(await render({ form: form(), brand: has, paid: false }));
    check("a free event: the switch shows, disabled and unticked, saying Branding shows on paid events", /<input type="checkbox" disabled/.test(free) && !/checked/.test(free.match(/<input[^>]*>/)[0]) && /Branding shows on paid events\./.test(free));
    const none = box(await render({ form: form(), brand: { has: false, off: false }, paid: true }));
    check("no name or logo yet: disabled, saying where to add them", /<input type="checkbox" disabled/.test(none) && /Add your company name or logo under Account and team, Branding/.test(none));
    const off = box(await render({ form: form(), brand: { ...has, off: true }, paid: true }));
    check("switched off by Lanyard: disabled, and it says so", /<input type="checkbox" disabled/.test(off) && /Lanyard switched off your organisation(&#39;|')s branding/.test(off));
    check("the switch's words are tied to it for a screen reader", /aria-describedby="ev-brand-d"/.test(paidOn) && /id="ev-brand-d"/.test(paidOn));
  } finally { await vite.close(); }
}

console.log("\n# F66.3 Drawn on every surface, with Check in with Lanyard, as text; free events stay Lanyard");
{
  // A fresh organisation with branding, a paid event and a society's free one, read through the real Worker.
  const C = await hostOf("Drawn Org");
  q("UPDATE orgs SET org_type = 'society' WHERE id = ?", C.org.id);
  const freeEv = (await C.post("/api/host/events", { name: "Free one", theme: "forest" })).json;
  const paidEv = (await C.post("/api/host/events", { name: "Paid one" })).json;
  await C.put(brandPath(C.org), { name: "\"><img src=x onerror=alert(1)>" });
  await C.post(brandPath(C.org, "/logo"), { dataUrl: dataUrl(png(48, 24)) });
  const viewer = client({ ip: ip() });
  const paidPub = (await viewer.get(`/api/e/${paidEv.code}`)).json, freePub = (await viewer.get(`/api/e/${freeEv.code}`)).json;
  check("through the real Worker: the paid event has a brand with the name as typed, the free one none", paidPub.event.brand?.name === "\"><img src=x onerror=alert(1)>" && /^\/media\/logo\//.test(paidPub.event.brand.logo) && !("brand" in freePub.event));

  globalThis.location ??= new URL("https://lanyard.test/");
  const { createServer } = await import("vite");
  const { renderToString } = await import("vue/server-renderer");
  const { createSSRApp, h, reactive } = await import("vue");
  const vite = await createServer({ configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
  try {
    const EventPage = (await vite.ssrLoadModule("/src/components/EventPage.vue")).default;
    const render = (event) => renderToString(createSSRApp({ render: () => h(EventPage, { event, form: reactive({ name: "", answers: {}, sponsorConsent: {}, directoryConsent: false }), sponsors: [] }) })
      .component("router-link", { render() { return h("a", {}, this.$slots.default?.()); } })).then((x) => x.replace(/<!--[\s\S]*?-->/g, ""));
    const paid = await render(paidPub.event), free = await render(freePub.event);
    check("the paid event's check-in page: the name on the strap in place of lanyard, the logo as a plain <img>, and Check in with Lanyard", /class="profile-strap-word"[^>]*>&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;</.test(paid) && new RegExp(`<img src="${paidPub.event.brand.logo.replace(/[?]/g, "\\?")}" alt="" class="brand-logo"`).test(paid) && /Check in with Lanyard/.test(paid) && !/>lanyard</.test(paid));
    check("the display name is text, never HTML, on the check-in page (no img with onerror, no script)", !/<img src=x/.test(paid) && !/<script>alert/.test(paid));
    const scripted = await render({ ...paidPub.event, brand: { name: "<script>alert(1)</script>", logo: null } });
    check("…and a name <script>alert(1)</script> shows as those characters", /&lt;script&gt;alert\(1\)&lt;\/script&gt;/.test(scripted) && !/<script>alert/.test(scripted) && !/class="brand-logo"/.test(scripted));
    check("the free event's check-in page is the Lanyard look: lanyard on the strap, no logo, no Check in with Lanyard line", />lanyard</.test(free) && !/brand-logo|Check in with Lanyard|Drawn Org|onerror/.test(free));
    check("a default-look event with no branding still has the plain head", !/event-brand/.test(await render({ ...freePub.event, theme: "default" })));
  } finally { await vite.close(); }

  // The other surfaces fetch their data when they open, so their source is read: each draws the brand only from the
  // response's brand (which a free event never has), as text and an <img>, and says Check in with Lanyard whenever it does.
  const surfaces = {
    "the check-in page": ["src/components/EventPage.vue", /<p v-if="event\.brand" class="small muted brand-with">Check in with Lanyard<\/p>/],
    "the event hub": ["src/views/EventDetail.vue", /<p v-if="event\.brand" class="small muted hub-with">Check in with Lanyard<\/p>/],
    "Present": ["src/views/HostPresent.vue", /<p v-if="ev && brand" class="present-with">Check in with Lanyard<\/p>/],
    "the poster": ["src/views/HostPrint.vue", /<p v-if="!brand" class="poster-brand">lanyard<\/p>\s*<p v-else class="poster-with">Check in with Lanyard<\/p>/],
  };
  for (const [name, [file, line]] of Object.entries(surfaces)) {
    const src = read(file);
    check(`${name}: Check in with Lanyard is drawn whenever the brand is, and nothing else can hide it`, line.test(src) && !/v-html|innerHTML/.test(src));
  }
  const pres = read("src/views/HostPresent.vue"), print = read("src/views/HostPrint.vue"), hub = read("src/views/EventDetail.vue");
  check("Present: the logo, or the name in the wordmark's style, in place of lanyard. (the live route's brand)", /const brand = computed\(\(\) => live\.value\?\.brand \|\| null\);/.test(pres) && /<p v-if="!brand" class="present-brand">lanyard<b>\.<\/b><\/p>/.test(pres) && /<p v-else class="present-brand present-host"><img v-if="brand\.logo" :src="brand\.logo" :alt="brand\.name" class="present-logo" \/><template v-else>\{\{ brand\.name \}\}<\/template><\/p>/.test(pres));
  check("the poster: the logo or the name at the top, printed once the logo has loaded", /const brand = computed\(\(\) => live\.value\?\.brand \|\| null\);/.test(print) && /<img v-if="brand\?\.logo" :src="brand\.logo" :alt="brand\.name" class="poster-logo" \/>/.test(print) && /document\.images\][\s\S]*printIt\(\);/.test(print));
  check("the hub: the logo or the name on its head, from the hub response's brand", /<img v-if="event\.brand\?\.logo" :src="event\.brand\.logo" :alt="event\.brand\.name" class="hub-logo" \/>/.test(hub) && /<span v-else-if="event\.brand" class="hub-brand">\{\{ event\.brand\.name \}\}<\/span>/.test(hub));
  check("the Lanyard frame stays: the hub keeps its back button, Present its controls, the poster its steps", /class="hub-back"/.test(hub) && /class="present-controls"/.test(pres) && /class="poster-steps"/.test(print));
  const { previewBrand } = await import("../src/lib/eventform.js");
  const set = { has: true, off: false, name: "", defaultName: "Drawn Org", logo: "/media/logo/a/b.png?v=1" };
  check("the previews beside the forms follow the Worker's rule", JSON.stringify(previewBrand(set, true, undefined)) === '{"name":"Drawn Org","logo":"/media/logo/a/b.png?v=1"}' && previewBrand(set, false, true) === null && previewBrand(set, true, false) === null && previewBrand({ ...set, off: true }, true, true) === null && previewBrand({ has: false }, true, true) === null && previewBrand(null, true, true) === null);
  check("Create's and Details' previews pass it to the same check-in page", /previewBrand\(brand\.value, paidNext\.value/.test(read("src/views/HostDashboard.vue")) && /previewBrand\(look\.value\.brand, look\.value\.paid, d\.value\.useBranding\)/.test(read("src/views/HostLive.vue")));
  const admin = read("src/views/Admin.vue");
  check("the admin page lists branding, shows a logo through the token (a blob address, no public link), removes it and switches branding off, each after a confirm", /call\("\/api\/admin\/brands"\)/.test(admin) && /fetch\(`\/api\/admin\/orgs\/\$\{encodeURIComponent\(o\.id\)\}\/brand\/logo`, \{ headers: \{ authorization: `Bearer \$\{token\.value\}` \} \}\)/.test(admin) && /URL\.createObjectURL/.test(admin) && /\/brand\/logo`, "DELETE"\)/.test(admin) && /\/brand`, "POST", \{ off \}\)/.test(admin) && (admin.match(/window\.confirm\(`(Remove the logo|Switch off branding)/g) || []).length === 2 && !/v-html/.test(admin));
  const terms = read("src/views/Terms.vue");
  check("the Host Terms say a host must have the right to use any name or logo they add; the Terms version is not bumped", /you must own it or have the right to use it/.test(terms) && terms.indexOf("have the right to use it") > terms.indexOf('id="hosts"') && /TERMS_VERSION = "2026-11-22"/.test(read("worker/legal.js")));
}

summary();
