// F56: premium strap materials for Plus cards (gold, silver, rose gold, copper, pearl, carbon).
//   the six ids and the CSS that draws them (the strap text is worked out against every tone, with the moving highlight added),
//   the Worker rule (Plus only, six exact ids, the check inside the write, D040/D052), the migration, the sheen's motion rules
//   (D045), the public page's code, and the editor row.
// The Worker is the real one on in-memory SQLite (test/harness.mjs); each query gets a turn of the event loop (withLatency),
// so requests sent together interleave as they do on D1.
// Run: node test/materials.mjs
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, withLatency, check, summary } from "./harness.mjs";
import { MATERIALS, MATERIAL_IDS, MATERIAL_AT, isMaterial, materialOf, gradientOf } from "../src/lib/cardmaterial.js";
import { contrast } from "../src/lib/cardcolour.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const css = read("src/styles/main.css");

console.log("\n# F56 The six materials");
{
  check("there are six, with these names, in this order", JSON.stringify(MATERIALS.map((m) => m.name)) === '["Gold","Silver","Rose gold","Copper","Pearl","Carbon"]');
  check("the ids are lower case words (gold, silver, rose-gold, copper, pearl, carbon), all different", JSON.stringify(MATERIAL_IDS) === '["gold","silver","rose-gold","copper","pearl","carbon"]' && new Set(MATERIAL_IDS).size === 6);
  check("isMaterial takes only the six exact ids", MATERIAL_IDS.every(isMaterial) && !["Gold", "GOLD", "gold ", " gold", "rose gold", "Rose-Gold", "rose_gold", "platinum", "", "none", "constructor", "__proto__", "gold,silver", "gold\n"].some(isMaterial));
  check("isMaterial refuses other types", ![null, undefined, 0, 1, true, false, ["gold"], { id: "gold" }, () => "gold", Symbol.iterator].some(isMaterial));
  check("materialOf gives the entry or null", materialOf("gold").name === "Gold" && materialOf("Gold") === null && materialOf(null) === null);
  check("each has five tones, a mid tone, an ink, a highlight strength", MATERIALS.every((m) => m.stops.length === 5 && MATERIAL_AT.length === 5 && /^#[0-9A-F]{6}$/.test(m.mid) && /^#[0-9A-F]{6}$/.test(m.ink) && m.stops.every((s) => /^#[0-9A-F]{6}$/.test(s)) && m.glint > 0 && m.glint < 0.4));
  check("the gradient is the plan's: 115 degrees, the highlight band in the middle at 50%", gradientOf(materialOf("gold")) === "linear-gradient(115deg, #B38A2A 0%, #E3C25E 38%, #F7E6A6 50%, #D8B04A 62%, #AE8426 100%)");
  check("the lib has no imports (the Worker, the app and the card image all read it)", !/^import /m.test(read("src/lib/cardmaterial.js")));
}

console.log("\n# F56 The CSS draws each material, and the strap text reads on every tone (4.5:1)");
{
  const hexes = (t) => [...t.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase());
  const lerp = (a, b, k) => { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
  const over = (base, glint) => lerp(base, "#FFFFFF", glint); // white at `glint` strength over a tone
  let worstAll = 99;
  for (const m of MATERIALS) {
    const rule = new RegExp(`\\n\\.mat-${m.id} \\{([^}]*)\\}`).exec(css)?.[1] || "";
    const strap = /--card-strap:\s*([^;]*);/.exec(rule)?.[1] || "";
    const ink = /--card-strap-ink:\s*(#[0-9A-Fa-f]{6});/.exec(rule)?.[1]?.toUpperCase();
    const glint = Number(/--mat-glint:\s*rgba\(255, 255, 255, ([\d.]+)\)/.exec(rule)?.[1]);
    check(`${m.name}: the CSS rule exists and sets the strap, its ink and its highlight`, !!rule && !!strap && !!ink && glint > 0, rule.slice(0, 80));
    check(`${m.name}: the CSS gradient has the lib's five tones in order, at 115 degrees, with the lib's ink and highlight`, JSON.stringify(hexes(strap)) === JSON.stringify(m.stops) && /linear-gradient\(115deg,/.test(strap) && ink === m.ink && glint === m.glint, { css: hexes(strap), ink, glint });
    const cMid = contrast(m.ink, m.mid);
    check(`${m.name}: strap text ${m.ink} on the mid tone ${m.mid} is ${cMid.toFixed(2)}:1 (at least 4.5:1)`, cMid >= 4.5);
    // Every point along the gradient, counting the moving highlight at its brightest on top.
    let worst = 99, worstGlint = 99;
    const at = MATERIAL_AT;
    for (let t = 0; t <= 100; t++) {
      let i = 0; while (i < 3 && t > at[i + 1]) i++;
      const base = lerp(m.stops[i], m.stops[i + 1], (t - at[i]) / (at[i + 1] - at[i]));
      worst = Math.min(worst, contrast(m.ink, base));
      worstGlint = Math.min(worstGlint, contrast(m.ink, over(base, m.glint)));
    }
    worstAll = Math.min(worstAll, worst, worstGlint);
    check(`${m.name}: the strap text is at least 4.5:1 on all 101 points along the strap (worst ${worst.toFixed(2)}:1) and with the highlight on top (worst ${worstGlint.toFixed(2)}:1)`, worst >= 4.5 && worstGlint >= 4.5);
    check(`${m.name}: the ink is white or near-black, dark on a light metal and white only on the dark one`, m.ink === (m.id === "carbon" ? "#FFFFFF" : "#1B1A17"));
  }
  check(`the lowest ratio anywhere is ${worstAll.toFixed(2)}:1`, worstAll >= 4.5);
  // The words sit on the strap in every app theme (Light, Dark, Midnight): the strap does not change with the app theme.
  check("the strap's materials do not depend on the app theme (no :root[data-theme] rule sets a material)", !/data-theme[^{]*\.mat/.test(css) && !/\.mat[^{]*data-theme/.test(css));
  // The strap, its word and its event line use the material through the same custom properties as a preset colour.
  check("a material is drawn through --card-strap and --card-strap-ink, so the strap, its word and the event line follow it in the badge and the card page", /\.badge-strap \{[^}]*background: var\(--card-strap, var\(--strap\)\)/.test(css) && /\.profile-strap \{[^}]*background: var\(--card-strap, var\(--strap\)\)/.test(css) && /\.badge-strap-word \{[^}]*color: var\(--card-strap-ink, #fff\)/.test(css) && /\.badge-strap-event \{[^}]*color: var\(--card-strap-ink, #fff\)/.test(css) && /\.profile-strap-card \{[^}]*color: var\(--card-strap-ink, #fff\)/.test(css));
  check("the finish has an edge (a light line on top, a darker one below), set on the strap only", /\n\.mat \{[^}]*box-shadow: inset 0 1px 0 rgba\(255, 255, 255, [\d.]+\), inset 0 -2px 0 rgba\(0, 0, 0, [\d.]+\)/.test(css));
  check("every class the material CSS adds is .mat or .mat-<id> for one of the six (no stray name that could clash)", [...css.matchAll(/\.mat(?![\w-]*[\w-]*\bpass)([\w-]*)/g)].every((m) => m[1] === "" || MATERIAL_IDS.includes(m[1].slice(1))), [...new Set([...css.matchAll(/\.mat([\w-]*)/g)].map((m) => m[1]))]);
}

console.log("\n# F56 The sheen: transform only, one pass, never a loop, off under reduced motion (D045)");
{
  const start = css.indexOf(".mat::before {");
  const block = css.slice(start, css.indexOf(".profile-body { color:", start));
  check("the highlight is its own layer (.mat::before) moved with transform: translateX of --sheen, not a background-position", /\.mat::before \{[^}]*transform: translateX\(calc\(var\(--sheen, 0\) \* 100%\)\)/.test(block) && !/background-position/.test(block));
  check("the layer sits under the words (z-index -1 in an isolated strap) and takes no clicks", /z-index: -1; pointer-events: none/.test(block) && /\n\.mat \{[^}]*isolation: isolate/.test(css));
  const motion = /@media \(prefers-reduced-motion: no-preference\) \{\s*\.mat::before \{([^}]*)\}\s*\}/.exec(block)?.[1] || "";
  check("the pass and the follow only exist when the person has not asked for reduced motion", !!motion && /animation: mat-pass/.test(motion) && /transition: transform/.test(motion));
  check("the follow is a transition of transform alone, at the 200 ms token", /transition: transform var\(--dur\) var\(--ease-out\)/.test(motion) && !/transition:[^;]*(background|left|margin|width)/.test(motion) && /--dur:\s*200ms/.test(css));
  check("the one pass is 300 ms (not over), plays once (no infinite, no iteration count above one), then the layer stays where --sheen puts it", /animation: mat-pass 300ms var\(--ease-out\) 160ms backwards;/.test(motion) && !/infinite/.test(block) && !/animation-iteration-count/.test(block));
  const frames = /@keyframes mat-pass \{([^}]*\})\s*\}/.exec(block)?.[1] || "";
  check("its keyframes move transform only", /from \{ transform: translateX\(-100%\); \}/.test(frames) && !/background|left|top|width|height|margin/.test(frames));
  check("with reduced motion the layer does not move at all (transform none, no animation, no transition)", /@media \(prefers-reduced-motion: reduce\) \{ \.mat::before \{ transform: none; \} \}/.test(block) && !/reduce\) \{[^}]*animation/.test(block));
  const times = [...block.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)].map((m) => (m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1])));
  check("no time written in the material CSS is over 300 ms", times.length > 0 && times.every((t) => t <= 300), times);
  // The few lines of script (lib/sheen.js): sets --sheen from the pointer only, with a mouse, only where hover exists and motion is allowed.
  const listeners = {}; let hover = true;
  globalThis.matchMedia = () => ({ matches: hover });
  const style = {}; const strap = { style: { setProperty: (k, v) => { style[k] = v; }, removeProperty: (k) => { delete style[k]; } } };
  const card = { addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, getBoundingClientRect: () => ({ left: 100, width: 200 }), querySelector: (s) => (s === ".mat" ? strap : null) };
  const { sheen } = await import("../src/lib/sheen.js");
  sheen(card); sheen(card);
  check("it adds its two listeners once, even if it is started twice", listeners.pointermove?.length === 1 && listeners.pointerleave?.length === 1);
  listeners.pointermove[0]({ pointerType: "mouse", clientX: 200 });
  check("the pointer in the middle of the card is 0, at the left edge -0.5, at the right edge 0.5", style["--sheen"] === "0.00");
  listeners.pointermove[0]({ pointerType: "mouse", clientX: 100 }); const l = style["--sheen"];
  listeners.pointermove[0]({ pointerType: "mouse", clientX: 300 }); const r = style["--sheen"];
  check("...(left)", l === "-0.50"); check("...(right)", r === "0.50");
  listeners.pointermove[0]({ pointerType: "mouse", clientX: 9000 });
  check("far outside the card it is held to 0.5", style["--sheen"] === "0.50");
  delete style["--sheen"]; listeners.pointermove[0]({ pointerType: "touch", clientX: 150 }); listeners.pointermove[0]({ pointerType: "pen", clientX: 150 });
  check("a finger or a pen sets nothing (phones get the one pass only)", style["--sheen"] === undefined);
  listeners.pointermove[0]({ pointerType: "mouse", clientX: 150 }); listeners.pointerleave[0]();
  check("when the pointer leaves, the value is removed and the highlight eases back", style["--sheen"] === undefined);
  const card2 = { ...card, addEventListener: () => { throw new Error("should not listen"); } }; hover = false;
  let ok2 = true; try { sheen(card2); } catch { ok2 = false; }
  check("on a device without hover, or with reduced motion, it listens to nothing", ok2);
  hover = true; check("it is a no-op for no element", (() => { try { sheen(null); return true; } catch { return false; } })());
  delete globalThis.matchMedia;
  const sheenSrc = read("src/lib/sheen.js").replace(/^\s*\/\/.*$/gm, "");
  check("it never asks for device orientation or motion, and nothing in src does", !/DeviceOrientation|DeviceMotion|requestPermission|ondeviceorientation|deviceorientation|devicemotion/i.test(sheenSrc) && !readdirSync(new URL("../src", import.meta.url), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).some((f) => /requestPermission|DeviceOrientationEvent|DeviceMotionEvent/.test(read("src/" + f))));
  check("it moves no style but --sheen, and uses no timer, no frame loop and no library", /setProperty\("--sheen"/.test(sheenSrc) && !/setInterval|setTimeout|requestAnimationFrame|\.animate\(|\.style\.(transform|left|top|background)/.test(sheenSrc) && !/^import /m.test(sheenSrc));
}

console.log("\n# F56 The public card page gets no new code for it");
{
  const cv = read("src/components/CardView.vue"), badge = read("src/components/Badge.vue"), pub = read("src/views/PublicCard.vue");
  check("the card page and the badge draw a material as one class on the strap from data, and a material replaces the strap colour", /:class="view\.material \? 'mat mat-' \+ view\.material : null"/.test(cv) && /:class="view\.material \? 'mat mat-' \+ view\.material : null"/.test(badge) && /view\.strapColor && !view\.material/.test(cv) && /view\.strapColor && !view\.material/.test(badge));
  check("neither imports the materials list, the editor row or the CSS in script: the sheen script is a plain import() beside the card, never a static import and never defineAsyncComponent", !/^import .*(cardmaterial|sheen|CardMaterials)/m.test(cv + badge + pub) && /import\("\.\.\/lib\/sheen"\)/.test(cv) && /import\("\.\.\/lib\/sheen"\)/.test(badge) && !/defineAsyncComponent/.test(cv + badge));
  check("it is fetched only for a card that has a material", /if \(props\.view\.material\) import\("\.\.\/lib\/sheen"\)/.test(cv) && /if \(props\.view\.material\) import\("\.\.\/lib\/sheen"\)/.test(badge));
  const entry = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin"].map((p) => { try { return read(`src/views/${p}.vue`); } catch { return ""; } }).join("\n") + read("src/main.js");
  check("no public page and no entry imports the materials list, the editor row or the sheen", !/cardmaterial|CardMaterials|lib\/sheen/.test(entry));
  const prev = read("src/lib/cardpreview.js");
  check("the live preview carries the material, so the editor shows it before saving", /material: form\.material \|\| null/.test(prev) && /textColor: card\.textColor, material: card\.material/.test(prev) && /material: card\.material \|\| ""/.test(read("src/views/Cards.vue")) && /material: c\.material/.test(read("src/views/EditProfile.vue")));
  const qr = read("src/lib/qr.js");
  check("the card image draws the material's gradient and its ink", /materialOf\(view\?\.material\)/.test(qr) && /createLinearGradient/.test(qr) && /mat \? mat\.ink/.test(qr));
}

console.log("\n# F56 The editor row");
{
  const row = read("src/components/CardMaterials.vue"), form = read("src/components/CardForm.vue");
  check("the row sits below the colours in the card form, for a new card and an edited one", form.indexOf("<CardMaterials") > form.indexOf("<CardTextColour") && form.indexOf("<CardMaterials") > form.indexOf("<CardSwatches") && /<CardMaterials v-model="f\.material" \/>/.test(form));
  check("it is a radio group of round swatches 44 px to press: None, then the six, each drawn with the same CSS as the strap", /role="radiogroup" aria-label="Strap material"/.test(row) && /role="radio"/.test(row) && /width: 44px; height: 44px/.test(row) && /OPTIONS = \[\{ id: "", name: "None" \}, \.\.\.MATERIALS\]/.test(row) && /background: var\(--card-strap\)/.test(row) && /'mat-' \+ o\.id/.test(row));
  check("each swatch's name is its label and tooltip, the chosen one has a ring, and the arrows, Home and End move and choose with one tab stop", /:aria-label="o\.name" :title="o\.name"/.test(row) && /\.mat-opt\[aria-checked="true"\] \.mat-ring \{ opacity: 1/.test(row) && /ArrowRight/.test(row) && /Home: 0/.test(row) && /:tabindex="tabbable\(o, i\) \? 0 : -1"/.test(row));
  check("a free account sees the row with a small \"Plus\" mark, and each material it does not have is a link to the Plus page that saves nothing", /<span v-if="!plus" class="mat-plus">Plus<\/span>/.test(row) && /<router-link v-if="locked\(o\)" class="mat-opt" to="\/app\/settings\/plan"/.test(row) && /const locked = \(o\) => !plus\.value && o\.id !== "" && o\.id !== model\.value;/.test(row) && /part of Lanyard Plus/.test(row));
  check("a lapsed account keeps the material it saved as a choice it can switch off (None)", /o\.id !== model\.value/.test(row));
  check("the swatch motion uses the tokens, moves only transform and opacity, has no time of its own, and stops under reduced motion", /transition: transform var\(--dur-fast\) var\(--ease-out\)/.test(row) && /transition: opacity var\(--dur-fast\) var\(--ease-out\), transform var\(--dur-fast\) var\(--ease-out\)/.test(row) && /prefers-reduced-motion: reduce/.test(row) && !/\d+ms/.test(row));
  const classes = [...row.slice(row.indexOf("<style")).matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]);
  check("the row's own class names (mat-row, mat-opt, mat-dot, mat-ring, mat-plus, mat-name, mat-none) never clash with a material's class", classes.filter((c) => c.startsWith("mat-")).every((c) => !MATERIAL_IDS.includes(c.slice(4))), classes);
  check("Plus's own lists say it: the Plan page's list, the redeem page", /Strap materials/.test(read("worker/plans.js")) && /strap materials/.test(read("src/views/Redeem.vue")));
}

console.log("\n# F56 The migration");
{
  const { makeDb, migrationFiles, readMigration } = await import("./harness.mjs");
  const files = migrationFiles();
  check("0042 is the newest migration, after 0041, named for the material", files.at(-1) === "0042_card_material.sql" && files.at(-2) === "0041_user_stages.sql");
  const sql = readMigration("0042_card_material.sql").replace(/--.*$/gm, "").trim();
  check("it only adds one nullable column to cards (additive, safe to apply before the new code is deployed)", sql === "ALTER TABLE cards ADD COLUMN material TEXT;" && !/NOT NULL|DEFAULT|DROP|UPDATE|DELETE/i.test(sql));
  const old = makeDb({ before: "0042" });
  old.raw.prepare("INSERT INTO users (id, created_at, is_guest) VALUES ('u1', 1, 1)").run();
  old.raw.prepare("INSERT INTO cards (id, user_id, code, name, theme, strap_color, text_color, created_at) VALUES ('c1', 'u1', 'AB23', 'Old', 'night', '#2A6F4E', '#EEEEEE', 1)").run();
  old.raw.exec(readMigration("0042_card_material.sql"));
  const row = old.raw.prepare("SELECT * FROM cards WHERE id = 'c1'").get();
  check("an existing card keeps every value and gets no material", row.material === null && row.strap_color === "#2A6F4E" && row.text_color === "#EEEEEE" && row.name === "Old" && row.theme === "night");
  check("the older code's statements (without the column) still work on the new table", (() => { try { old.raw.prepare("INSERT INTO cards (id, user_id, code, name, theme, created_at) VALUES ('c2', 'u1', 'AB24', 'Older', 'default', 1)").run(); return true; } catch { return false; } })());
  const reset = read("scripts/reset-hosts.mjs");
  check("the host reset names no material (it keeps attendee cards)", !/material/.test(reset.replace(/^\s*\/\/.*$/gm, "")));
}

console.log("\n# F56 The server rule: only Plus saves a material, only the six names");
const T = await makeEnv();
const { client, q1, env } = T;
const base = env.DB;
env.DB = withLatency(base);
let ip = 10;
async function person(name, { plus = false, lapsed = false } = {}) {
  const c = client({ ip: "198.51.101." + ip++ });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "CS" });
  if (r.status !== 201) throw new Error(r.text);
  const me = (await c.get("/api/me")).json;
  const id = me.user.id;
  if (plus) base.raw.prepare("UPDATE users SET plan = 'plus', plan_until = ? WHERE id = ?").run(lapsed ? Date.now() - 86400e3 : Date.now() + 30 * 86400e3, id);
  return { c, id, card: me.cards[0].cardId };
}
const matOf = (id) => q1("SELECT material FROM cards WHERE id = ?", id)?.material ?? null;
const nameOf = (id) => q1("SELECT name FROM cards WHERE id = ?", id)?.name;
const strapOf = (id) => q1("SELECT strap_color FROM cards WHERE id = ?", id)?.strap_color ?? null;
const cardsOf = (uid) => q1("SELECT COUNT(*) n FROM cards WHERE user_id = ?", uid).n;
const put = (p, body, h) => p.c.put(`/api/cards/${p.card}`, body, h);
{
  const free = await person("Free Fran");
  check("a free account starts with no material, and the card views carry null", matOf(free.card) === null && (await free.c.get("/api/me")).json.cards[0].material === null);
  // Any material value from a free account: 400, and nothing in the request is saved (not the name, not the strap, not the text).
  const names = [...MATERIAL_IDS, "Gold", "GOLD", "rose gold", "platinum", "gold ", "<script>", "javascript:alert(1)", 1, true, ["gold"], { id: "gold" }];
  const out = [];
  for (const v of names) {
    const r = await put(free, { name: "Changed", strapColor: "#12817A", material: v });
    out.push([JSON.stringify(v), r.status, nameOf(free.card), matOf(free.card), strapOf(free.card)]);
  }
  check(`a free account's PUT with any material value (the six names, and ${names.length - 6} others) gets 400`, out.every(([, st]) => st === 400), out.filter(([, st]) => st !== 400));
  check("...and nothing is saved: no material, and the name and the preset strap sent in the same request are not saved either", out.every(([, , nm, m, s]) => nm !== "Changed" && m === null && s === null));
  const msg = (await put(free, { material: "gold" })).json;
  check("a free account's refusal is plain, names Plus, and has a code the page can read", msg.code === "plus_material" && /Plus/.test(msg.error) && /material/.test(msg.error) && !/undefined|\[object/.test(msg.error), msg);
  const junk = (await put(free, { material: "platinum" })).json;
  check("a wrong name is told what the names are", junk.code === "bad_material" && /gold/.test(junk.error) && /carbon/.test(junk.error), junk);
  check("a free account sending empty or null is fine (it has none to clear): saved with the rest of the request", (await put(free, { name: "Kept", material: "" })).status === 200 && nameOf(free.card) === "Kept" && (await put(free, { material: null })).status === 200 && matOf(free.card) === null);
  check("an edit that does not mention the material leaves things alone", (await put(free, { name: "Again" })).status === 200 && nameOf(free.card) === "Again");
  // The plan is read from the server, never from the request.
  const forged = [{ plan: "plus" }, { tier: "plus" }, { customStrap: true }, { plan: { tier: "plus", customStrap: true } }, { user: { plan: "plus" } }, { isPlus: true }];
  const f = [];
  for (const extra of forged) f.push((await put(free, { material: "gold", ...extra })).status);
  check("a free account claiming to be Plus in the body (plan, tier, customStrap...) is still refused", f.every((s) => s === 400) && matOf(free.card) === null, f);
  const viaHeader = await free.c.put(`/api/cards/${free.card}?plan=plus`, { material: "gold" }, { "x-plan": "plus", "x-forwarded-plan": "plus" });
  check("...and so is a query string or a header that says it", viaHeader.status === 400 && matOf(free.card) === null);
  const forgedNew = await free.c.post("/api/cards", { name: "Sneaky", material: "gold", plan: "plus" });
  check("a new card from a free account with a material is refused and no card is made", forgedNew.status === 400 && forgedNew.json.code === "plus_material" && cardsOf(free.id) === 1);
  const noMat = await free.c.post("/api/cards", { name: "Plain", material: "" });
  check("a new card with an empty material is made without one", noMat.status === 201 && matOf(noMat.json.id) === null);
  const snake = await put(free, { Material: "gold" });
  check("another spelling of the field is not read (and saves nothing)", snake.status === 200 && matOf(free.card) === null);
}

console.log("\n# F56 Plus saves one of the six");
{
  const plus = await person("Plus Pat", { plus: true });
  const saved = [];
  for (const m of MATERIALS) { const r = await put(plus, { material: m.id }); saved.push([m.id, r.status, matOf(plus.card)]); }
  check("each of the six is saved by a Plus account", saved.every(([id, st, got]) => st === 200 && got === id), saved);
  const view = (await plus.c.get("/api/me")).json.cards[0];
  check("it comes back on /api/me", view.material === "carbon");
  const pub = await client({ ip: "198.51.101.250" }).get(`/api/c/${plus.card}`);
  check("the public card page's data carries it (data only: the page needs no code to draw it)", pub.status === 200 && pub.json.material === "carbon");
  await put(plus, { material: "gold", strapColor: "#12817A", textColor: "#1B1A17" });
  const both = (await plus.c.get("/api/me")).json.cards[0];
  check("a material sits beside a strap colour and a text colour: all three are kept", both.material === "gold" && both.strapColor === "#12817A" && both.textColor === "#1B1A17");
  const bad = [];
  for (const v of ["Gold", "GOLD", "gOLD", " gold", "gold ", "rose gold", "Rose gold", "rose-Gold", "rose_gold", "platinum", "bronze", "#B38A2A", "none", "null", "undefined", "<b>", "gold;drop table cards", 0, 1, true, false, [], ["gold"], {}, { id: "gold" }]) {
    const r = await put(plus, { name: "Changed", material: v });
    bad.push([JSON.stringify(v), r.status, nameOf(plus.card), matOf(plus.card)]);
  }
  check(`wrong case, spaces, junk and other types (${bad.length} shapes) are 400 from a Plus account too`, bad.every(([, st]) => st === 400), bad.filter(([, st]) => st !== 400));
  check("...and nothing is saved (the material stays gold, the name is not changed)", bad.every(([, , nm, m]) => nm !== "Changed" && m === "gold"));
  check("an empty string clears it", (await put(plus, { material: "" })).status === 200 && matOf(plus.card) === null);
  await put(plus, { material: "pearl" });
  check("null clears it", (await put(plus, { material: null })).status === 200 && matOf(plus.card) === null);
  await put(plus, { material: "copper" });
  check("an edit that does not mention it leaves it alone", (await put(plus, { name: "Renamed" })).status === 200 && matOf(plus.card) === "copper" && nameOf(plus.card) === "Renamed");
  const made = await plus.c.post("/api/cards", { name: "Gilded", material: "rose-gold" });
  check("a new Plus card can be made with a material", made.status === 201 && matOf(made.json.id) === "rose-gold");
  const madeBad = await plus.c.post("/api/cards", { name: "Wrong", material: "Rose gold" });
  check("a new card with a wrong name is 400 and no card is made", madeBad.status === 400 && madeBad.json.code === "bad_material" && cardsOf(plus.id) === 2);
  const lim = await plus.c.post("/api/cards", { name: "Gold two", material: "gold" });
  check("a Plus plan with no end date (given by hand) can save one too", (base.raw.prepare("UPDATE users SET plan_until = NULL WHERE id = ?").run(plus.id), (await put(plus, { material: "silver" })).status === 200 && matOf(plus.card) === "silver") && lim.status === 201);
  const plusX = await person("Plus Xan", { plus: true });
  const other = await person("Other Olu");
  const theft = await plusX.c.put(`/api/cards/${other.card}`, { material: "gold" });
  check("a Plus account cannot give someone else's card a material (404)", theft.status === 404 && matOf(other.card) === null);
}

console.log("\n# F56 A lapsed Plus account keeps what it saved, may clear it, cannot set a new one");
{
  const p = await person("Lapsing Lou", { plus: true });
  await put(p, { material: "gold" });
  base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1000, p.id);
  const me = (await p.c.get("/api/me")).json;
  check("the lapsed account is on the free plan and the card still shows its material (nothing rewritten)", me.plan.tier === "free" && me.cards[0].material === "gold" && matOf(p.card) === "gold");
  const pub = await client({ ip: "198.51.101.251" }).get(`/api/c/${p.card}`);
  check("the public card page still carries it", pub.json.material === "gold");
  const same = await put(p, { name: "Still mine", material: "gold", headline: "Hello" });
  check("saving the card again with the same material works and keeps it", same.status === 200 && nameOf(p.card) === "Still mine" && matOf(p.card) === "gold");
  const other = await put(p, { name: "Nope", material: "silver" });
  check("a different material is refused (400) and nothing is saved", other.status === 400 && other.json.code === "plus_material" && matOf(p.card) === "gold" && nameOf(p.card) === "Still mine");
  const clear = await put(p, { material: "" });
  check("clearing it is fine", clear.status === 200 && matOf(p.card) === null);
  const back = await put(p, { material: "gold" });
  check("once cleared, the old material cannot be chosen again", back.status === 400 && matOf(p.card) === null);
  const mk = await p.c.post("/api/cards", { name: "Lapsed new", material: "gold" });
  check("a new card with a material from the lapsed account is refused and no card is made", mk.status === 400 && cardsOf(p.id) === 1);
  const clearNull = (base.raw.prepare("UPDATE cards SET material = 'carbon' WHERE id = ?").run(p.card), await put(p, { material: null }));
  check("null clears it too", clearNull.status === 200 && matOf(p.card) === null);
  // A lapsed account with a saved text colour or strap colour does not get a material through them either.
  check("renewing Plus makes it available again", (base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() + 1e9, p.id), (await put(p, { material: "silver" })).status === 200) && matOf(p.card) === "silver");
}

console.log("\n# F56 Concurrent and replayed requests cannot get around the rule (D040: the check is in the write)");
{
  const free = await person("Racing Rae");
  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => put(free, { material: MATERIAL_IDS[i % 6] })));
  check("20 material saves from a free account at the same moment are all refused and none is saved", many.every((r) => r.status === 400) && matOf(free.card) === null, many.map((r) => r.status).join());
  const freeB = await person("Racing Ray");
  const posts = await Promise.all(Array.from({ length: 10 }, (_, i) => freeB.c.post("/api/cards", { name: "C" + i, material: MATERIAL_IDS[i % 6] })));
  check("10 new cards with a material at once from a free account: none is made", posts.every((r) => r.status === 400) && cardsOf(freeB.id) === 1, posts.map((r) => r.status).join());

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
  const lapRes = await put(lap, { name: "Too late", material: "gold" });
  env.DB.prepare = realPrepare;
  check("a Plus plan that runs out after the server read it and before it writes: refused, nothing saved", fired === 1 && lapRes.status === 400 && lapRes.json.code === "plus_material" && matOf(lap.card) === null && nameOf(lap.card) !== "Too late", { fired, st: lapRes.status, body: lapRes.json });
  // The same for a new card.
  const lapN = await person("Lapsing Lin", { plus: true });
  let firedN = 0;
  env.DB.batch = (stmts) => { if (!firedN++) base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1, lapN.id); return base.batch(stmts.map((s) => s.inner || s)); };
  const lapNew = await lapN.c.post("/api/cards", { name: "Late card", material: "gold" });
  env.DB.batch = (stmts) => base.batch(stmts.map((s) => s.inner || s));
  check("...and for a new card: refused, and no card is made", lapNew.status === 400 && cardsOf(lapN.id) === 1, { st: lapNew.status, n: cardsOf(lapN.id) });
  // A request replayed after the plan has lapsed is held to the rule.
  const rex = await person("Replay Rex", { plus: true });
  const body = { material: "copper" };
  const first = await put(rex, body);
  base.raw.prepare("UPDATE cards SET material = NULL WHERE id = ?").run(rex.card);
  base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1, rex.id);
  const replay = await put(rex, body);
  check("the same request, replayed after the plan lapsed, is refused", first.status === 200 && replay.status === 400 && matOf(rex.card) === null);
  // Plus saves at the same moment as each other: the last one in is what is kept, and it is one of the six.
  const plus = await person("Racing Pia", { plus: true });
  const rs = await Promise.all(MATERIAL_IDS.map((m) => put(plus, { material: m })));
  check("six Plus saves at the same moment all succeed and the card ends with exactly one of the six", rs.every((r) => r.status === 200) && MATERIAL_IDS.includes(matOf(plus.card)), rs.map((r) => r.status).join());
  // A save that mixes a material with other changes races with a plan lapse: all or nothing.
  const mix = await person("Mixed Max", { plus: true });
  const racing = await Promise.all([put(mix, { name: "Max one", material: "gold" }), (async () => { base.raw.prepare("UPDATE users SET plan_until = ? WHERE id = ?").run(Date.now() - 1, mix.id); return { status: 0 }; })()]);
  const nm = nameOf(mix.card), mm = matOf(mix.card);
  check("a save with a material that races a lapse either lands whole or not at all (never the name without the material)", (racing[0].status === 200 && nm === "Max one" && mm === "gold") || (racing[0].status === 400 && nm !== "Max one" && mm === null), { st: racing[0].status, nm, mm });
}

console.log("\n# F56 What the strap text is, and the other colours stay as F55 built them");
{
  const p = await person("Colour Cleo", { plus: true });
  await put(p, { strapColor: "#12817A", material: "silver" });
  const v = (await p.c.get("/api/me")).json.cards[0];
  check("the strap colour and its words are still sent beside a material (the page uses the material's own ink instead)", v.strapColor === "#12817A" && v.strapInk === "#fff" && v.material === "silver");
  await put(p, { material: "" });
  check("clearing the material shows the strap colour again", (await p.c.get("/api/me")).json.cards[0].material === null && strapOf(p.card) === "#12817A");
}

summary();
