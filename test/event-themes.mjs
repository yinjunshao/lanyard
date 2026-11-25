// F65 (D060): event themes and an advanced look.
//   the list (one shared file, read by the Worker and the front end), the CSS for every theme on every surface, the contrast of
//   the words on every strap (worked out from the CSS, not from the list alone), the Worker (saves a theme id, turns an unknown
//   one into default, checks a chosen text colour, keeps formal and night as they were), the migration, the form (the swatch
//   grid, Advanced through UiReveal, the F55 picker with no Plus gate on the host site, card colours still gated) and the
//   check-in page's code (CSS only; no theme script).
// The Worker is the real one on in-memory SQLite (test/harness.mjs). What the eye sees is checked in a browser (see the plan note).
// Run: node test/event-themes.mjs
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { makeEnv, makeDb, readMigration, migrationFiles, check, summary, becomeHost } from "./harness.mjs";
globalThis.location ??= new URL("https://host.lanyard.test/"); // the swatches read the store, which reads the site address
import { EVENT_THEMES, THEME_IDS, isTheme, themeOf, cleanTheme } from "../src/lib/eventthemes.js";
import { contrast, strapInk, STRAP_PRESETS } from "../src/lib/cardcolour.js";
import { INK_CHOICES, INK_MIN, INK_LOW, cleanInk, inkReads, inkOf, inkIn, strapIn } from "../src/lib/eventlook.js";
import { THEME_OPTIONS, createBody, detailsBody, eventFromBody } from "../src/lib/eventform.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const themesCss = read("src/styles/eventthemes.css");
const mainCss = read("src/styles/main.css");
const up = (s) => String(s).toUpperCase();
const ORIGINAL = ["default", "formal", "night"];

console.log("\n# The list: one shared file");
{
  check("there are at least eight themes, each with an id, a plain name, a strap, an ink, a tint and a dark flag",
    EVENT_THEMES.length >= 8 && EVENT_THEMES.every((t) => /^[a-z]+$/.test(t.id) && /^[A-Z][a-z]+$/.test(t.name) && /^#[0-9A-F]{6}$/.test(t.strap) && /^#[0-9A-F]{6}$/.test(t.ink) && /^#[0-9A-F]{6}$/.test(t.tint) && typeof t.dark === "boolean"), EVENT_THEMES.length);
  check("the first three are the originals under their old ids, in the old order (existing events do not change)", EVENT_THEMES.slice(0, 3).map((t) => t.id).join() === ORIGINAL.join());
  check("the ids and the names are all different", new Set(THEME_IDS).size === EVENT_THEMES.length && new Set(EVENT_THEMES.map((t) => t.name)).size === EVENT_THEMES.length);
  check("Forest, Ocean, Plum, Rose and Sand are there, and only Night is dark", ["forest", "ocean", "plum", "rose", "sand"].every(isTheme) && EVENT_THEMES.filter((t) => t.dark).map((t) => t.id).join() === "night");
  check("the names are plain colour or mood words (no named place, university or society)", EVENT_THEMES.every((t) => !/univers|college|society|union|club/i.test(t.name)));
  check("isTheme takes only the exact ids, and cleanTheme turns anything else into default", THEME_IDS.every(isTheme) && ![ "Forest", "FOREST", " forest", "forest ", "made-up", "", null, undefined, 0, ["forest"], { id: "forest" }, "constructor", "__proto__"].some(isTheme)
    && cleanTheme("forest") === "forest" && cleanTheme("made-up") === "default" && cleanTheme(undefined) === "default" && themeOf("nope").id === "default");
  check("the file has no imports (the Worker, the forms and this test all read it)", !/^import /m.test(read("src/lib/eventthemes.js")));
  check("the Worker reads the list (no list of its own any more) and the front end's options are made from it",
    /from "\.\.\/src\/lib\/eventthemes\.js"/.test(read("worker/hosts.js")) && !/\["default", "formal", "night"\]/.test(read("worker/hosts.js")) && /EVENT_THEMES\.map\(/.test(read("src/lib/eventform.js"))
    && THEME_OPTIONS.map((o) => o.value).join() === THEME_IDS.join() && THEME_OPTIONS.every((o, i) => o.label === EVENT_THEMES[i].name));
}

console.log("\n# The CSS draws every theme on every surface, with the colours in the list");
const rule = (css, selectorRe) => { const m = new RegExp(`(?:^|\\n)${selectorRe}\\s*\\{([^}]*)\\}`).exec(css); return m ? m[1] : null; };
const decl = (body, name) => new RegExp(`${name}:\\s*([^;]+);?`).exec(body || "")?.[1].trim();
{
  for (const t of EVENT_THEMES) {
    const head = t.id === "formal" ? mainCss.includes(".profile.formal .profile-strap { background: var(--card-strap, var(--formal-strap)); }") && /--formal-strap: #2b3138;/.test(mainCss)
      : t.id === "night" ? /\.badge\.night, \.profile\.night \{[^}]*--paper-raised: #1f1d1a;/.test(mainCss)
      : (() => { const r = rule(themesCss, `\\.profile\\.event-brand\\.${t.id}`); return !!r && up(decl(r, "--card-strap")) === t.strap && up(decl(r, "--card-strap-ink")) === t.ink && up(decl(r, "--paper-raised")) === t.tint; })();
    const present = rule(themesCss, `main\\.present\\.${t.id}`);
    const presentOk = !!present && (["default", "night"].includes(t.id) ? decl(present, "--event-strap") === "var(--strap)" : up(decl(present, "--event-strap")) === t.strap);
    const tintRule = rule(themesCss, `:root\\[data-theme="light"\\] main\\.present\\.${t.id}`);
    const tintOk = ORIGINAL.includes(t.id) ? !tintRule : !!tintRule && up(decl(tintRule, "--event-tint")) === t.tint;
    const poster = rule(themesCss, `\\.poster\\.${t.id}`);
    const posterOk = !!poster && up(decl(poster, "--event-strap")) === t.strap;
    check(`${t.id}: a rule on the check-in head, the Present page (stripe${ORIGINAL.includes(t.id) ? "" : " and tint"}) and the poster, with its colours`, head && presentOk && tintOk && posterOk, { head, presentOk, tintOk, posterOk });
  }
  check("main.css's --strap is the Persimmon strap (the default and Night Present stripes read it)", /--strap: #c4441e;/.test(mainCss) && themeOf("default").strap === "#C4441E");
  const ids = [...themesCss.matchAll(/(?:event-brand|present|poster)\.([a-z]+)\b/g)].map((m) => m[1]);
  check("the CSS names no theme that is not in the list (no stray rules)", ids.every((i) => THEME_IDS.includes(i)), [...new Set(ids)].filter((i) => !THEME_IDS.includes(i)));
  check("the CSS moves nothing: no transition, animation or transform in the theme file (D045)", !/transition|animation|transform|@keyframes/.test(themesCss));
  check("every surface gets the theme CSS from the one stylesheet (an @import in main.css, so no script chunk fetches a CSS file and the entry's preload map does not grow)", /^@import "\.\/eventthemes\.css";/m.test(mainCss) && ["src/components/EventPage.vue", "src/views/HostPresent.vue", "src/views/HostPrint.vue"].every((f) => !/eventthemes\.css/.test(read(f).replace(/\/\/[^\n]*/g, ""))));
  check("Present is tinted only in the light look, and falls back to the app's paper", /background: var\(--event-tint, var\(--paper\)\)/.test(read("src/views/HostPresent.vue")) && [...themesCss.matchAll(/--event-tint/g)].length === EVENT_THEMES.length - 3 && !/(^|\n)main\.present[^{]*\{[^}]*--event-tint/.test(themesCss));
  check("Present opens dark for a dark theme, from the list", /setDark\(themeOf\(live\.value\.event\.theme\)\.dark\)/.test(read("src/views/HostPresent.vue")));
}

console.log("\n# The words on every strap read (4.5:1 or more, worked out from the CSS)");
{
  const ratios = [];
  for (const t of EVENT_THEMES) {
    const r = ORIGINAL.slice(0, 1).includes(t.id) || !ORIGINAL.includes(t.id) ? rule(themesCss, `\\.profile\\.event-brand\\.${t.id}`) : null;
    const strap = r ? up(decl(r, "--card-strap")) : t.id === "formal" ? up(/--formal-strap: (#[0-9a-f]{6});/i.exec(mainCss)[1]) : t.strap;
    const ink = r ? up(decl(r, "--card-strap-ink")) : "#FFFFFF"; // main.css draws the words on Formal's and Night's strap as var(--card-strap-ink, #fff)
    const c = contrast(ink, strap);
    ratios.push(`${t.id} ${c.toFixed(2)}`);
    check(`${t.name}: ${ink} on ${strap} is ${c.toFixed(2)}:1`, c >= INK_MIN, c);
  }
  console.log("  " + ratios.join(", "));
  check("the default ink on a strap with no ink of its own is white in the CSS", /\.profile-strap \{[^}]*color: var\(--card-strap-ink, #fff\)/.test(mainCss) && /\.profile-strap-card \{[^}]*color: var\(--card-strap-ink, #fff\)/.test(mainCss));
  for (const t of EVENT_THEMES) {
    const paper = t.dark ? "#1F1D1A" : t.tint, text = t.dark ? "#F4F1EA" : "#1B1A17", quiet = t.dark ? "#A29D92" : "#6B675F";
    check(`${t.name}: the head's text and quiet text read on its paper (${contrast(text, paper).toFixed(1)} and ${contrast(quiet, paper).toFixed(1)}:1)`, contrast(text, paper) >= 4.5 && contrast(quiet, paper) >= 4.5);
  }
  check("the Present page's tint is only used in the light look, where the ink is #1B1A17 and the quiet text #6B675F: both read on every tint",
    EVENT_THEMES.filter((t) => !t.dark).every((t) => contrast("#1B1A17", t.tint) >= 4.5 && contrast("#6B675F", t.tint) >= 4.5));
  check("Formal's and Night's cards (head rules in main.css) are the same as before: strap #2b3138, white words; Night's paper is the dark card's", themeOf("formal").strap === "#2B3138" && /--formal-strap: #2b3138;/.test(mainCss) && /\.badge\.night, \.profile\.night \{\s*--paper: #141311; --paper-raised: #1f1d1a; --ink: #f4f1ea;/.test(mainCss));
  check("Midnight changes nothing here: a head is a card with its own paper, and Present sets its own light or dark", /:root\[data-theme="midnight"\] :is\(\.badge, \.profile\)/.test(mainCss) && !/data-theme="midnight"/.test(themesCss) && /dataset\.theme = on \? "night" : "light"/.test(read("src/views/HostPresent.vue")));
}

console.log("\n# The automatic ink always reads; only a chosen one can be refused");
{
  let worst = 99, worstAt = "";
  for (let r = 0; r < 256; r += 5) for (let g = 0; g < 256; g += 5) for (let b = 0; b < 256; b += 5) {
    const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    const best = Math.max(contrast("#FFFFFF", hex), contrast("#000000", hex));
    if (best < worst) { worst = best; worstAt = hex; }
  }
  check(`white or black reaches 4.5:1 on every colour tried (the worst is ${worst.toFixed(2)}:1 at ${worstAt}), so a brand colour is never refused for its automatic ink`, worst >= INK_MIN, [worst, worstAt]);
  check("the ink the page draws for a brand colour (strapInk) is the better of white and black", ["#C4441E", "#F5E663", "#808080", "#767676", "#777777", "#0A0A0A"].every((h) => contrast(strapInk(h) === "#000" ? "#000000" : "#FFFFFF", h) >= INK_MIN));
  check("the ten card presets and every theme strap read with their own ink", STRAP_PRESETS.every((p) => contrast(strapInk(p.hex) === "#000" ? "#000000" : "#FFFFFF", p.hex) >= INK_MIN));
  check("the two text colours a host can choose are white and the card's near-black, in capitals", JSON.stringify(INK_CHOICES.map((c) => c.value)) === '["#FFFFFF","#1B1A17"]' && INK_MIN === 4.5);
  check("cleanInk keeps only those two (any case), and everything else is Automatic (null)", cleanInk("#ffffff") === "#FFFFFF" && cleanInk("#1b1a17") === "#1B1A17" && [undefined, null, "", "#FF0000", "#FFF", "white", 5, ["#FFFFFF"], "#FFFFFFF"].every((v) => cleanInk(v) === null));
  check("a chosen ink reads or does not by the real sum: white on Sand fails (3.8), dark on Sand passes; dark on Plum fails, white passes", !inkReads("#FFFFFF", themeOf("sand").strap) && inkReads("#1B1A17", themeOf("sand").strap) && !inkReads("#1B1A17", themeOf("plum").strap) && inkReads("#FFFFFF", themeOf("plum").strap));
  check("the strap in effect is the host's colour, else the theme's; the ink is the choice, else white or black by the colour, else the theme's own", strapIn("forest", "") === "#2A6B45" && strapIn("forest", "#123456") === "#123456" && inkOf("sand", "", null) === "#1B1A17" && inkOf("forest", "#F5E663", null) === "#000" && inkOf("forest", "#F5E663", "#ffffff") === "#FFFFFF");
  check("a plain theme sends no ink at all (its CSS draws it); a colour or a choice sends one", inkIn({ theme: "forest", strap_color: null, strap_ink: null }) === null && inkIn({ theme: "forest", strap_color: "#F5E663", strap_ink: null }) === "#000" && inkIn({ theme: "sand", strap_color: null, strap_ink: "#1B1A17" }) === "#1B1A17");
  check("INK_LOW is plain words, with the way out", /hard to read/.test(INK_LOW) && /Automatic/.test(INK_LOW) && !/[—–]/.test(INK_LOW));
}

console.log("\n# The Worker keeps a theme id, turns anything else into default, checks a chosen text colour (the real Worker)");
const T = await makeEnv();
const { client, env, q1 } = T;
const raw = env.DB.raw;
const A = client({ ip: "10.65.0.1", site: "host" });
const aInfo = await becomeHost(A, { kind: "company", name: "Alpha Events" });
raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 100, 0, 'test', ?)").run("cr-a", aInfo.org.json.id, Date.now());
const pub = client({ ip: "10.65.0.2" });
let n = 0;
const mk = async (body) => { n += 1; return A.post("/api/host/events", { name: `Event ${n}`, ...body }); };
const page = async (code) => (await pub.get(`/api/e/${code}`)).json.event;
const liveOf = async (id) => (await A.get(`/api/host/events/${id}/live`)).json.event;
{
  const f = await mk({ theme: "forest" });
  check("theme: \"forest\" is saved and served, with no ink (the CSS draws it)", f.status === 201 && q1("SELECT theme FROM events WHERE id = ?", f.json.id).theme === "forest" && (await page(f.json.code)).theme === "forest" && (await page(f.json.code)).strapInk === null, f.text);
  for (const id of THEME_IDS) {
    const r = await mk({ theme: id });
    check(`every id in the list is saved as it is: ${id}`, r.status === 201 && q1("SELECT theme FROM events WHERE id = ?", r.json.id).theme === id);
  }
  const bad = [];
  for (const v of ["made-up", "Forest", "FOREST", "forest ", "", null, 7, ["forest"], { id: "forest" }, "constructor", "__proto__", "forest; DROP TABLE events"]) {
    const r = await mk({ theme: v });
    if (!(r.status === 201 && q1("SELECT theme FROM events WHERE id = ?", r.json.id).theme === "default")) bad.push(v);
  }
  check("theme: \"made-up\" (and every other odd value) is saved as default", bad.length === 0, bad);
  const none = await mk({});
  check("an event with no theme in the request is default", q1("SELECT theme FROM events WHERE id = ?", none.json.id).theme === "default");
  const e = await mk({ theme: "ocean" });
  const put = await A.put(`/api/host/events/${e.json.id}`, { theme: "made-up" });
  check("an edit with an unknown theme goes to default, and an edit with no theme leaves it alone", put.status === 200 && q1("SELECT theme FROM events WHERE id = ?", e.json.id).theme === "default"
    && (await A.put(`/api/host/events/${e.json.id}`, { theme: "plum" })).status === 200 && (await A.put(`/api/host/events/${e.json.id}`, { venue: "Hall" })).status === 200 && q1("SELECT theme FROM events WHERE id = ?", e.json.id).theme === "plum");
  const fm = await mk({ theme: "formal", strapColor: "#2A6F4E" }), ni = await mk({ theme: "night" });
  const fp = await page(fm.json.code), np = await page(ni.json.code);
  check("formal and night events are saved and served as before: the same id, the colour as sent, no ink for a plain theme", fp.theme === "formal" && fp.strapColor === "#2A6F4E" && np.theme === "night" && np.strapColor === null && np.strapInk === null);
}

console.log("\n# A brand colour, and the text colour on the strap");
{
  const a = await mk({ theme: "forest", strapColor: "#F5E663" });
  const pa = await page(a.json.code);
  check("a brand colour is saved and the page is told the ink for it (black on a pale yellow, white on a dark one)", a.status === 201 && pa.strapColor === "#F5E663" && pa.strapInk === "#000"
    && (await page((await mk({ strapColor: "#12345A" })).json.code)).strapInk === "#fff");
  const clear = await A.put(`/api/host/events/${a.json.id}`, { strapColor: "" });
  check("clearing the colour goes back to the theme and sends no ink", clear.status === 200 && (await page(a.json.code)).strapColor === null && (await page(a.json.code)).strapInk === null);
  const s = await mk({ theme: "sand", strapInk: "#1b1a17" });
  const ps = await page(s.json.code);
  check("a chosen text colour that reads is saved (any case), served to the page, and shown to the host as a choice", s.status === 201 && ps.strapInk === "#1B1A17" && (await liveOf(s.json.id)).strapInkChoice === "#1B1A17" && q1("SELECT strap_ink FROM events WHERE id = ?", s.json.id).strap_ink === "#1B1A17");
  const live0 = await liveOf((await mk({ theme: "forest" })).json.id);
  check("an event with no choice shows none to the host (Automatic)", live0.strapInkChoice === null && live0.strapInk === null);
  const refused = await mk({ theme: "sand", strapInk: "#FFFFFF" });
  check("white on Sand (3.8:1) is refused with the plain message and nothing is created", refused.status === 400 && refused.json.error === INK_LOW && refused.json.code === "ink_low" && q1("SELECT COUNT(*) AS c FROM events WHERE name = ?", `Event ${n}`).c === 0, refused.text);
  const dark = await mk({ strapColor: "#12345A", strapInk: "#1B1A17" });
  check("dark text on a dark brand colour is refused", dark.status === 400 && dark.json.code === "ink_low", dark.text);
  const okInk = await mk({ strapColor: "#12345A", strapInk: "#FFFFFF" });
  check("white on that dark colour is saved", okInk.status === 201);
  const e = await mk({ theme: "sand", strapInk: "#1B1A17" });
  const ch = await A.put(`/api/host/events/${e.json.id}`, { theme: "plum" });
  check("changing only the theme to one the saved text colour cannot read is refused (checked against the saved ink), and nothing changes", ch.status === 400 && ch.json.code === "ink_low" && q1("SELECT theme FROM events WHERE id = ?", e.json.id).theme === "sand", ch.text);
  const both = await A.put(`/api/host/events/${e.json.id}`, { theme: "plum", strapInk: "" });
  check("changing the theme and clearing the text colour together is saved", both.status === 200 && q1("SELECT theme, strap_ink FROM events WHERE id = ?", e.json.id).theme === "plum" && q1("SELECT strap_ink FROM events WHERE id = ?", e.json.id).strap_ink === null);
  const colour = await A.put(`/api/host/events/${(await mk({ theme: "sand", strapInk: "#1B1A17" })).json.id}`, { strapColor: "#12345A" });
  check("a new brand colour that the saved text colour cannot read is refused", colour.status === 400 && colour.json.code === "ink_low");
  const junk = await mk({ theme: "forest", strapInk: "#FF0000" });
  check("a text colour that is not one of the two is Automatic, not an error", junk.status === 201 && q1("SELECT strap_ink FROM events WHERE id = ?", junk.json.id).strap_ink === null);
  const dup = await A.post(`/api/host/events/${s.json.id}/duplicate`, { name: "Again" });
  check("a copy of an event keeps its theme and its text colour", dup.status === 201 && q1("SELECT theme, strap_ink FROM events WHERE id = ?", dup.json.id).theme === "sand" && q1("SELECT strap_ink FROM events WHERE id = ?", dup.json.id).strap_ink === "#1B1A17");
  const noAuth = await client({ ip: "10.65.0.9", site: "host" }).post("/api/host/events", { name: "x", theme: "forest", strapInk: "#FFFFFF" });
  check("a signed-out request is still refused (401) before any of this", noAuth.status === 401);
}

console.log("\n# The form says what the Worker serves (the preview shows what attendees will see)");
{
  const body = { name: "T", theme: "sand", strapColor: "", strapInk: "#1B1A17", perks: [], questions: [] };
  check("the preview's head is made from the same rules: theme, colour, ink", eventFromBody(body).theme === "sand" && eventFromBody(body).strapInk === "#1B1A17" && eventFromBody({ ...body, strapInk: "" }).strapInk === null
    && eventFromBody({ name: "T", theme: "plum", strapColor: "#F5E663" }).strapInk === "#000" && eventFromBody({ name: "T", theme: "plum" }).strapInk === null && eventFromBody({ name: "T", theme: "made-up" }).theme === "default");
  const lv = await liveOf((await mk({ name: "Same", theme: "sand", strapInk: "#1B1A17" })).json.id);
  check("…and equals what a saved event serves (theme, colour, ink)", eventFromBody(body).strapInk === (await page(lv.code)).strapInk && eventFromBody(body).theme === lv.theme);
  check("Create sends the text colour only when one is chosen (so a default form sends what it always did); Details sends it, or an empty string to clear it, when its form has the field",
    !("strapInk" in createBody({ name: "x", theme: "default", strapColor: "", perks: [], q1: "", q2: "", feedbackQuestions: [] })) && createBody({ name: "x", theme: "sand", strapInk: "#1B1A17", strapColor: "", perks: [], q1: "", q2: "", feedbackQuestions: [] }).strapInk === "#1B1A17"
    && detailsBody({ name: "x", strapInk: "" }).strapInk === "" && !("strapInk" in detailsBody({ name: "x" })));
}

console.log("\n# The migration is one nullable column; events.theme was always free text");
{
  const files = migrationFiles();
  check("0043 is the next migration after 0042, named for the text colour", files.indexOf("0043_event_strap_ink.sql") === files.indexOf("0042_card_material.sql") + 1 && files.indexOf("0043_event_strap_ink.sql") === files.length - 1);
  const sql = readMigration("0043_event_strap_ink.sql").replace(/--.*$/gm, "").trim();
  check("it only adds one nullable column to events (additive, safe to apply before the new code is deployed)", sql === "ALTER TABLE events ADD COLUMN strap_ink TEXT;" && !/NOT NULL|DEFAULT|DROP|UPDATE|DELETE/i.test(sql));
  check("events.theme has no CHECK constraint (a new id needs no migration)", !/CHECK\s*\(/i.test((q1("SELECT sql FROM sqlite_master WHERE name = 'events'") || {}).sql || ""));
  const old = makeDb({ before: "0043" });
  old.raw.prepare("INSERT INTO orgs (id, name, org_type, verification_status, created_at) VALUES ('o1', 'Old', 'company', 'approved', 1)").run();
  old.raw.prepare("INSERT INTO events (id, org_id, code, name, theme, strap_color, created_at) VALUES ('e1', 'o1', 'ABCDE', 'Old', 'night', '#2A6F4E', 1)").run();
  old.raw.exec(readMigration("0043_event_strap_ink.sql"));
  const row = old.raw.prepare("SELECT * FROM events WHERE id = 'e1'").get();
  check("an existing event keeps every value and gets no text colour", row.strap_ink === null && row.theme === "night" && row.strap_color === "#2A6F4E" && row.name === "Old");
}

console.log("\n# The check-in page gets no script for this (CSS only)");
{
  const ep = read("src/components/EventPage.vue");
  check("EventPage imports no theme list and no colour sums (the CSS comes with main.css)", !/^import [^\n]*(eventthemes\.js|eventlook|cardcolour|colourpanel)/m.test(ep));
  check("the head's class is the id and its colours are data in two CSS custom properties", /class="profile event-brand" :class="event\.theme"/.test(ep) && /'--card-strap': event\.strapColor, '--card-strap-ink': event\.strapInk/.test(ep));
  check("a default event with no colour and no text colour is still the plain head (nothing is branded)", /const branded = \(e\) => \(e\.theme && e\.theme !== "default"\) \|\| !!e\.strapColor \|\| !!e\.strapInk;/.test(ep));
}

console.log("\n# The form: a theme grid, and Advanced with the F55 picker, free for hosts (rendered on the server)");
const vite = await createServer({
  configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
});
try {
  const load = async (p) => (await vite.ssrLoadModule("/" + p)).default;
  const EventLook = await load("src/components/EventLook.vue"), EventStepLook = await load("src/components/EventStepLook.vue"), CardSwatches = await load("src/components/CardSwatches.vue");
  // The swatches link to the Plus page with the router's own link; a stand-in draws it as a plain link here.
  const render = (comp, props) => renderToString(createSSRApp({ render: () => h(comp, props) }).component("router-link", { props: ["to"], render() { return h("a", { href: this.to, class: this.$attrs.class, "aria-label": this.$attrs["aria-label"] }, this.$slots.default?.()); } })).then((x) => x.replace(/<!--[\s\S]*?-->/g, ""));
  const form = (o = {}) => ({ theme: "default", strapColor: "", strapInk: "", ...o });
  const look = (o, prefix = "ev") => render(EventLook, { form: form(o), prefix });
  const html = await look({ theme: "forest" });
  const radios = [...html.matchAll(/<button[^>]*role="radio"[^>]*data-pick="(\w+)"[^>]*>/g)];
  check("the grid is a radio group of one swatch per theme in the list, in order, named by its label", radios.map((m) => m[1]).join() === THEME_IDS.join() && radios.length >= 8 && /role="radiogroup" aria-labelledby="ev-theme-l"/.test(html) && /id="ev-theme-l"/.test(html) && /id="ev-theme"/.test(html));
  check("each swatch shows its name and a small head in its own colours; only the chosen one is checked, and one swatch is in the tab order", EVENT_THEMES.every((t) => html.includes(`>${t.name}</span>`) && html.includes(`--th-strap:${t.strap}`) && html.includes(`--th-tint:${t.tint}`))
    && radios.filter((m) => /aria-checked="true"/.test(m[0])).map((m) => m[1]).join() === "forest" && radios.filter((m) => /tabindex="0"/.test(m[0])).map((m) => m[1]).join() === "forest");
  const none = [...(await look({ theme: "made-up" })).matchAll(/<button[^>]*role="radio"[^>]*data-pick="(\w+)"[^>]*>/g)];
  check("a form with a theme that is not in the list has one tab stop (the first) and none checked", none.filter((m) => /tabindex="0"/.test(m[0])).map((m) => m[1]).join() === "default" && none.every((m) => /aria-checked="false"/.test(m[0])));
  const src = read("src/components/EventLook.vue");
  check("the arrow keys, Home and End move and choose, wrapping round (one tab stop, like the card swatches)", /ArrowRight/.test(src) && /ArrowLeft/.test(src) && /ArrowUp/.test(src) && /ArrowDown/.test(src) && /Home: 0/.test(src) && /End: n - 1/.test(src) && /:tabindex="tabbable\(th, i\) \? 0 : -1"/.test(src));
  check("each swatch is at least 44 px to press, and the ring fades and grows (opacity and transform, tokens), still under reduced motion", /min-height: 44px/.test(src) && /\.el-ring \{[^}]*opacity: 0; transform: scale\(0\.97\); transition: opacity var\(--dur-fast\) var\(--ease-out\), transform var\(--dur-fast\) var\(--ease-out\)/.test(src) && /@media \(prefers-reduced-motion: reduce\) \{ \.el-ring, \.el-chev \{ transition: none; \} \}/.test(src));
  check("the grid is two across on a phone and four from 560 px", /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(src) && /min-width: 560px\) \{ \.el-grid \{ grid-template-columns: repeat\(4/.test(src));
  check("Advanced opens with UiReveal (the F57 height ease, kept in the page and inert while shut), from a button that says whether it is open", /import UiReveal from "\.\/ui\/UiReveal\.vue"/.test(src) && /<UiReveal :open="open" keep>/.test(src) && /:aria-expanded="open"/.test(src) && /:aria-controls="id\('adv'\)"/.test(src) && !/<Transition|<transition/.test(src));
  check("Advanced starts shut, and starts open when the form already has a brand colour or a text colour", /const open = ref\(!!props\.form\.strapColor \|\| !!props\.form\.strapInk\)/.test(src) && /class="reveal"[^>]*inert/.test(html) && !/class="reveal open/.test(html) && /class="reveal open/.test(await look({ strapColor: "#123456" })) && /class="reveal open/.test(await look({ strapInk: "#FFFFFF" })));
  check("under Advanced: the brand colour swatches, the text on the strap (Automatic, White, Dark) and the company branding switch, off and disabled, saying it is coming soon",
    /id="ev-strap"/.test(html) && /role="radiogroup" aria-label="Strap colour"/.test(html) && />Automatic</.test(html) && />White</.test(html) && />Dark</.test(html) && /Use our company branding/.test(html) && /<input type="checkbox" disabled/.test(html) && /Coming soon/.test(html) && !/<input type="checkbox"[^>]*checked/.test(html));
  check("the old controls are gone from step 2: no select, no native colour input", !/type="color"|UiSelect/.test(read("src/components/EventStepLook.vue") + src) && /<EventLook :form="form" prefix="ev" \/>/.test(read("src/components/EventStepLook.vue")));
  const step = await render(EventStepLook, { form: { ...form(), from: "" } });
  check("step 2 is the grid and Advanced under the Check-in page heading, with the ids the stepper counts (ev-theme, ev-strap)", /id="ev-theme"/.test(step) && /id="ev-strap"/.test(step) && /Check-in page/.test(step) && /role="radio"/.test(step));
  const copy = await render(EventStepLook, { form: { ...form(), from: "ev-old" }, facts: [["Theme", "Forest"]], factsState: "ready" });
  check("a copy of an earlier event still shows no grid (it keeps the earlier event's look)", !/role="radio"/.test(copy));
  const hl = read("src/views/HostLive.vue");
  check("the Details tab uses the same component with its own ids (d-theme, d-strap) and a text colour in its form; the old select and colour input are gone",
    /<EventLook :form="d" prefix="d" \/>/.test(hl) && /strapInk: e\.strapInkChoice \|\| ""/.test(hl) && !/type="color"|id="d-theme"|THEME_OPTIONS/.test(hl) && /id="d-theme"/.test(await look({}, "d")) && /id="d-strap"/.test(await look({}, "d")));
  check("the preview strip lists the same themes, and has no native colour input any more", /EVENT_THEMES\.map\(/.test(read("src/components/EventPreview.vue")) && !/type="color"/.test(read("src/components/EventPreview.vue")) && !/strap-color/.test(read("src/views/HostDashboard.vue") + hl));
  const sandHtml = await look({ theme: "sand" }), plumHtml = await look({ theme: "plum" });
  check("a text colour that would be hard to read is not offered: white on Sand and dark on Plum are disabled, Automatic never is, and a plain line says why",
    /<button[^>]*role="radio"[^>]*disabled[^>]*>White<\/button>/.test(sandHtml) && !/<button[^>]*role="radio"[^>]*disabled[^>]*>(Automatic|Dark)<\/button>/.test(sandHtml) && /White would be hard to read on this strap, so it is not offered\./.test(sandHtml)
    && /<button[^>]*role="radio"[^>]*disabled[^>]*>Dark<\/button>/.test(plumHtml) && !/<button[^>]*role="radio"[^>]*disabled[^>]*>(Automatic|White)<\/button>/.test(plumHtml) && /Dark would be hard to read on this strap, so it is not offered\./.test(plumHtml));
  const midGrey = await look({ strapColor: "#767676" });
  check("on a mid-grey brand colour (the hardest case for the automatic ink) the sums leave White open (4.5:1) and close Dark (3.8:1), and Automatic is always open", /<button[^>]*role="radio"[^>]*disabled[^>]*>Dark<\/button>/.test(midGrey) && !/<button[^>]*role="radio"[^>]*disabled[^>]*>(White|Automatic)<\/button>/.test(midGrey));
  check("a text colour that stops reading when the colour or theme changes goes back to Automatic, and the form says so", /inkReads\(props\.form\.strapInk, strap\.value\)\) \{ props\.form\.strapInk = ""; reset\.value = true; \}/.test(src) && /went back to Automatic/.test(src));
  check("Review lists a chosen text colour, and says nothing for Automatic", read("src/lib/eventsteps.js").includes('["Text on the strap", c.name]'));

  const gate = await render(CardSwatches, { modelValue: "", theme: "default" });
  const hostGate = await render(CardSwatches, { modelValue: "", theme: "default", plusGate: false, themeColour: "#2A6B45", themeName: "Forest" });
  check("a card's swatches are as they were: without Plus the Custom swatch is a link to the Plus page, and the card form never passes the new props", /<a[^>]*href="\/app\/settings\/plan"[^>]*swatch-custom|<a[^>]*swatch-custom[^>]*href="\/app\/settings\/plan"/.test(gate) && /Custom colour, part of Lanyard Plus/.test(gate) && />Plus</.test(gate) && !/plus-gate|plusGate/.test(read("src/components/CardForm.vue") + read("src/views/Cards.vue")) && /<CardSwatches v-model="f\.strapColor" :theme="f\.theme" \/>/.test(read("src/components/CardForm.vue")), gate.slice(-300));
  check("on the host site the Plus gate is not applied: Custom is a button that opens the panel, with no Plus label and no link, and the caption names the theme's colour", /<button[^>]*swatch-custom[^>]*aria-haspopup="dialog"/.test(hostGate) && !/Lanyard Plus|settings\/plan|sw-plus/.test(hostGate) && />Theme colour: Forest</.test(hostGate), hostGate.slice(-420));
  check("the brand colour is the same ten presets and the same lazy panel as a card's, and the Worker's card colour rules (Plus-only any colour) are untouched", /STRAP_PRESETS/.test(read("src/components/CardSwatches.vue")) && /await import\("\.\/CardColourPanel\.vue"\)/.test(read("src/components/CardSwatches.vue")) && !/eventthemes|eventlook/.test(read("worker/cardcolour.js")));
  check("the public check-in page and the card page import neither the swatches nor the panel nor the look component", !/CardSwatches|CardColourPanel|EventLook/.test(read("src/components/EventPage.vue") + read("src/views/EventJoin.vue") + read("src/views/PublicCard.vue") + read("src/components/CardView.vue")));
} finally {
  await vite.close();
}

summary();
