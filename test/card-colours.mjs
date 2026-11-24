// F55: card colour presets and the Plus colour wheel. Grows with each task:
//   F55.0 the deeper brand orange (the value and the ratios are pinned here),
//   F55.1 presets and the server rule, F55.2 the colour panel, F55.3 the text colour.
// The Worker is the real one on in-memory SQLite (test/harness.mjs); each query gets a turn of the event loop
// (withLatency), so requests sent together interleave as they do on D1 (D040).
// Run: node test/card-colours.mjs
import { readFileSync } from "node:fs";
import { makeEnv, withLatency, check, summary } from "./harness.mjs";
import { STRAP_PRESETS, strictHex, typedHex, isPreset, contrast, strapInk } from "../src/lib/cardcolour.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

console.log("\n# F55.0 The brand strap orange is #C4441E");
{
  const css = read("src/styles/main.css");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")));
  const strap = /--strap:\s*(#[0-9a-f]{6});/i.exec(root)?.[1];
  const deep = /--strap-deep:\s*(#[0-9a-f]{6});/i.exec(root)?.[1];
  check("--strap is #c4441e", strap?.toLowerCase() === "#c4441e", strap);
  check(`white on the strap is at least 4.5:1 (${ratio("#ffffff", strap).toFixed(2)}:1)`, ratio("#ffffff", strap) >= 4.5);
  check("--strap-deep (pressed button, error text) is darker than the strap and reads on the paper at 4.5:1", lum(deep) < lum(strap) && ratio(deep, "#f4f1ea") >= 4.5 && ratio(deep, "#fffdf8") >= 4.5);
  check("the small event line on a card's strap is solid white by default, never the old 82% white (3.9:1)", /\.badge-strap-event \{[^}]*color: var\(--card-strap-ink, #fff\);/.test(css) && /\.profile-strap-card \{[^}]*color: var\(--card-strap-ink, #fff\);/.test(css) && !/rgba\(255,\s*255,\s*255,\s*\.?0?\.82\)/.test(css));
  check("the card image export draws the event line in solid white too (never the old 82% white)", !/255,255,255,\.82/.test(read("src/lib/qr.js")));
  const stale = ["index.html", "src/lib/qr.js", "src/styles/main.css", "public/icon.svg", "public/favicon.svg", "public/host-icon.svg", "scripts/make-og-image.mjs", "src/views/HostPrint.vue", "src/components/EventPreview.vue", "src/components/EventStepLook.vue", "src/views/HostLive.vue", "src/components/PhotoCropper.vue", "logo-kit/GUIDELINES.md"].filter((f) => /d9502b/i.test(read(f)));
  check("the old #D9502B is gone from the app, public icons, boot screen and brand kit", stale.length === 0, stale);
  check("the boot screen and the card image use the new value", /#C4441E/.test(read("index.html")) && /strap: "#C4441E"/.test(read("src/lib/qr.js")));
}

console.log("\n# F55.1 The ten presets");
{
  check("there are ten presets, each with a name and a #RRGGBB, no two the same", STRAP_PRESETS.length === 10 && new Set(STRAP_PRESETS.map((p) => p.hex)).size === 10 && new Set(STRAP_PRESETS.map((p) => p.name)).size === 10 && STRAP_PRESETS.every((p) => /^#[0-9A-F]{6}$/.test(p.hex) && p.name));
  check("the first is Persimmon, the brand strap, and Graphite (Formal's strap) is one of them", STRAP_PRESETS[0].hex === "#C4441E" && STRAP_PRESETS.some((p) => p.name === "Graphite" && p.hex === "#2B3138"));
  for (const p of STRAP_PRESETS) check(`${p.name} ${p.hex}: white strap text is ${contrast("#FFFFFF", p.hex).toFixed(2)}:1 (at least 4.5:1)`, contrast("#FFFFFF", p.hex) >= 4.5);
  check("every preset's strap text, as the Worker works it out, is white", STRAP_PRESETS.every((p) => strapInk(p.hex) === "#fff"));
  // Whatever colour a Plus account picks, the words on its strap are white or black and reach 4.5:1.
  let worst = 99, bad = 0, n = 0;
  for (let r = 0; r < 256; r += 5) for (let g = 0; g < 256; g += 5) for (let b = 0; b < 256; b += 5) {
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    const c = contrast(strapInk(hex) === "#fff" ? "#FFFFFF" : "#000000", hex); worst = Math.min(worst, c); n++; if (c < 4.5) bad++;
  }
  check(`for every colour on a coarse sweep of the RGB cube (${n} colours) the strap text is white or black at 4.5:1 or better (worst ${worst.toFixed(2)}:1)`, bad === 0);
  check("strictHex takes only a string with # and six digits, in any case, and gives capitals", strictHex("#c4441e") === "#C4441E" && strictHex("#ABCDEF") === "#ABCDEF" && ["C4441E", "#abc", "#12345", "#1234567", "#12345G", " #123456", 123456, null, undefined, ["#123456"], {}].every((v) => strictHex(v) === null));
  check("typedHex (the hex box) takes # or not, three or six digits, spaces around", typedHex("1a2b3c") === "#1A2B3C" && typedHex(" #1a2b3c ") === "#1A2B3C" && typedHex("#abc") === "#AABBCC" && typedHex("abc") === "#AABBCC" && ["#12", "#12345", "#1234567", "xyz", "", "#12 34 56"].every((v) => typedHex(v) === null));
  check("isPreset is exact (one digit off is not a preset)", isPreset("#c4441e") && isPreset("#12817A") && !isPreset("#C4441F") && !isPreset("#12817"));
}

console.log("\n# F55.1 The server rule: a free account saves only a preset");
const T = await makeEnv();
const { client, q1, env } = T;
const base = env.DB;
env.DB = withLatency(base);
let ip = 10;
async function person(name, { plus = false, lapsed = false } = {}) {
  const c = client({ ip: "198.51.100." + ip++ });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "CS" });
  if (r.status !== 201) throw new Error(r.text);
  const me = (await c.get("/api/me")).json;
  const id = me.user.id;
  if (plus) base.raw.prepare("UPDATE users SET plan = 'plus', plan_until = ? WHERE id = ?").run(lapsed ? Date.now() - 86400e3 : Date.now() + 30 * 86400e3, id);
  return { c, id, card: me.cards[0].cardId };
}
const strapOf = (id) => q1("SELECT strap_color FROM cards WHERE id = ?", id)?.strap_color ?? null;
const nameOf = (id) => q1("SELECT name FROM cards WHERE id = ?", id)?.name;
const cardsOf = (uid) => q1("SELECT COUNT(*) n FROM cards WHERE user_id = ?", uid).n;
const put = (p, body, h) => p.c.put(`/api/cards/${p.card}`, body, h);
{
  const free = await person("Free Fran");
  check("a free account's plan says no custom colours", (await free.c.get("/api/me")).json.plan.customStrap === false);
  // Non-presets of every shape: 400, and nothing is saved (the name sent with it is not saved either).
  const shapes = ["#123456", "#abcdef", "#ABCDEF", "#123", "#abc", "123456", "ABCDEF", "abc", "#C4441F", "#12345", "#1234567", "#12345g", "red", "rgb(1,2,3)", "javascript:alert(1)", " #123456", "#123456 ", "#12 34 56", 123456, true, ["#C4441E"], { hex: "#C4441E" }];
  const out = [];
  for (const v of shapes) {
    const r = await put(free, { name: "Changed", strapColor: v });
    out.push([JSON.stringify(v), r.status, nameOf(free.card), strapOf(free.card)]);
  }
  check(`a free account's PUT with a non-preset strapColor (${shapes.length} shapes: #RGB and #RRGGBB, any case, with and without #, junk, other types) gets 400`, out.every(([, st]) => st === 400), out.filter(([, st]) => st !== 400));
  check("...and nothing is saved: the colour is still empty and the name sent with it was not saved", out.every(([, , nm, s]) => nm !== "Changed" && s === null));
  const snake = await put(free, { strap_color: "#123456" });
  check("the older field name strap_color is held to the same rule", snake.status === 400 && strapOf(free.card) === null);
  const msg = (await put(free, { strapColor: "#123456" })).json.error;
  check("the refusal is in plain words that name Plus and the presets", /preset/.test(msg) && /Plus/.test(msg) && !/undefined|\[object/.test(msg), msg);
  const junk = (await put(free, { strapColor: "red" })).json.error;
  check("a malformed colour is told how it should look", /# then six/.test(junk), junk);

  // Presets are saved, in any case; empty and null clear.
  const saved = [];
  for (const p of STRAP_PRESETS) { const r = await put(free, { strapColor: p.hex.toLowerCase() }); saved.push([r.status, strapOf(free.card)]); }
  check("each of the ten presets is saved by a free account (sent in lower case, kept in capitals)", saved.every(([st, v], i) => st === 200 && v === STRAP_PRESETS[i].hex), saved);
  const meCard = (await free.c.get("/api/me")).json.cards[0];
  check("the saved colour comes back on /api/me with the colour for the words on the strap", meCard.strapColor === STRAP_PRESETS[9].hex && meCard.strapInk === "#fff");
  check("an empty string clears it", (await put(free, { strapColor: "" })).status === 200 && strapOf(free.card) === null);
  await put(free, { strapColor: "#2F5BD3" });
  check("null clears it", (await put(free, { strapColor: null })).status === 200 && strapOf(free.card) === null);
  await put(free, { strapColor: "#2F5BD3" });
  check("an edit that does not mention the colour leaves it alone", (await put(free, { name: "Renamed" })).status === 200 && strapOf(free.card) === "#2F5BD3" && nameOf(free.card) === "Renamed");

  // The plan is read from the server, never from the request.
  const forged = [{ plan: "plus" }, { tier: "plus" }, { customStrap: true }, { plan: { tier: "plus", customStrap: true } }, { user: { plan: "plus" } }];
  const f = [];
  for (const extra of forged) f.push((await put(free, { strapColor: "#123456", ...extra })).status);
  check("a free account claiming to be Plus in the body (plan, tier, customStrap) is still refused", f.every((s) => s === 400) && strapOf(free.card) === "#2F5BD3", f);
  const viaHeader = await free.c.put(`/api/cards/${free.card}?plan=plus`, { strapColor: "#123456" }, { "x-plan": "plus" });
  check("...and so is a query string or a header that says it", viaHeader.status === 400 && strapOf(free.card) === "#2F5BD3");
  const forgedNew = await free.c.post("/api/cards", { name: "Sneaky", strapColor: "#123456", plan: "plus" });
  check("a new card from a free account with a custom colour is refused and no card is made", forgedNew.status === 400 && cardsOf(free.id) === 1);
  const okNew = await free.c.post("/api/cards", { name: "Teal one", strapColor: "#12817a" });
  check("a new card from a free account with a preset is made with that colour", okNew.status === 201 && strapOf(okNew.json.id) === "#12817A");
  const noCol = await free.c.post("/api/cards", { name: "Plain" });
  check("a new card with no colour has none", noCol.status === 201 && strapOf(noCol.json.id) === null);
  const over = await free.c.post("/api/cards", { name: "Fourth", strapColor: null });
  check("a fourth card is still stopped by the card limit (402 plan_limit), not by the colour rule", over.status === 402 && over.json.code === "plan_limit");
  const overCustom = await free.c.post("/api/cards", { name: "Fourth", strapColor: "#123456" });
  check("a fourth card with a custom colour is refused too, and no card is made", [400, 402].includes(overCustom.status) && cardsOf(free.id) === 3);
}

console.log("\n# F55.1 Plus saves any #RRGGBB");
{
  const plus = await person("Plus Pat", { plus: true });
  check("a Plus account's plan says custom colours", (await plus.c.get("/api/me")).json.plan.customStrap === true);
  const r1 = await put(plus, { strapColor: "#1a2b3c" });
  check("Plus saves #1a2b3c (kept in capitals)", r1.status === 200 && strapOf(plus.card) === "#1A2B3C");
  const view = (await plus.c.get("/api/me")).json.cards[0];
  check("it is on /api/me, with white strap text on a dark colour", view.strapColor === "#1A2B3C" && view.strapInk === "#fff");
  await put(plus, { strapColor: "#F5E663" });
  check("a light colour gets black strap text", (await plus.c.get("/api/me")).json.cards[0].strapInk === "#000");
  const pub = await client({ ip: "198.51.100.200" }).get(`/api/c/${plus.card}`);
  check("the public card page data carries the colour and the strap text colour (data only, no code needed on the page)", pub.status === 200 && pub.json.strapColor === "#F5E663" && pub.json.strapInk === "#000");
  const odd = [];
  for (const v of ["#000000", "#FFFFFF", "#7f7f7f", "#00ff00"]) odd.push((await put(plus, { strapColor: v })).status);
  check("black, white, grey and green are all accepted", odd.every((s) => s === 200));
  const tooShort = await put(plus, { strapColor: "#abc" });
  check("Plus still has to send #RRGGBB: #RGB is refused with the format message (the colour panel expands it before sending)", tooShort.status === 400 && /# then six/.test(tooShort.json.error));
  const made = await plus.c.post("/api/cards", { name: "Gold", strapColor: "#c9a227" });
  check("a new Plus card can be made with any colour", made.status === 201 && strapOf(made.json.id) === "#C9A227");
}

console.log("\n# F55.1 A lapsed Plus account keeps what it saved, but cannot choose a new custom colour");
{
  const p = await person("Lapsing Lou", { plus: true });
  await put(p, { strapColor: "#2a6f4e" });
  base.raw.prepare("UPDATE cards SET strap_color = '#2a6f4e' WHERE id = ?").run(p.card); // as an old version saved it, in lower case
  base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1000, p.id);
  const me = (await p.c.get("/api/me")).json;
  check("the lapsed account is on the free plan", me.plan.tier === "free" && me.plan.customStrap === false);
  check("its saved colour is still there and still shown (nothing rewritten)", me.cards[0].strapColor === "#2a6f4e" && strapOf(p.card) === "#2a6f4e");
  const rename = await put(p, { name: "Still mine", strapColor: "#2A6F4E", headline: "Hello" });
  check("saving the card again with the same colour works, and does not rewrite it (even sent in other case)", rename.status === 200 && nameOf(p.card) === "Still mine" && strapOf(p.card) === "#2a6f4e");
  const fresh = await put(p, { name: "Nope", strapColor: "#654321" });
  check("a new colour that is not a preset is refused (400) and nothing is saved", fresh.status === 400 && strapOf(p.card) === "#2a6f4e" && nameOf(p.card) === "Still mine");
  const preset = await put(p, { strapColor: "#55606E" });
  check("a preset is fine", preset.status === 200 && strapOf(p.card) === "#55606E");
  const back = await put(p, { strapColor: "#2A6F4E" });
  check("once moved to a preset, the old custom colour is no longer 'the same' and cannot be chosen again", back.status === 400 && strapOf(p.card) === "#55606E");
  const clear = await put(p, { strapColor: "" });
  check("clearing is fine", clear.status === 200 && strapOf(p.card) === null);
  const mk = await p.c.post("/api/cards", { name: "Lapsed new", strapColor: "#654321" });
  check("a new card with a custom colour from the lapsed account is refused", mk.status === 400);
  base.raw.prepare("UPDATE users SET plan_until = NULL WHERE id = ?").run(p.id);
  check("a Plus plan with no end date (given by hand) can save a colour", (await put(p, { strapColor: "#654321" })).status === 200 && strapOf(p.card) === "#654321");
}

console.log("\n# F55.1 Concurrent and replayed requests cannot get around the rule (D040: the check is in the write)");
{
  const free = await person("Racing Rae");
  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => put(free, { strapColor: "#" + (0x100000 + i * 4097).toString(16).toUpperCase() })));
  check("20 custom-colour saves from a free account at the same moment are all refused and none is saved", many.every((r) => r.status === 400) && strapOf(free.card) === null, many.map((r) => r.status).join());
  const mixed = await Promise.all([...Array.from({ length: 8 }, (_, i) => put(free, { strapColor: "#00000" + i })), put(free, { strapColor: "#12817A" })]);
  check("mixed with a preset in the same instant, only the preset can land", strapOf(free.card) === "#12817A" && mixed.slice(0, 8).every((r) => r.status === 400) && mixed[8].status === 200, mixed.map((r) => r.status).join());
  const freeB = await person("Racing Ray");
  const posts = await Promise.all(Array.from({ length: 10 }, (_, i) => freeB.c.post("/api/cards", { name: "C" + i, strapColor: "#10203" + (i % 10) })));
  check("10 new cards with custom colours at once from a free account: none is made", posts.every((r) => r.status === 400) && cardsOf(freeB.id) === 1, posts.map((r) => r.status).join());

  // The plan runs out between the server's read and its write: the write itself refuses.
  const lap = await person("Lapsing Len", { plus: true });
  let fired = 0;
  const realPrepare = env.DB.prepare;
  env.DB.prepare = function (sql) {
    const s = realPrepare.call(this, sql);
    if (/^UPDATE cards SET/.test(sql)) {
      const run = s.run.bind(s);
      s.run = async () => { if (!fired++) base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1, lap.id); return run(); };
    }
    return s;
  };
  const lapRes = await put(lap, { name: "Too late", strapColor: "#765432" });
  env.DB.prepare = realPrepare;
  check("a Plus plan that runs out after the server read it and before it writes: refused, nothing saved", fired === 1 && lapRes.status === 400 && strapOf(lap.card) === null && nameOf(lap.card) !== "Too late", { fired, st: lapRes.status });
  // The same for a new card.
  const lapN = await person("Lapsing Lin", { plus: true });
  let firedN = 0;
  env.DB.batch = (stmts) => { if (!firedN++) base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1, lapN.id); return base.batch(stmts.map((s) => s.inner || s)); };
  const lapNew = await lapN.c.post("/api/cards", { name: "Late card", strapColor: "#765432" });
  env.DB.batch = (stmts) => base.batch(stmts.map((s) => s.inner || s));
  check("...and for a new card: refused, and no card is made", lapNew.status === 400 && cardsOf(lapN.id) === 1, { st: lapNew.status, n: cardsOf(lapN.id) });
  // A request replayed after the plan has lapsed is held to the rule.
  const rex = await person("Replay Rex", { plus: true });
  const body = { strapColor: "#765432" };
  const first = await put(rex, body);
  base.raw.prepare("UPDATE cards SET strap_color = NULL WHERE id = ?").run(rex.card);
  base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1, rex.id);
  const replay = await put(rex, body);
  check("the same request, replayed after the plan lapsed, is refused", first.status === 200 && replay.status === 400 && strapOf(rex.card) === null);
  // Someone else's card cannot be coloured, with or without Plus.
  const plusX = await person("Plus Xan", { plus: true });
  const other = await person("Other Olu");
  const theft = await plusX.c.put(`/api/cards/${other.card}`, { strapColor: "#765432" });
  check("a Plus account cannot colour someone else's card (404)", theft.status === 404 && strapOf(other.card) === null);
}

console.log("\n# F55.1 Where the colour is drawn, and the page's code");
{
  const cv = read("src/components/CardView.vue"), badge = read("src/components/Badge.vue"), css = read("src/styles/main.css");
  check("the public card page draws the colour from data with CSS custom properties, and imports no colour code", /'--card-strap': view\.strapColor, '--card-strap-ink': view\.strapInk \|\| '#fff'/.test(cv) && !/cardcolour/.test(cv) && !/cardcolour/.test(read("src/views/PublicCard.vue")));
  check("the badge on My card draws it the same way", /'--card-strap': view\.strapColor, '--card-strap-ink': view\.strapInk \|\| '#fff'/.test(badge) && !/cardcolour/.test(badge));
  check("the strap, its words and its event line use the properties, with the theme's colour and white as the fallback", /\.badge-strap \{[^}]*background: var\(--card-strap, var\(--strap\)\)/.test(css) && /\.profile-strap \{[^}]*background: var\(--card-strap, var\(--strap\)\)/.test(css) && /\.profile\.formal \.profile-strap \{ background: var\(--card-strap, var\(--formal-strap\)\)/.test(css) && /\.badge-strap-word \{[^}]*color: var\(--card-strap-ink, #fff\)/.test(css));
  const qr = read("src/lib/qr.js");
  check("the card image export draws the strap and its words in the card's colours", /strapInk\(view\.strapColor\)/.test(qr) && /color: strapText, ls: -0\.15/.test(qr) && /color: strapText, ls: 1\.26/.test(qr));
  const sw = read("src/components/CardSwatches.vue"), form = read("src/components/CardForm.vue"), cards = read("src/views/Cards.vue");
  check("the swatches are a radio group of round buttons 44 px square with a ring on the chosen one and the name as the label", /role="radiogroup"/.test(sw) && /role="radio"/.test(sw) && /width: 44px; height: 44px/.test(sw) && /border-radius: 50%/.test(sw) && /\.swatch\[aria-checked="true"\] \.sw-ring, \.swatch\.on \.sw-ring \{ opacity: 1/.test(sw) && /:aria-label="p\.name" :title="p\.name"/.test(sw));
  check("the swatches move with the arrow keys, Home and End, with one tab stop", /ArrowRight/.test(sw) && /ArrowLeft/.test(sw) && /Home: 0/.test(sw) && /:tabindex="tabbable\(p, i\) \? 0 : -1"/.test(sw));
  check("a free account's Custom swatch is a link to the Plus page that saves nothing", /v-if="!me\.plan\.customStrap" class="swatch swatch-custom" to="\/app\/settings\/plan"/.test(sw) && /Plus<\/span>/.test(sw));
  check("the swatch motion uses the tokens, moves only transform and opacity, and stops under reduced motion", /transition: transform var\(--dur-fast\) var\(--ease-out\)/.test(sw) && /transition: opacity var\(--dur-fast\) var\(--ease-out\), transform var\(--dur-fast\) var\(--ease-out\)/.test(sw) && /prefers-reduced-motion: reduce/.test(sw) && !/\d+ms/.test(sw));
  check("the card form shows the swatches for a new card and an edited one, and My cards sends the colour as it is", /<CardSwatches v-model="f\.strapColor" :theme="f\.theme" \/>/.test(form) && !/show-strap|showStrap/.test(form + cards) && /"POST", \{ \.\.\.rest, tags: tagList\(tagsText\) \}/.test(cards) && !/me\.plan\.customStrap\) body/.test(cards));
}

console.log("\n# F55.2 The colour panel: hex reading, the colour sums and the keyboard model (pure functions)");
{
  const { hexToHsv, hsvToHex, squareKey, hueKey, pointToSv, pointToHue, readHexBox, pushRecent, cleanRecent } = await import("../src/lib/colourpanel.js");
  let bad = 0, n = 0;
  for (let r = 0; r < 256; r += 15) for (let g = 0; g < 256; g += 15) for (let b = 0; b < 256; b += 15) {
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(); n++;
    if (hsvToHex(hexToHsv(hex)) !== hex) bad++;
  }
  check(`hex to hue/saturation/brightness and back gives the same colour for ${n} colours across the cube`, bad === 0, bad);
  const red = hexToHsv("#FF0000"), green = hexToHsv("#00FF00"), blue = hexToHsv("#0000FF"), grey = hexToHsv("#808080", 200);
  check("red, green and blue are hue 0, 120 and 240 at full saturation and brightness", red.h === 0 && green.h === 120 && blue.h === 240 && [red, green, blue].every((c) => c.s === 1 && c.v === 1));
  check("grey has no saturation and keeps the hue it was given (typing 808080 does not throw the slider to red)", grey.s === 0 && grey.h === 200 && Math.abs(grey.v - 128 / 255) < 1e-9);
  check("black and white come out as #000000 and #FFFFFF from any hue", hsvToHex({ h: 123, s: 0, v: 0 }) === "#000000" && hsvToHex({ h: 300, s: 0, v: 1 }) === "#FFFFFF" && hsvToHex({ h: 360, s: 1, v: 1 }) === "#FF0000");

  const at = { h: 100, s: 0.5, v: 0.5 };
  check("in the square, Right and Left change saturation by 1%, Up and Down brightness by 1%, and the hue is never touched", squareKey(at, "ArrowRight").s === 0.51 && squareKey(at, "ArrowLeft").s === 0.49 && squareKey(at, "ArrowUp").v === 0.51 && squareKey(at, "ArrowDown").v === 0.49 && ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].every((k) => squareKey(at, k).h === 100));
  check("with Shift the steps are 10%", squareKey(at, "ArrowRight", true).s === 0.6 && squareKey(at, "ArrowDown", true).v === 0.4);
  check("Home and End are no and full saturation; Page Down and Page Up are the darkest and the brightest", squareKey(at, "Home").s === 0 && squareKey(at, "End").s === 1 && squareKey(at, "PageDown").v === 0 && squareKey(at, "PageUp").v === 1);
  check("the square stops at its edges (never below 0 or above 1)", squareKey({ h: 0, s: 1, v: 1 }, "ArrowRight").s === 1 && squareKey({ h: 0, s: 1, v: 1 }, "ArrowUp").v === 1 && squareKey({ h: 0, s: 0, v: 0 }, "ArrowLeft", true).s === 0 && squareKey({ h: 0, s: 0, v: 0 }, "ArrowDown", true).v === 0);
  check("the square leaves every other key to the page (Tab, Enter, Escape, Space, letters give null)", ["Tab", "Enter", "Escape", " ", "a", "Shift", "Backspace"].every((k) => squareKey(at, k) === null));
  let p = { h: 10, s: 0, v: 0 };
  for (let i = 0; i < 33; i++) p = squareKey(p, "ArrowRight");
  for (let i = 0; i < 100; i++) p = squareKey(p, "ArrowUp");
  check("33 presses of Right give exactly 33% (no drift), and 100 of Up reach the top", p.s === 0.33 && p.v === 1);
  let q = { h: 0, s: 0.5, v: 0.5 };
  const seen = new Set();
  for (let i = 0; i < 100; i++) { q = squareKey(q, "ArrowRight"); seen.add(hsvToHex(q)); }
  check("keys alone can reach any point: from the middle, 50 presses of Right reach full saturation, and every step is a different colour", q.s === 1 && seen.size >= 50);

  const hu = { h: 100, s: 0.4, v: 0.7 };
  check("on the hue slider, Right and Up go on one degree, Left and Down back one, and saturation and brightness are untouched", hueKey(hu, "ArrowRight").h === 101 && hueKey(hu, "ArrowUp").h === 101 && hueKey(hu, "ArrowLeft").h === 99 && hueKey(hu, "ArrowDown").h === 99 && hueKey(hu, "ArrowRight").s === 0.4 && hueKey(hu, "ArrowRight").v === 0.7);
  check("with Shift the hue goes 15 degrees; Page Up and Page Down 30; Home is red (0) and End is 359", hueKey(hu, "ArrowRight", true).h === 115 && hueKey(hu, "ArrowLeft", true).h === 85 && hueKey(hu, "PageUp").h === 130 && hueKey(hu, "PageDown").h === 70 && hueKey(hu, "Home").h === 0 && hueKey(hu, "End").h === 359);
  check("the slider stops at its ends and leaves other keys to the page", hueKey({ ...hu, h: 0 }, "ArrowLeft").h === 0 && hueKey({ ...hu, h: 359 }, "ArrowRight").h === 359 && ["Tab", "Enter", "Escape", "a"].every((k) => hueKey(hu, k) === null));

  check("a press at a point in the square is saturation across and brightness up, and a press outside is held to the edge", JSON.stringify(pointToSv(0, 0, 200, 100)) === '{"s":0,"v":1}' && JSON.stringify(pointToSv(200, 100, 200, 100)) === '{"s":1,"v":0}' && pointToSv(100, 50, 200, 100).s === 0.5 && pointToSv(-30, 500, 200, 100).s === 0 && pointToSv(-30, 500, 200, 100).v === 0 && pointToSv(900, -5, 200, 100).s === 1 && pointToSv(900, -5, 200, 100).v === 1);
  check("a press on the hue slider is the position along it (0 to 359) and never divides by nothing", pointToHue(0, 200) === 0 && pointToHue(100, 200) === 180 && pointToHue(200, 200) === 359 && pointToHue(-4, 200) === 0 && pointToHue(5, 0) === 0 && pointToSv(5, 5, 0, 0).s === 0);

  check("the hex box takes #RRGGBB, RRGGBB, #RGB and RGB, in any case, with spaces around", ["#1A2B3C", "1a2b3c", " #1a2b3c ", "#1a2b3c"].every((t) => readHexBox(t).hex === "#1A2B3C") && readHexBox("#abc").hex === "#AABBCC" && readHexBox("F0a").hex === "#FF00AA");
  const nots = ["", "#", "12", "#12", "12345", "#12345", "1234567", "#12345g", "red", "rgb(0,0,0)", "#12 34 56"].map(readHexBox);
  check("anything else is refused with words for the field (type a colour like 1A2B3C)", nots.every((r) => r.hex === null && /1A2B3C/.test(r.why)));

  const keep = ["#111111", "#222222"];
  const a1 = pushRecent(keep, "#333333");
  check("the recent list puts the newest first and does not change the list it was given", JSON.stringify(a1) === '["#333333","#111111","#222222"]' && keep.length === 2);
  check("a colour used again moves to the front rather than appearing twice, and it is stored in capitals", JSON.stringify(pushRecent(["#111111", "#222222", "#333333"], "#2222222".slice(0, 7))) === '["#222222","#111111","#333333"]' && pushRecent([], "abc")[0] === "#AABBCC");
  let list = [];
  for (let i = 1; i <= 8; i++) list = pushRecent(list, "#00000" + i);
  check("only the last five are kept, newest first", list.length === 5 && list[0] === "#000008" && list[4] === "#000004");
  check("a colour that is not one is not added", JSON.stringify(pushRecent(["#111111"], "nope")) === '["#111111"]');
  check("what is read back from storage keeps only real colours, no repeats, five at most", JSON.stringify(cleanRecent(["#111111", "#111111", "red", 5, null, "#abcdef", "#222222", "#333333", "#444444", "#555555", "#666666"])) === '["#111111","#222222","#333333","#444444","#555555"]' && cleanRecent("nope").length === 0 && cleanRecent(null).length === 0 && cleanRecent({}).length === 0);
}

console.log("\n# F55.2 The colour panel: what the page does (source)");
{
  const panel = read("src/components/CardColourPanel.vue"), sw = read("src/components/CardSwatches.vue"), form = read("src/components/CardForm.vue");
  check("the panel is a lazy chunk, fetched when Custom is first pressed (a hand-made dynamic import, drawn only once loaded; defineAsyncComponent would add 0.8 KB to the Vue code every public page loads)", /Panel\.value = \(await import\("\.\/CardColourPanel\.vue"\)\)\.default/.test(sw) && /v-if="Panel && me\.plan\.customStrap"/.test(sw) && !/defineAsyncComponent/.test(sw) && !/^import .*CardColourPanel/m.test(sw) && !/^import .*colourpanel/m.test(sw));
  const pub = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin"].map((p) => read(`src/views/${p}.vue`)).join("\n") + read("src/components/CardView.vue") + read("src/components/Badge.vue") + read("src/main.js");
  check("no public page, CardView, Badge or the entry imports the swatches, the panel or the colour sums", !/CardSwatches|CardColourPanel|colourpanel|cardcolour/.test(pub));
  check("only CardForm imports the swatches, and only the swatches load the panel", /import CardSwatches from/.test(form) && !/CardColourPanel/.test(form + read("src/views/Cards.vue")));
  check("the panel is the shared sheet: a popover from 600 px and a bottom sheet on a phone, with Escape, a press outside and Close all cancelling", /<UiSheet :open="open" :anchor="anchor" :label="label" focus="\.colp-square" @close="cancel">/.test(panel) && /function cancel\(\) \{\s*emit\("update:modelValue", before\);\s*emit\("close"\);/.test(panel));
  check("it remembers what the colour was when it opened, and cancel puts that back (the card preview follows live)", /before = props\.modelValue;/.test(panel) && /emit\("update:modelValue", hsvToHex\(next\)\);/.test(panel));
  check("Done keeps and remembers a custom colour (never a preset), and Enter anywhere but on a button is Done", /function done\(\) \{[\s\S]*?if \(!isPreset\(r\.hex\)\) \{ recent\.value = pushRecent\(readRecent\(\), r\.hex\); writeRecent\(recent\.value\); \}\s*emit\("done", r\.hex\);/.test(panel) && /e\.key === "Enter" && !\(e\.target instanceof HTMLButtonElement\)/.test(panel) && /<button type="button" class="btn btn-primary" @click="done">Done<\/button>/.test(panel));
  check("a bad hex box answers in words and does not close", /if \(!r\.hex\) \{ hexError\.value = r\.why; return; \}/.test(panel) && /role="alert"/.test(panel));
  check("the square and the hue slider are sliders with names, values in words, one tab stop each, and the keys come from the tested functions", /class="colp-square" role="slider" tabindex="0" aria-label="Saturation and brightness"/.test(panel) && /aria-valuetext="sText"|:aria-valuetext="sText"/.test(panel) && /class="colp-hue" role="slider" tabindex="0" aria-label="Hue"/.test(panel) && /squareKey\(hsv\.value, e\.key, e\.shiftKey\)/.test(panel) && /hueKey\(hsv\.value, e\.key, e\.shiftKey\)/.test(panel));
  check("the keys the square does not use are not swallowed (preventDefault only when a move was made)", /if \(n\) \{ e\.preventDefault\(\); set\(n\); \}/.test(panel) && (panel.match(/if \(n\) \{ e\.preventDefault\(\); set\(n\); \}/g) || []).length === 2);
  check("a press or drag on the square and slider works with a mouse, a finger and a pen (pointer events, captured, no scrolling while dragging)", /@pointerdown="onSquare"/.test(panel) && /setPointerCapture/.test(panel) && /touch-action: none/.test(panel));
  check("the hex box has a name, takes three or six digits, and applies at once on six", /aria-label="Hex colour, three or six letters or numbers"/.test(panel) && /\[0-9a-fA-F\]\{6\}/.test(panel) && /@blur="leaveHex"/.test(panel));
  check("the last five custom colours are kept in this browser only, safely (try and catch), as 44 px buttons with the colour as their name", /const RECENT_KEY = "lanyard-recent-colours"/.test(panel) && /try \{ localStorage\.setItem/.test(panel) && /\.colp-r \{ width: 44px; height: 44px;/.test(panel) && /:aria-label="`Recent colour \$\{c\}`"/.test(panel));
  check("the panel's motion uses tokens only and stops under reduced motion; no colour library and no native colour input in the card form", /transition: transform var\(--dur-fast\) var\(--ease-out\)/.test(panel) && /prefers-reduced-motion: reduce/.test(panel) && !/\d+ms/.test(panel) && !/type="color"/.test(form + sw + panel) && !/^import .* from "(?!vue"|\.)/m.test(panel));
  check("for Plus the Custom swatch opens the panel (a button that says it opens a dialog) and shows its own colour with the ring when the card has one that is not a preset", /aria-haspopup="dialog" :aria-expanded="panelOpen"/.test(sw) && /const isCustom = computed\(\(\) => !!strictHex\(model\.value\) && !presetOf\(model\.value\)\)/.test(sw) && /:class="\{ 'sw-wheel': !isCustom \}"/.test(sw));
}

summary();
