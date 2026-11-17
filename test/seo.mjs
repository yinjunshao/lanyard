// F37: search and link-preview tags. The real Worker runs against in-memory SQLite, and the page is
// rewritten by the REAL HTMLRewriter: Node has none, so a stand-in below records what the Worker asks
// for and has workerd (through Miniflare) do it. Escaping is therefore the runtime's own.
// Bots and people get the same HTML, so no user-agent matters; one check proves that.
// Run: node test/seo.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";
import { eraseUser } from "../worker/purge.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(root + p, "utf8");
const INDEX = read("index.html");

// ---------------------------------------------------------------- the real HTMLRewriter, in workerd
const mf = new Miniflare({
  modules: true,
  scriptPath: root + "test/seo-worker.mjs",
  modulesRoot: root + "test",
  modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }],
  compatibilityDate: "2025-01-01",
});
let rewrites = 0;
class RecordingRewriter {
  constructor() { this.rules = []; }
  on(selector, handlers) {
    const ops = [];
    // Only what the worker may use: set an attribute, set TEXT, remove. No html:true, no append.
    handlers.element({
      setAttribute(name, value) { if (typeof value !== "string") throw new Error("setAttribute needs text"); ops.push({ op: "setAttribute", name, value }); return this; },
      setInnerContent(value, opts) { if (opts?.html) throw new Error("html:true is not allowed"); if (typeof value !== "string") throw new Error("text only"); ops.push({ op: "setInnerContent", value }); return this; },
      remove() { ops.push({ op: "remove" }); return this; },
    });
    this.rules.push({ selector, ops });
    return this;
  }
  transform(res) {
    const rules = this.rules;
    rewrites += 1;
    const body = new ReadableStream({
      async start(ctrl) {
        const html = await res.text();
        const out = await mf.dispatchFetch("http://seo.test/", { method: "POST", body: JSON.stringify({ html, rules }) });
        ctrl.enqueue(new TextEncoder().encode(await out.text()));
        ctrl.close();
      },
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  }
}
globalThis.HTMLRewriter = RecordingRewriter;

// ---------------------------------------------------------------- the world
const assetCalls = [];
const ASSETS = {
  fetch: async (req) => {
    const h = Object.fromEntries(req.headers);
    assetCalls.push({ url: req.url, method: req.method, ifNoneMatch: h["if-none-match"] || null });
    if (h["if-none-match"]) return new Response(null, { status: 304 });
    return new Response(INDEX, { headers: { "content-type": "text/html; charset=utf-8", etag: '"shell"', "last-modified": "Mon, 16 Nov 2026 10:00:00 GMT" } });
  },
};
const T = await makeEnv({ ASSETS });
const { env, client, q, q1 } = T;
const realDb = env.DB;
const sqlLog = [];
const counted = {
  ...realDb,
  prepare(sql) { sqlLog.push(sql.replace(/\s+/g, " ").trim()); return realDb.prepare(sql); },
};
env.DB = counted;
const reads = () => sqlLog.filter((s) => /^SELECT/i.test(s));
const web = client({ ip: "198.51.100.7" });
const hostWeb = client({ ip: "198.51.100.8", site: "host" });

// Read tags back out of the HTML the way a chat app would.
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const meta = (html, key) => {
  const m = new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`).exec(html);
  return m ? decode(m[1]) : null;
};
const titleOf = (html) => { const m = /<title>([\s\S]*?)<\/title>/.exec(html); return m ? decode(m[1]) : null; };
const canonicalOf = (html) => { const m = /<link rel="canonical" href="([^"]*)"/.exec(html); return m ? decode(m[1]) : null; };
const count = (html, re) => (html.match(re) || []).length;
const ORIGIN = "https://lanyard.test";

// People. `signup` makes a card; the rest of the profile is filled with things that must never leak.
let ipn = 0;
const SECRETS = { about: "ABOUT-SECRET-TEXT", tag: "TAG-SECRET", link: "https://secret-link.example/me", email: "private.person@secret.example", note: "CARD-NOTE-SECRET", project: "PROJECT-SECRET", course: "COURSE-SECRET" };
async function signup(name, body = {}) {
  ipn += 1;
  const c = client({ ip: `10.37.${Math.floor(ipn / 200)}.${(ipn % 200) + 1}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...body });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  const id = me.json.user.id;
  return { c, id, name, card: me.json.cards[0].cardId };
}
const fill = {
  headline: "Builds small robots",
  about: SECRETS.about, tags: [SECRETS.tag], course: SECRETS.course, uni: "University of Example",
  links: { Site: SECRETS.link }, projects: [{ title: SECRETS.project, line: "x", url: "" }],
};
const ada = await signup("Ada Lovelace", fill);
const PHOTO = "avatar/abc123def456.webp";
env.DB.raw.exec(`UPDATE profiles SET photo_key = '${PHOTO}' WHERE user_id = '${ada.id}'`);
env.DB.raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1 WHERE id = ?").run(SECRETS.email, ada.id);
env.DB.raw.prepare("UPDATE cards SET note = ? WHERE id = ?").run(SECRETS.note, ada.card);
const GENERIC_HOME = (await web.get("/")).text;

console.log("\n# index.html carries the site-wide tags, right after the charset");
{
  const head = INDEX.slice(INDEX.indexOf("<head>"), INDEX.indexOf("</head>"));
  const first = head.slice(head.indexOf("<meta charset"));
  check("the title and description come straight after the charset", /^<meta charset="UTF-8" \/>\s*<title>[^<]+<\/title>\s*<meta name="description"/.test(first));
  check("the tags are inside the first 2 KB of the page", INDEX.indexOf('property="og:image"') < 2048 && INDEX.indexOf('name="twitter:image"') < 2048, INDEX.indexOf('name="twitter:image"'));
  for (const key of ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image", "og:image:width", "og:image:height", "og:image:alt", "og:locale", "twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    check(`index.html has ${key}`, meta(INDEX, key) !== null);
  }
  check("twitter:card is summary_large_image", meta(INDEX, "twitter:card") === "summary_large_image");
  check("the image link is absolute and the canonical is the home page", /^https:\/\/[^/]+\/og-image\.png$/.test(meta(INDEX, "og:image")) && /^https:\/\/[^/]+\/$/.test(canonicalOf(INDEX)));
  check("the title is under 70 characters and the description under 160", titleOf(INDEX).length <= 70 && meta(INDEX, "description").length <= 160 && meta(INDEX, "og:description").length <= 160, [titleOf(INDEX).length, meta(INDEX, "description").length]);
  const png = readFileSync(root + "public/og-image.png");
  const size = statSync(root + "public/og-image.png").size;
  check("public/og-image.png is a PNG of 1200 x 630", png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, [png.readUInt32BE(16), png.readUInt32BE(20)]);
  check("and under 300 KB", size < 300 * 1024, size);
}

console.log("\n# Marketing pages: right tags, and no database read");
{
  sqlLog.length = 0;
  const pages = {
    "/": ["Lanyard: a digital card and a memory of everyone you meet", `${ORIGIN}/`],
    "/hosts": ["Lanyard for hosts", `${ORIGIN}/hosts`],
    "/terms": ["Terms of service", `${ORIGIN}/terms`],
    "/privacy": ["Privacy policy", `${ORIGIN}/privacy`],
    "/privacy-request": ["Privacy request", `${ORIGIN}/privacy-request`],
  };
  for (const [path, [title, url]] of Object.entries(pages)) {
    const r = await web.get(path);
    check(`${path}: 200 and the page's own title`, r.status === 200 && titleOf(r.text).startsWith(title), [r.status, titleOf(r.text)]);
    check(`${path}: canonical, og:url and the images are absolute links to this site`, canonicalOf(r.text) === url && meta(r.text, "og:url") === url && meta(r.text, "og:image") === `${ORIGIN}/og-image.png` && meta(r.text, "twitter:image") === `${ORIGIN}/og-image.png`, [canonicalOf(r.text), meta(r.text, "og:image")]);
    check(`${path}: title and description repeat in og and twitter`, meta(r.text, "og:title") === titleOf(r.text) && meta(r.text, "twitter:title") === titleOf(r.text) && meta(r.text, "description").length > 0 && meta(r.text, "twitter:description") === meta(r.text, "og:description"));
    check(`${path}: the large card, with the image size`, meta(r.text, "twitter:card") === "summary_large_image" && meta(r.text, "og:image:width") === "1200" && meta(r.text, "og:image:height") === "630");
    check(`${path}: still the same page around the tags (one module script, no extra tags)`, count(r.text, /<script/g) === count(INDEX, /<script/g) && count(r.text, /<meta /g) === count(INDEX, /<meta /g) && count(r.text, /<link /g) === count(INDEX, /<link /g));
  }
  check("not one database statement for all five", sqlLog.length === 0, sqlLog);
  check("every one was rewritten, not served as the plain file", rewrites >= 5);
  const hostsPage = (await web.get("/hosts")).text;
  check("/hosts says nothing about a price it could get wrong", !/£|\bfree for societies\b/i.test(meta(hostsPage, "description")));
  check("a trailing slash and a query string give the same tags", canonicalOf((await web.get("/terms/?x=1")).text) === `${ORIGIN}/terms`);
  check("another route (/app) is left as the plain page", (await web.get("/app")).text === INDEX);
}

console.log("\n# The address comes from the first APP_ORIGIN entry");
{
  const keep = env.APP_ORIGIN;
  env.APP_ORIGIN = "https://one.example, https://two.example";
  check("the first entry is used", canonicalOf((await web.get("/hosts")).text) === "https://one.example/hosts");
  env.APP_ORIGIN = "https://host.one.example,https://main.example";
  check("a host.* entry is skipped", canonicalOf((await web.get("/hosts")).text) === "https://main.example/hosts");
  env.APP_ORIGIN = "";
  check("with none set, it falls back to https://lanyd.fyi", canonicalOf((await web.get("/hosts")).text) === "https://lanyd.fyi/hosts");
  env.APP_ORIGIN = "javascript:alert(1),not a url";
  check("an entry that is not a web address is never used", canonicalOf((await web.get("/hosts")).text) === "https://lanyd.fyi/hosts");
  env.APP_ORIGIN = keep;
}

console.log("\n# A card shows what the public card shows");
{
  sqlLog.length = 0;
  const r = await web.get(`/c/${ada.card}`);
  const seen = reads();
  const nSql = sqlLog.length;
  const pub = (await web.get(`/api/c/${ada.card}`)).json;
  check("200", r.status === 200, r.status);
  check("the preview name is the public card's name", meta(r.text, "og:title") === pub.profile.name && meta(r.text, "twitter:title") === "Ada Lovelace", meta(r.text, "og:title"));
  check("the preview text is the public card's headline", meta(r.text, "og:description") === pub.profile.headline && meta(r.text, "description") === "Builds small robots", meta(r.text, "og:description"));
  check("the title tag reads 'Ada Lovelace on Lanyard'", titleOf(r.text) === "Ada Lovelace on Lanyard", titleOf(r.text));
  check("the picture is the card's own photo, as the same absolute link the card page uses", meta(r.text, "og:image") === `${ORIGIN}${pub.profile.photo}` && meta(r.text, "twitter:image") === `${ORIGIN}/media/${PHOTO}`, meta(r.text, "og:image"));
  check("a profile photo is the small card, with no 1200 x 630 claim", meta(r.text, "twitter:card") === "summary" && meta(r.text, "og:image:width") === null && meta(r.text, "og:image:height") === null);
  check("canonical and og:url are the card's own address", canonicalOf(r.text) === `${ORIGIN}/c/${ada.card}` && meta(r.text, "og:url") === `${ORIGIN}/c/${ada.card}`);
  check("one database read in all", nSql === 1 && seen.length === 1, nSql);
  check("the read is by the card's primary key", /WHERE c\.id = \?/.test(seen[0]));
  for (const [what, secret] of Object.entries(SECRETS)) {
    check(`the card's ${what} is nowhere in the HTML`, !r.text.includes(secret), what);
  }
  check("no account id, user id or other card id in the HTML", !r.text.includes(ada.id));
  check("no university or course", !r.text.includes("University of Example"));
  check("the page differs from the plain one only in the tags", count(r.text, /<script/g) === count(INDEX, /<script/g) && count(r.text, /<link /g) === count(INDEX, /<link /g) && r.text.replace(/<head>[\s\S]*<\/head>/, "") === INDEX.replace(/<head>[\s\S]*<\/head>/, ""));
}

console.log("\n# A card with its own headline, a hidden headline and no photo");
{
  const bea = await signup("Bea Brightwater", { headline: "Profile headline", about: SECRETS.about });
  const second = await bea.c.post("/api/cards", { name: "Careers", headline: "Careers headline", about: "x" });
  const cardId = second.json.id || second.json.cardId;
  const page2 = await web.get(`/c/${cardId}`);
  const pub2 = (await web.get(`/api/c/${cardId}`)).json;
  check("a card's own headline is what its page shows, so it is what the preview shows", pub2.profile.headline === "Careers headline" && meta(page2.text, "og:description") === "Careers headline", [pub2.profile.headline, meta(page2.text, "og:description")]);
  const page1 = await web.get(`/c/${bea.card}`);
  check("the default card shows the profile's headline", meta(page1.text, "og:description") === "Profile headline");
  check("no photo: the site image, large card, with its size", meta(page1.text, "og:image") === `${ORIGIN}/og-image.png` && meta(page1.text, "twitter:card") === "summary_large_image" && meta(page1.text, "og:image:width") === "1200");
  env.DB.raw.prepare("UPDATE cards SET headline = '' WHERE id = ?").run(cardId);
  env.DB.raw.prepare("UPDATE profiles SET headline = '' WHERE user_id = ?").run(bea.id);
  const bare = await web.get(`/c/${bea.card}`);
  const pubBare = (await web.get(`/api/c/${bea.card}`)).json;
  check("nothing to show for a headline: the page shows none and so does the preview", !pubBare.profile.headline && meta(bare.text, "og:description") === "Open this card to connect on Lanyard.", meta(bare.text, "og:description"));
  check("the name still shows", meta(bare.text, "og:title") === "Bea Brightwater");
  check("an about text the card page would show is not used instead", !bare.text.includes(SECRETS.about));
  env.DB.raw.prepare("UPDATE profiles SET name = '   ' WHERE user_id = ?").run(bea.id);
  check("a blank name gives the generic page", (await web.get(`/c/${bea.card}`)).text === GENERIC_HOME);
  env.DB.raw.prepare("UPDATE profiles SET name = 'Bea Brightwater', photo_key = '../../etc/passwd' WHERE user_id = ?").run(bea.id);
  const odd = await web.get(`/c/${bea.card}`);
  check("a photo key the media route would refuse is never linked", meta(odd.text, "og:image") === `${ORIGIN}/og-image.png` && !odd.text.includes("passwd"));
  env.DB.raw.prepare("UPDATE profiles SET photo_key = 'selfie/aaaa1111.webp' WHERE user_id = ?").run(bea.id);
  check("a private selfie key (not an avatar) is never linked", !(await web.get(`/c/${bea.card}`)).text.includes("selfie/"));
}

console.log("\n# A shared selfie and connections never reach the HTML");
{
  const cal = await signup("Cal Cartwright", { headline: "CAL-HEADLINE" });
  const cn = await cal.c.post("/api/connect", { cardId: ada.card });
  env.DB.raw.prepare("UPDATE connections SET selfie_key = 'selfie/ffff0000aaaa.webp' WHERE id = ?").run(cn.json.connectionId);
  const r = await web.get(`/c/${ada.card}`);
  check("the card page for a person with a shared selfie shows no selfie and no connection", !r.text.includes("selfie") && !r.text.includes("Cal Cartwright") && !r.text.includes(cn.json.connectionId));
}

console.log("\n# Cards that do not exist look like a made-up id");
{
  const made = await web.get("/c/ffffffffff");
  check("a made-up id is the generic page, not an error", made.status === 200 && meta(made.text, "og:title") === "Lanyard: a digital card and a memory of everyone you meet");
  check("generic means the same page the home page gets", made.text === GENERIC_HOME);
  // A second card, then deleted.
  const dee = await signup("Dee Deleted", { headline: "DEE-HEADLINE" });
  const extra = await dee.c.post("/api/cards", { name: "Extra", headline: "DEE-EXTRA-HEADLINE" });
  const extraId = extra.json.id || extra.json.cardId;
  check("setup: the card's preview names her", meta((await web.get(`/c/${extraId}`)).text, "og:title") === "Dee Deleted");
  const gone = await dee.c.del(`/api/cards/${extraId}`);
  const afterDelete = await web.get(`/c/${extraId}`);
  check("a deleted card is the generic page, byte for byte the same as a made-up id", gone.status === 200 && afterDelete.text === made.text && !afterDelete.text.includes("Dee"));
  // A deleted account.
  const eve = await signup("Eve Erased", { headline: "EVE-HEADLINE" });
  check("setup: her preview names her", meta((await web.get(`/c/${eve.card}`)).text, "og:title") === "Eve Erased");
  await eraseUser(env, eve.id);
  const erased = await web.get(`/c/${eve.card}`);
  check("an erased account's card is the generic page too", erased.text === made.text && !erased.text.includes("Eve") && !erased.text.includes("EVE-HEADLINE"));
  // Ids the card route would never hold.
  for (const odd of ["x", "a".repeat(41), "bad%20id", "%3Cscript%3E", "ab.cd", "ADA"]) {
    const r = await web.get(`/c/${odd}`);
    check(`/c/${odd.slice(0, 12)}: the generic page, no error`, r.status === 200 && meta(r.text, "og:title") === meta(GENERIC_HOME, "og:title") && !r.text.includes("<script>"), r.status);
  }
  check("a card id in another case is not another card", (await web.get(`/c/${ada.card.toUpperCase()}`)).text === made.text);
  check("the old /connect address and sub-pages get the plain page (the app redirects them)", (await web.get(`/c/${ada.card}/connect`)).text === INDEX);
  check("the card route's JSON for the made-up id is a 404, as before", (await web.get("/api/c/ffffffffff")).status === 404);
}

console.log("\n# Hostile and very long values are escaped and capped");
{
  const HOSTILE = `"><script>alert(1)</script> & 'x' <img src=x onerror=alert(2)> ${"W".repeat(300)}`;
  const mal = await signup("Mal Ware", { headline: "x" });
  env.DB.raw.prepare("UPDATE profiles SET name = ?, headline = ? WHERE user_id = ?").run(HOSTILE, HOSTILE + " ".repeat(5) + "Z".repeat(500), mal.id);
  const r = await web.get(`/c/${mal.card}`);
  check("still a page with the same number of scripts, metas and links", r.status === 200 && count(r.text, /<script/g) === count(INDEX, /<script/g) && count(r.text, /<meta /g) === count(INDEX, /<meta /g) && count(r.text, /<link /g) === count(INDEX, /<link /g));
  check("no raw tag from the name or headline is in the page", !r.text.includes("<script>alert") && !r.text.includes("<img src=x") && !r.text.includes("onerror=alert(2)>"));
  check("angle brackets become look-alikes and ampersands and quotes are escaped", r.text.includes("›script›".replace("›", "‹")) && r.text.includes("&amp;") && r.text.includes("&quot;") && !/[<>]/.test(r.text.match(/<meta property="og:title"[^>]*>/)[0].slice(1, -1)));
  check("a quote cannot end an attribute early (every tag still has its own content)", /<meta property="og:title" content="&quot;&gt;/.test(r.text) || /<meta property="og:title" content="&quot;/.test(r.text), r.text.match(/<meta property="og:title"[^>]*>/)?.[0]);
  const t = titleOf(r.text), ot = meta(r.text, "og:title"), od = meta(r.text, "og:description"), d = meta(r.text, "description");
  check("the title is at most 70 characters", t.length <= 70 && ot.length <= 70 && meta(r.text, "twitter:title").length <= 70, [t.length, ot.length]);
  check("the descriptions are at most 160 characters", od.length <= 160 && d.length <= 160 && meta(r.text, "twitter:description").length <= 160, [od.length, d.length]);
  check("a cut value ends with an ellipsis", ot.endsWith("…") && od.endsWith("…"));
  check("and the name still starts with what was typed", ot.startsWith(`"›‹script›alert(1)‹/script› & 'x'`));
  env.DB.raw.prepare("UPDATE profiles SET name = ?, headline = ? WHERE user_id = ?").run("Line\nBreak‮evil\u0000Name\t  Spaced", "A\r\nB​c", mal.id);
  const c2 = await web.get(`/c/${mal.card}`);
  check("line breaks, control and direction-changing characters become plain spaces", meta(c2.text, "og:title") === "Line Break evil Name Spaced" && meta(c2.text, "og:description") === "A B c", [meta(c2.text, "og:title"), meta(c2.text, "og:description")]);
  env.DB.raw.prepare("UPDATE profiles SET name = ? WHERE user_id = ?").run("\u{1F600}".repeat(200), mal.id);
  const c3 = await web.get(`/c/${mal.card}`);
  check("a long run of emoji is cut between characters, never inside one", [...meta(c3.text, "og:title")].length <= 70 && meta(c3.text, "og:title").isWellFormed() && c3.text.isWellFormed());
}

console.log("\n# Events");
const H = client({ ip: "10.37.200.1", site: "host" });
await becomeHost(H, { kind: "company", name: "Robotics Society", email: "seo@work.example.com" });
env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('cr-seo', (SELECT id FROM orgs LIMIT 1), 60, 0, 't', ?)").run(Date.now());
const mkEvent = async (name, extra = {}) => {
  const r = await H.post("/api/host/events", { name, startsAt: Date.now() + 3600e3, endsAt: Date.now() + 5 * 3600e3, ...extra });
  if (r.status !== 201) throw new Error("event " + r.text);
  return { id: r.json.id, code: r.json.code };
};
{
  const ev = await mkEvent("Spring Mixer");
  sqlLog.length = 0;
  const r = await web.get(`/e/${ev.code}`);
  check("an event: the name in the title and og", r.status === 200 && titleOf(r.text) === "Spring Mixer on Lanyard" && meta(r.text, "og:title") === "Spring Mixer", [titleOf(r.text)]);
  check("the host's name is in the description", meta(r.text, "og:description").includes("Robotics Society") && meta(r.text, "description") === meta(r.text, "og:description"), meta(r.text, "og:description"));
  check("canonical is the code's own address, the picture is the site's", canonicalOf(r.text) === `${ORIGIN}/e/${ev.code}` && meta(r.text, "og:image") === `${ORIGIN}/og-image.png` && meta(r.text, "twitter:card") === "summary_large_image");
  check("one SELECT, joined to the host", reads().length === 1 && /LEFT JOIN orgs/.test(reads()[0]), reads());
  check("what the event page does not show is not here: no venue, questions, perks or id", !r.text.includes(ev.id));
  const lower = await web.get(`/e/${ev.code.toLowerCase()}`);
  check("a code typed in lower case finds it", meta(lower.text, "og:title") === "Spring Mixer");
  const made = await web.get("/e/ZZZZ");
  check("an unknown code is the generic page", made.text === GENERIC_HOME && made.status === 200);
  check("a code of the wrong shape is the generic page, without a database read", await (async () => { sqlLog.length = 0; const x = await web.get("/e/not%20a%20code"); return x.text === GENERIC_HOME && sqlLog.length === 0; })());
  check("the join page's own address with more path (feedback) is left alone", (await web.get(`/e/${ev.code}/feedback`)).text === INDEX);
  // Ended: both ways.
  const ended = await mkEvent("Old Night");
  check("setup: it shows while live", meta((await web.get(`/e/${ended.code}`)).text, "og:title") === "Old Night");
  env.DB.raw.prepare("UPDATE events SET ended_at = ? WHERE id = ?").run(Date.now(), ended.id);
  check("an event the host ended is the generic page, the same as a made-up code", (await web.get(`/e/${ended.code}`)).text === made.text);
  const past = await mkEvent("Past Night");
  env.DB.raw.prepare("UPDATE events SET ends_at = ? WHERE id = ?").run(Date.now() - 1000, past.id);
  check("an event whose end time has passed too", (await web.get(`/e/${past.code}`)).text === made.text);
  // No host name.
  env.DB.raw.prepare("UPDATE events SET org_id = NULL WHERE id = ?").run(ev.id);
  const nohost = await web.get(`/e/${ev.code}`);
  check("an event with no host just says to check in", meta(nohost.text, "og:description") === "Check in on Lanyard, show your card and meet people." && !nohost.text.includes("Hosted by"), meta(nohost.text, "og:description"));
  // Hostile names.
  const ev2 = await mkEvent("Mixer");
  const BAD = `"><script>alert(1)</script> & <b>bold</b> ${"E".repeat(200)}`;
  env.DB.raw.prepare("UPDATE events SET name = ? WHERE id = ?").run(BAD, ev2.id);
  env.DB.raw.prepare("UPDATE orgs SET name = ?").run(`"><svg onload=alert(3)> & ${"H".repeat(200)}`);
  const hr = await web.get(`/e/${ev2.code}`);
  check("event and host names are escaped: no raw tag, same number of scripts and metas", !hr.text.includes("<script>alert") && !hr.text.includes("<svg onload") && !hr.text.includes("<b>bold") && count(hr.text, /<script/g) === count(INDEX, /<script/g) && count(hr.text, /<meta /g) === count(INDEX, /<meta /g));
  check("capped: title 70, description 160", titleOf(hr.text).length <= 70 && meta(hr.text, "og:title").length <= 70 && meta(hr.text, "og:description").length <= 160, [titleOf(hr.text).length, meta(hr.text, "og:description").length]);
  env.DB.raw.prepare("UPDATE orgs SET name = 'Robotics Society'").run();
}

console.log("\n# Event codes cannot be guessed through the page (same limit as the API)");
{
  const ev = await mkEvent("Guess Night");
  const guesser = client({ ip: "198.51.100.99" });
  let generic = 0;
  for (let i = 0; i < 40; i++) {
    const r = await guesser.get(`/e/Q${String(i).padStart(3, "0")}`);
    if (r.text === GENERIC_HOME) generic += 1;
  }
  check("wrong codes get the generic page", generic === 40);
  const hit = await guesser.get(`/e/${ev.code}`);
  check("after 30 wrong codes the right one gives the generic page too, so nothing is learnt", hit.text === GENERIC_HOME, meta(hit.text, "og:title"));
  const api = await guesser.get(`/api/e/${ev.code}`);
  check("and it is the one counter the API uses: that IP is limited there as well", api.status === 429, api.status);
  const other = client({ ip: "198.51.100.100" });
  let hits = 0;
  for (let i = 0; i < 40; i++) if (meta((await other.get(`/e/${ev.code}`)).text, "og:title") === "Guess Night") hits += 1;
  check("right codes never count: 40 visits to a real event from one IP all work", hits === 40, hits);
  const counter = q1("SELECT count FROM rate_limits WHERE key = ?", "code:ev:198.51.100.100");
  check("and leave that IP's counter at zero", !counter || counter.count === 0, counter);
}

console.log("\n# A database error still serves the page, with the generic tags");
{
  const broken = {
    ...realDb,
    prepare(sql) { if (/FROM (cards|events|rate_limits)|INTO rate_limits/i.test(sql)) throw new Error("D1 is down"); return realDb.prepare(sql); },
    batch: () => { throw new Error("D1 is down"); },
  };
  const ev = await mkEvent("Down Night");
  env.DB = broken;
  const card = await web.get(`/c/${ada.card}`);
  const event = await web.get(`/e/${ev.code}`);
  check("/c/: 200, the page is there, the tags are the generic ones", card.status === 200 && card.text === GENERIC_HOME, card.status);
  check("/e/: the same", event.status === 200 && event.text === GENERIC_HOME, event.status);
  check("a marketing page does not care", titleOf((await web.get("/hosts")).text).startsWith("Lanyard for hosts"));
  check("the headers are all still there", (card.headers.get("content-security-policy") || "").includes("default-src 'self'"));
  env.DB = counted;
  // A slow database: gives up after 2 seconds.
  const slow = { ...realDb, prepare(sql) { const s = realDb.prepare(sql); return { bind(...p) { s.bind(...p); return this; }, first: () => new Promise(() => {}), all: () => new Promise(() => {}), run: () => new Promise(() => {}) }; } };
  env.DB = slow;
  const t0 = Date.now();
  const stuck = await web.get(`/c/${ada.card}`);
  check("a database that never answers: the page comes after about 2 seconds with the generic tags", stuck.text === GENERIC_HOME && Date.now() - t0 < 4000, Date.now() - t0);
  env.DB = counted;
  // A broken rewriter: plain page.
  const keep = globalThis.HTMLRewriter;
  globalThis.HTMLRewriter = class { on() { throw new Error("boom"); } };
  const plain = await web.get("/hosts");
  check("if the rewriter itself fails, the plain page is served", plain.status === 200 && plain.text === INDEX, plain.status);
  globalThis.HTMLRewriter = keep;
}

console.log("\n# X-Robots-Tag");
{
  const noindex = ["/c/ffffffffff", `/c/${ada.card}`, "/e/ZZZZ", "/app", "/app/cards", "/app/people/abc", "/admin", "/signin", "/claim", "/redeem", "/redeem/ABCD", "/ui-test", "/privacy-request", "/e/ZZZZ/feedback", "/api/health", "/api/c/ffffffffff", "/media/avatar/aaaa.webp", "/some/unknown/page"];
  for (const p of noindex) {
    const r = await web.get(p);
    check(`${p} sends noindex`, /noindex/.test(r.headers.get("x-robots-tag") || ""), r.headers.get("x-robots-tag"));
  }
  const open = ["/", "/hosts", "/terms", "/privacy", "/hosts/", "/robots.txt", "/sitemap.xml"];
  for (const p of open) {
    const r = await web.get(p);
    check(`${p} does not (search engines may index it)`, r.headers.get("x-robots-tag") === null, r.headers.get("x-robots-tag"));
  }
  const hostPages = ["/", "/signin", "/events/abc", "/billing", "/account", "/hosts", "/terms", "/privacy", "/robots.txt"];
  for (const p of hostPages) {
    const r = await hostWeb.get(p);
    check(`host site ${p} sends noindex`, /noindex/.test(r.headers.get("x-robots-tag") || ""), r.headers.get("x-robots-tag"));
  }
  check("an error page does too", /noindex/.test((await web.get("/api/nothing")).headers.get("x-robots-tag") || ""));
}

console.log("\n# robots.txt and sitemap.xml");
{
  const r = await web.get("/robots.txt");
  check("robots.txt is plain text, 200", r.status === 200 && /^text\/plain/.test(r.headers.get("content-type")), r.headers.get("content-type"));
  const lines = r.text.split("\n").map((l) => l.trim());
  check("it allows the site", lines.includes("User-agent: *") && lines.includes("Allow: /"));
  for (const p of ["/api/", "/app", "/admin", "/signin", "/claim", "/redeem"]) check(`it disallows ${p}`, lines.includes(`Disallow: ${p}`), r.text);
  check("it does NOT disallow /c/ or /e/ (a crawler must be able to read their noindex)", !lines.some((l) => /^Disallow:\s*\/(c|e)(\/|\s*$)/i.test(l)) && !/^Disallow:\s*\/$/m.test(r.text), r.text);
  check("it links the sitemap on this site", lines.includes(`Sitemap: ${ORIGIN}/sitemap.xml`));
  const s = await web.get("/sitemap.xml");
  check("sitemap.xml is XML, 200", s.status === 200 && /^application\/xml/.test(s.headers.get("content-type")), s.headers.get("content-type"));
  const locs = [...s.text.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  check("it lists the four marketing pages and nothing else", JSON.stringify(locs) === JSON.stringify([`${ORIGIN}/`, `${ORIGIN}/hosts`, `${ORIGIN}/terms`, `${ORIGIN}/privacy`]), locs);
  check("no card, event, app, request or sign-in page is in it", !/\/c\/|\/e\/|\/app|\/privacy-request|\/signin|\/admin|\/claim|\/redeem/.test(s.text));
  const hr = await hostWeb.get("/robots.txt");
  check("the host site's robots.txt disallows everything", hr.status === 200 && /^Disallow: \/$/m.test(hr.text) && !/^Allow:/m.test(hr.text) && !/Sitemap/i.test(hr.text), hr.text);
  check("and it has no sitemap", (await hostWeb.get("/sitemap.xml")).status === 404);
  check("only GET reads them: a POST goes on to the app like any other path", (await web.post("/robots.txt", {})).text === INDEX || (await web.post("/robots.txt", {})).status !== 200);
  env.APP_ORIGIN = "https://elsewhere.example,https://host.elsewhere.example";
  check("the sitemap link and URLs follow APP_ORIGIN", (await web.get("/robots.txt")).text.includes("Sitemap: https://elsewhere.example/sitemap.xml") && (await web.get("/sitemap.xml")).text.includes("<loc>https://elsewhere.example/hosts</loc>"));
  env.APP_ORIGIN = "https://lanyard.test,https://host.lanyard.test";
}

console.log("\n# Security headers are the same on a rewritten page");
{
  const names = ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cache-control", "content-type"];
  const plain = await web.get("/app");
  const ev = await mkEvent("Header Night");
  for (const p of ["/", "/hosts", "/terms", "/privacy", `/c/${ada.card}`, "/c/ffffffffff", `/e/${ev.code}`, "/e/ZZZZ"]) {
    const r = await web.get(p);
    const diff = names.filter((n) => r.headers.get(n) !== plain.headers.get(n));
    check(`${p}: the headers match an unrewritten page`, diff.length === 0, diff.map((n) => [n, r.headers.get(n), plain.headers.get(n)]));
  }
  const csp = plain.headers.get("content-security-policy");
  check("the CSP is still the strict one: script-src 'self', no inline script, no frames", /script-src 'self'(;|$)/.test(csp) && !/script-src[^;]*unsafe/.test(csp) && /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /default-src 'self'/.test(csp), csp);
  check("the rewritten pages carry the page cache rule: always revalidate", (await web.get(`/c/${ada.card}`)).headers.get("cache-control") === "no-cache");
  check("no stale validators: the shell's ETag and length are not passed on", !(await web.get(`/c/${ada.card}`)).headers.get("etag") && !(await web.get("/hosts")).headers.get("content-length"));
  assetCalls.length = 0;
  const cond = await web.get(`/c/${ada.card}`, { "if-none-match": '"shell"' });
  check("a browser's If-None-Match is not passed to the shell, so a card never answers 304 from an old copy", cond.status === 200 && cond.text.includes("Ada Lovelace") && assetCalls.every((c) => !c.ifNoneMatch), [cond.status, assetCalls]);
  const bot = await web.get(`/c/${ada.card}`, { "user-agent": "facebookexternalhit/1.1" });
  const person = await web.get(`/c/${ada.card}`, { "user-agent": "Mozilla/5.0 (iPhone) Safari" });
  check("a chat app and a person get the very same page", bot.text === person.text && bot.status === 200);
  for (const ua of ["WhatsApp/2.23.20 A", "Twitterbot/1.0", "LinkedInBot/1.0", "Slackbot-LinkExpanding 1.0", "Mozilla/5.0 (compatible; Discordbot/2.0)"]) {
    check(`${ua.split(/[\/ ]/)[0]}: ${meta((await web.get(`/c/${ada.card}`, { "user-agent": ua })).text, "og:title")}`, meta((await web.get(`/c/${ada.card}`, { "user-agent": ua })).text, "og:title") === "Ada Lovelace");
  }
}

console.log("\n# Nothing else on the site changed");
{
  const seo = read("worker/seo.js").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  check("the Worker never builds HTML from text: no html:true, no innerHTML, no tag written in the file", !/html\s*:\s*true/.test(seo) && !/innerHTML/.test(seo) && !/<meta|<title|<link/.test(seo.replace(/\/\/.*$/gm, "")));
  check("every value goes in through setAttribute or setInnerContent", /setAttribute\(name, value\)/.test(seo) && /setInnerContent\(t\.title\)/.test(seo));
  check("the host site is never rewritten", /isHostSite\(url\)[^\n]*return c\.env\.ASSETS\.fetch/.test(seo));
  check("index.js hands the fallback to servePage and nothing else changed there", /app\.all\("\*", \(c\) => servePage\(c\)\)/.test(read("worker/index.js")));
  check("security.js still sets every header it set before", ["x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "strict-transport-security", "content-security-policy", "x-frame-options"].every((h) => read("worker/security.js").includes(`"${h}"`)));
  const migs = read("package.json");
  check("no migration for F37", !readdirSync(root + "migrations").some((f) => /seo|preview|robots/i.test(f)));
  check("test/seo.mjs runs before test/budget.mjs in npm test", migs.indexOf("node test/seo.mjs") > 0 && migs.indexOf("node test/seo.mjs") < migs.indexOf("node test/budget.mjs"));
}

await mf.dispose();
summary();
