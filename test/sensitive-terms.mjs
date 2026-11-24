// F69: keep sensitive words out of Who to meet (D057). Each line of the plan's privacy and safety bar is a check here,
// with its negatives: the list and isSensitive, the plain order, the reasons (plain and AI), what reaches the stubbed
// gateway, what is still shown, the prompt line, and "meet other Muslim founders". Run: node test/sensitive-terms.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeEnv, check, summary, becomeHost, reqBody } from "./harness.mjs";
import { setSetting } from "../worker/ai/store.js";
import { SENSITIVE_TERMS, HERITAGE, GROUPS, isSensitive, stripSensitive, findSensitive } from "../src/lib/sensitiveTerms.js";
import { screenLine, screenHeadline, screenFields, screenSide, safeReason } from "../worker/suggestScreen.js";
import { rankSuggest, meRow } from "../worker/suggestMatch.js";
import { rank, topicsOf, visibleFields } from "../worker/presenceMatch.js";
import { inCommon, visibleSide } from "../worker/inCommon.js";
import { candidateRecord, viewerRecord } from "../worker/ai/suggestRank.js";
import { buildRecord } from "../worker/ai/whoToMeet.js";
import { SUGGEST_RANK_SYSTEM, SENSITIVE_LINE, PROMPT_VERSION as SUGGEST_VERSION_P } from "../worker/ai/prompts/suggestRank.js";
import { WHO_TO_MEET_SYSTEM, PROMPT_VERSION as MEET_VERSION_P } from "../worker/ai/prompts/whoToMeet.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
const H = 3600e3;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (hay, needle) => new RegExp(`(^|[^\\p{L}])${esc(needle)}`, "iu").test(hay);

// Twelve and more sensitive examples, every category in the plan, each with where it goes and the words to search for.
const FIXTURE = [
  { cat: "religion", where: "tag", text: "Christian Union", needles: ["Christian"] },
  { cat: "religion", where: "tag", text: "Islamic Society", needles: ["Islamic"] },
  { cat: "religion", where: "intention", text: "Find a Friday prayers group", needles: ["prayers"] },
  { cat: "religion", where: "headline", text: "Jewish Soc treasurer", needles: ["Jewish"] },
  { cat: "health", where: "tag", text: "Mental health", needles: ["Mental health"] },
  { cat: "health", where: "tag", text: "Disabled Students Network", needles: ["Disabled"] },
  { cat: "health", where: "intention", text: "Meet other founders with ADHD", needles: ["ADHD"] },
  { cat: "sexuality", where: "tag", text: "LGBTQ+ Network", needles: ["LGBTQ"] },
  { cat: "sexuality", where: "headline", text: "Queer in tech", needles: ["Queer"] },
  { cat: "gender identity", where: "tag", text: "Non-binary in STEM", needles: ["binary"] },
  { cat: "politics", where: "tag", text: "Labour Students", needles: ["Labour"] },
  { cat: "politics", where: "intention", text: "Meet Conservative Association members", needles: ["Conservative"] },
  { cat: "politics", where: "tag", text: "Socialist Society", needles: ["Socialist"] },
  { cat: "trade union", where: "tag", text: "UNISON", needles: ["UNISON"] },
  { cat: "trade union", where: "headline", text: "Nurse and union rep", needles: ["union rep", "Nurse"] },
  { cat: "ethnicity", where: "tag", text: "BAME Network", needles: ["BAME"] },
  { cat: "ethnicity", where: "tag", text: "Nigerian Society", needles: ["Nigerian"] },
  { cat: "ethnicity", where: "intention", text: "Meet Black founders", needles: ["Black"] },
];

// ------------------------------------------------------------------ bar 1
console.log("\n# The list: one file, no imports, the list and isSensitive");
{
  const src = read("src/lib/sensitiveTerms.js");
  check("src/lib/sensitiveTerms.js has no imports", !/^\s*import\b|\bimport\s*\(|\brequire\s*\(/m.test(src));
  check("it exports the list and isSensitive(text)", typeof isSensitive === "function" && typeof SENSITIVE_TERMS === "object" && /export const SENSITIVE_TERMS/.test(src) && /export const isSensitive/.test(src));
  const cats = ["religion", "health", "sexuality", "politics", "tradeUnion", "ethnicity"];
  check("it holds every category in the plan (religion or belief, health and disability, sexuality and gender identity, politics, trade unions, ethnicity)", cats.every((c) => Array.isArray(SENSITIVE_TERMS[c]) && SENSITIVE_TERMS[c].length >= 10), Object.keys(SENSITIVE_TERMS));
  check("…the plan's named words are on it (prayer, church, mosque, synagogue, temple, BAME)", ["prayer", "church", "mosque", "synagogue", "temple"].every((w) => SENSITIVE_TERMS.religion.includes(w)) && SENSITIVE_TERMS.ethnicity.includes("bame"));
  check("…heritage societies by their common words (nigerian society, chinese soc, polish students)", HERITAGE.includes("nigerian") && GROUPS.includes("society") && ["Nigerian Society", "Chinese Soc", "Polish students", "Black Network"].every(isSensitive));
  check("every term on the list is lower case and plain (reviewable, and no UI copy)", Object.values(SENSITIVE_TERMS).flat().every((t) => t === t.toLowerCase() && /^[a-z0-9 ]+$/.test(t)));
  check("the header says what it is for and that a list cannot catch every phrasing", /special category/.test(src) && /cannot catch every phrasing/.test(src));
  const files = [];
  const walk = (d) => { for (const n of readdirSync(join(root, d))) { const p = `${d}/${n}`; if (statSync(join(root, p)).isDirectory()) walk(p); else if (/\.(vue|js)$/.test(n)) files.push(p); } };
  walk("src");
  const front = files.filter((f) => f !== "src/lib/sensitiveTerms.js" && /sensitiveTerms/.test(read(f)));
  check("no front-end file imports it (it is Worker-side, so no public page grows)", front.length === 0, front);
}

console.log("\n# Matching: whole words, any case, plurals, phrases");
{
  const yes = [
    "Christian Union", "christian union", "CHRISTIAN UNION", "Christian Unions", "Christians", "Churches", "the church choir",
    "LGBTQ+", "lgbtq+ network", "LGBT", "Mental health", "mental-health first aider", "Islamic Society", "Islamic societies",
    "HinduSoc", "ISoc", "JSoc", "LGBTSoc", "Friday prayers group", "Muslim", "muslims", "Mosque", "synagogue", "Temple",
    "Disabled", "disability", "Disabilities", "ADHD", "autistic", "Dyslexia", "Neurodivergent", "Non-binary", "nonbinary",
    "trans", "Transgender", "Queer", "Gay", "Pride", "Labour Students", "Labour Party", "Tories", "Conservative",
    "Lib Dems", "Socialist", "Green Party", "Trade union", "Union rep", "UNISON", "UCU", "BAME", "Black founders",
    "Nigerian Society", "Chinese Students", "South Asian", "Mixed race", "People of colour", "Hispanic", "Ethnicities",
    "Café chrétien Catholic", "Bahá'í", "Jehovah's Witness", "Sikh", "Ramadan", "Halal food", "Bible study",
  ];
  const missed = yes.filter((t) => !isSensitive(t));
  check(`${yes.length} sensitive tags and phrases hit`, missed.length === 0, missed);
  const no = [
    "Finance", "Unity", "Unity developer", "Ethics", "AI ethics", "Health tech", "Healthtech", "Healthcare", "Digital health",
    "Public health", "Health", "Labour law", "Labour market", "Students' Union", "Union Square", "European Union law",
    "Black belt", "Black-Scholes", "Asian markets", "Chinese", "Speaks Japanese", "Proof of concept", "BI", "Liberal arts",
    "Cancer research", "Race car engineering", "Machine learning", "Investing", "Design", "Start-ups", "Knitting", "Women in tech",
    "Transport", "Transformers", "Godot", "Gaming", "Prayerful", "Templates", "Churchill", "Parliament", "Policy",
    "Community", "Society", "Student society", "Heritage", "Fintech", "Theology", "Hiring", "Mentoring", "Partnerships",
  ];
  const wrong = no.filter((t) => isSensitive(t));
  check(`${no.length} common words do not hit (Finance, Unity, Ethics, Health tech, Healthcare, Labour law, Black belt…)`, wrong.length === 0, wrong);
  check("'health' alone and health as an industry do not hit; 'mental health' does (documented choice)", !isSensitive("health") && !isSensitive("Health tech") && !isSensitive("healthcare") && !isSensitive("digital health") && isSensitive("mental health") && isSensitive("Mental Health Society"));
  check("whole words only: 'Prayerful', 'Templates', 'Churchill', 'Transport' do not hit", ["Prayerful", "Templates", "Churchill", "Transport"].every((t) => !isSensitive(t)));
  check("an empty or missing text is not sensitive", !isSensitive("") && !isSensitive(null) && !isSensitive(undefined));
  const s = findSensitive("Fintech | Christian Union president");
  check("findSensitive gives where each term is", s.length === 1 && "Fintech | Christian Union president".slice(s[0].start, s[0].end) === "Christian Union" && s[0].words === 2, s);
  check("stripSensitive takes the words out, and a '+' after LGBTQ", stripSensitive("meet other Muslim founders").text === "meet other founders" && stripSensitive("LGBTQ+ founders").text === "founders" && stripSensitive("Finance").words === 0);
}

console.log("\n# The screen: intentions, headlines and fields");
{
  check("an intention loses its sensitive words: 'meet other Muslim founders' -> 'meet other founders'", screenLine("meet other Muslim founders") === "meet other founders");
  check("…and is dropped whole when it is mostly sensitive ('Christian Union socials', 'Meet Black founders' left only 'Meet')", screenLine("Christian Union socials") === "" && screenLine("Meet Black founders") === "" && screenLine("Meet other Muslims") === "");
  check("…and is unchanged when nothing hits", screenLine("Find a summer internship") === "Find a summer internship" && screenLine("") === "");
  check("a headline drops only the phrase with a sensitive term", screenHeadline("Founder at Acme | Christian Union president") === "Founder at Acme" && screenHeadline("Analyst, LGBTQ+ network lead, fintech") === "Analyst, fintech" && screenHeadline("Muslim founder building fintech") === "" && screenHeadline("Analyst at a bank") === "Analyst at a bank");
  const f = screenFields(visibleFields({ mode: "career", role: "Imam", company: "Acme", uni: "Test University", tags: ["Finance", "Christian Union", "Mental health"], card_tags: null, headline: "Engineer | Labour Students", intro: "Meet Black founders" }));
  check("screenFields drops sensitive tags, a sensitive role, headline phrase and intro, and keeps the rest", f.tags.join() === "Finance" && f.side.tags.join() === "Finance" && f.role === "" && f.company === "Acme" && f.headline === "Engineer" && f.intro === "" && f.institution === "Test University", f);
  const side = screenSide(visibleSide({ mode: "student", uni: "Islamic College", course: "Islamic Studies", tags: ["Christian Union", "Finance"] }, null));
  check("screenSide (shared ground in Who to meet) drops a sensitive tag, course and institution", side.tags.join() === "Finance" && side.course === "" && side.institution === null);
  check("safeReason: a reason with a sensitive word is replaced, and never by another one", safeReason("Into Finance") === "Into Finance" && safeReason("Into Christian Union", "Into Finance") === "Into Finance" && safeReason("Into Christian Union", "Both into Muslim") === "" && safeReason("") === "");
}

// ------------------------------------------------------------------ bar 2 and 3 (pure)
console.log("\n# The plain order never scores on a screened tag, intention word or shared-ground fact");
{
  const me = (tags, extra = {}) => meRow({ mode: "student", tags, ...extra }, { tags, headline: extra.headline || "" });
  const cand = (id, tags, extra = {}) => ({ id, user_id: `u-${id}`, mode: "student", tags, card_tags: JSON.stringify(tags), headline: "", intention: "", checked_in_at: 1, ...extra });
  const cu = rankSuggest({ me: me(["Christian Union"]), intention: "", rows: [cand("b", ["Christian Union"])] });
  check("two people sharing only 'Christian Union': no match (the 'new' list), no reason about it", cu.mode === "new" && cu.ranked.every((r) => r.score === 0 && !isSensitive(r.reason)), cu);
  const fi = rankSuggest({ me: me(["Finance"]), intention: "", rows: [cand("b", ["Finance"])] });
  check("two people sharing 'Finance' still match, 'Both into Finance'", fi.mode === "matched" && fi.ranked[0].reason === "Both into Finance", fi);
  const fiI = rankSuggest({ me: me(["Design"]), intention: "Meet people in finance", rows: [cand("b", ["Finance"])] });
  check("…and an intention about finance gives 'Into Finance'", fiI.mode === "matched" && fiI.ranked[0].reason === "Into Finance", fiI);
  const cuI = rankSuggest({ me: me(["Design"]), intention: "Meet the Christian Union", rows: [cand("b", ["Christian Union"])] });
  check("an intention naming a screened tag does not score on it either", cuI.mode === "new", cuI);
  const back = rankSuggest({ me: me(["Christian Union"]), intention: "", rows: [cand("b", ["Golf"], { intention: "Meet the Christian Union" })] });
  check("…nor does their intention against a screened tag on my card ('Looking for …, which is on your card')", back.mode === "new", back);
  const both = rankSuggest({ me: me(["Christian Union", "Finance"]), intention: "", rows: [cand("b", ["Christian Union", "Finance"])] });
  check("sharing 'Christian Union' and 'Finance': one fact, about Finance only", both.ranked[0].score === 1 && both.ranked[0].reason === "Both into Finance", both.ranked[0]);
  const hl = rankSuggest({ me: me(["Design"]), intention: "Meet people from the mosque", rows: [cand("b", ["Golf"], { headline: "Analyst | Mosque volunteer" })] });
  check("a screened headline phrase never scores ('Mentions mosque')", hl.mode === "new", hl);
  const course = rankSuggest({ me: me([], { uni: "Test University", course: "Islamic Studies" }), intention: "", rows: [cand("b", [], { uni: "Test University", course: "Islamic Studies" })] });
  check("a screened course makes no 'Same course' fact (the institution still can)", course.ranked[0].reason === "Both at Test University" && course.ranked[0].score === 1, course.ranked[0]);
  let bad = [];
  for (const x of FIXTURE) {
    const r = rankSuggest({ me: me([x.text], { headline: x.text }), intention: "", rows: [cand("b", [x.text], { headline: x.text })] });
    if (r.mode !== "new" || r.ranked.some((p) => isSensitive(p.reason))) bad.push([x.text, r.mode, r.ranked.map((p) => p.reason)]);
  }
  check(`each of the ${FIXTURE.length} fixture examples, on both sides as a tag and a headline, scores nothing and makes no reason`, bad.length === 0, bad);
  bad = [];
  for (const x of FIXTURE) {
    const rows = [cand("b", [x.text, "Golf"], { headline: x.text, intention: x.text }), cand("c", ["Golf"], { intention: x.text })];
    const r = rankSuggest({ me: me([x.text]), intention: x.text, rows });
    const bare = rankSuggest({ me: me([]), intention: screenLine(x.text), rows: rows.map((w) => ({ ...w, tags: ["Golf"], card_tags: '["Golf"]', headline: "", intention: screenLine(x.text) })) });
    const sc = (o) => o.ranked.map((p) => `${p.row.id}:${p.score}`).join();
    if (sc(r) !== sc(bare) || r.ranked.some((p) => isSensitive(p.reason))) bad.push([x.text, sc(r), sc(bare), r.ranked.map((p) => p.reason)]);
  }
  check(`…and as an intention on both sides it scores exactly as the intention with those words taken out, with no reason about them`, bad.length === 0, bad);
  check("(the residual the plan names: 'Find a Friday prayers group' keeps 'Find a Friday group'; 'Islamic Society' goes whole)", screenLine("Find a Friday prayers group") === "Find a Friday group" && screenLine("Islamic Society") === "" && screenLine("Jewish Soc treasurer") === "Soc treasurer");
  const card = inCommon(visibleSide({ mode: "student", tags: ["Christian Union"] }, null), visibleSide({ mode: "student", tags: ["Christian Union"] }, null));
  check("the person page's shared ground (F16, people already connected) is not screened, by the plan", card[0]?.text === "Both into Christian Union");
}

console.log("\n# The older who-to-meet path (F17 list, F25 route): still mounted, so screened the same way");
{
  const index = read("worker/index.js");
  check("(its routes are still mounted, though no page calls them)", /app\.route\("\/", whoToMeetApp\)/.test(index) && !/\/api\/ai\/who-to-meet|\/suggestions"/.test(read("src/components/EventWhoToMeet.vue") + read("src/components/EventPresence.vue")));
  const rows = [{ id: "r1", mode: "student", tags: ["Christian Union"], card_tags: null, intro: "Christian Union socials", checked_in_at: 1 }, { id: "r2", mode: "student", tags: ["Christian Union"], card_tags: null, intro: "", checked_in_at: 1 }];
  const r = rank({ me: visibleSide({ mode: "student", tags: ["Christian Union"] }, null), wish: "Someone from the Christian Union", rows });
  check("F17's rank: a screened wish, tag, intro and shared tag score nothing", r.mode === "new" && r.ranked.every((x) => !isSensitive(x.reason)), r);
  const ok = rank({ me: visibleSide({ mode: "student", tags: ["Finance"] }, null), wish: "finance", rows: [{ id: "r3", mode: "student", tags: ["Finance", "Islamic Society"], card_tags: null, intro: "", checked_in_at: 1 }] });
  check("…while Finance still does ('Into Finance')", ok.mode === "matched" && ok.ranked[0].reason === "Into Finance", ok);
  check("its topic chips leave out screened tags", topicsOf(rows.concat([{ id: "r4", mode: "student", tags: ["Christian Union", "Golf"] }, { id: "r5", mode: "student", tags: ["Golf"] }])).join() === "Golf");
  const rec = buildRecord({ mode: "student", tags: ["Finance", "LGBTQ+ Network"], card_tags: null, headline: "Analyst | Labour Students", intro: "Meet Black founders", course: "Maths" });
  check("F25's record for the model has no sensitive tag, headline phrase or intro", JSON.stringify(rec) === JSON.stringify({ line: "Maths", headline: "Analyst", tags: ["Finance"] }), rec);
  check("F25's prompt has the fixed line too, and its version moved on", WHO_TO_MEET_SYSTEM.includes(SENSITIVE_LINE) && MEET_VERSION_P === "who-to-meet-3");
}

// ------------------------------------------------------------------ bar 6
console.log("\n# The system prompt has the fixed line, word for word");
{
  const LINE = "Never match people on, or mention, religion or belief, health, sexuality or gender identity, politics, ethnicity or trade union membership.";
  check("SENSITIVE_LINE is the plan's sentence", SENSITIVE_LINE === LINE);
  check("F60's system prompt contains it, on its own line", SUGGEST_RANK_SYSTEM.split("\n").includes(LINE));
  check("the prompt version was bumped (kept picks from before are not reused)", SUGGEST_VERSION_P === "suggest-rank-2");
}

// ------------------------------------------------------------------ the real Worker, AI off
console.log("\n# Through the real Worker (AI off): Christian Union, Finance, and the card is unchanged");
const T = await makeEnv();
const host = T.client({ ip: "10.69.250.1", site: "host" });
const hi = await becomeHost(host, { kind: "company", name: "Screen Test Co" });
T.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('cr-69', ?, 20, 0, 'test', ?)").run(hi.org.json.id, Date.now());
let ipN = 1;
async function signup(env, name, extra = {}) {
  const c = env.client({ ip: `10.69.${Math.floor(ipN / 200)}.${(ipN++ % 200) + 1}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...extra });
  if (r.status !== 201) throw new Error(r.text);
  const id = (await c.get("/api/me")).json.user.id;
  const card = env.env.DB.raw.prepare("SELECT id FROM cards WHERE user_id = ? AND is_default = 1").get(id)?.id;
  return { c, name, id, card };
}
const mkEvent = async (h, name) => {
  const r = await h.post("/api/host/events", { name, startsAt: Date.now() - H, endsAt: Date.now() + 5 * H });
  if (r.status !== 201) throw new Error(r.text);
  return r.json;
};
const checkIn = async (p, ev, body = { suggest: true }) => { const r = await p.c.post(`/api/e/${ev.code}/checkin`, body); if (r.status !== 200) throw new Error(r.text); };
const list = async (p, ev) => (await p.c.post(`/api/e/${ev.id}/who-to-meet`, {})).json;
{
  const ev = await mkEvent(host, "Union night");
  const A = await signup(T, "Abel Union", { tags: ["Christian Union"] });
  const B = await signup(T, "Bea Union", { tags: ["Christian Union"] });
  await checkIn(A, ev); await checkIn(B, ev);
  const la = await list(A, ev), lb = await list(B, ev);
  check("both tagged 'Christian Union', nothing else in common: neither is matched to the other (the 'new' list)", la.mode === "new" && lb.mode === "new", [la.mode, lb.mode]);
  check("…and no reason in either list mentions it", [...la.people, ...lb.people].every((p) => !/christian|union/i.test(p.reason)), [la.people, lb.people]);
  const bInA = la.people.find((p) => p.name === "Bea U.");
  const card = await T.client({ ip: "10.69.251.1" }).get(`/api/c/${B.card}`);
  check("Bea's card still shows 'Christian Union'", card.status === 200 && JSON.stringify(card.json).includes("Christian Union"), card.json?.tags);
  check("…and her entry in Abel's list shows her tags as her card does", bInA && JSON.stringify(bInA.tags) === JSON.stringify(["Christian Union"]), bInA);

  const ev2 = await mkEvent(host, "Finance night");
  const C = await signup(T, "Cal Finance", { tags: ["Finance"] });
  const D = await signup(T, "Dee Finance", { tags: ["Finance"] });
  const E = await signup(T, "Eli Intent", { tags: ["Design"] });
  await checkIn(C, ev2); await checkIn(D, ev2); await checkIn(E, ev2, { suggest: true, intention: "Meet people in finance" });
  const lc = await list(C, ev2), le = await list(E, ev2);
  check("both tagged 'Finance': still matched, 'Both into Finance'", lc.mode === "matched" && lc.people.find((p) => p.name === "Dee F.")?.reason === "Both into Finance", lc.people);
  check("…and someone hoping to meet people in finance gets 'Into Finance'", le.mode === "matched" && le.people.some((p) => p.reason === "Into Finance"), le.people);

  const ev3 = await mkEvent(host, "Founders night");
  const M = await signup(T, "Mo Viewer", { tags: ["Design"] });
  const F1 = await signup(T, "Fay Founder", { tags: ["Founders"] });
  const F2 = await signup(T, "Gus Faith", { tags: ["Muslim Society"] });
  await checkIn(M, ev3, { suggest: true, intention: "meet other Muslim founders" }); await checkIn(F1, ev3); await checkIn(F2, ev3);
  const lm = await list(M, ev3);
  check("'meet other Muslim founders' scores on 'founders' (Fay, 'Into Founders') and not on 'Muslim' (Gus is not matched)", lm.mode === "matched" && lm.people.length === 1 && lm.people[0].name === "Fay F." && lm.people[0].reason === "Into Founders", lm.people);
  const lf = await list(F2, ev3);
  check("Mo's entry in Gus's list shows Mo's intention exactly as written", lf.people.find((p) => p.name === "Mo V.")?.intention === "meet other Muslim founders", lf.people);
}

// ------------------------------------------------------------------ the real Worker, AI on, a recorded gateway
console.log("\n# AI on with a recorded gateway: what reaches the model, and what comes back");
const model = { calls: [], raws: [], reply: null };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith("https://gateway.test/")) throw new Error(`unexpected network call to ${url}`);
  model.raws.push(String(init.body));
  const body = reqBody(init.body);
  model.calls.push(body);
  const out = typeof model.reply === "function" ? model.reply(body) : model.reply ?? { matches: [] };
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 80 } }), { status: 200 });
};
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const T2 = await makeEnv({ AI_ENABLED: "1", AI_GATEWAY_URL: "https://gateway.test/v1/a/b/anthropic", OPENROUTER_API_KEY: "sk-test-not-a-real-key-0123456789", AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" });
await setSetting(T2.env.DB, "rollout", "everyone");
const verify = (p) => T2.env.DB.raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?").run(`p${p.id}@mail.test`, p.id);
const host2 = T2.client({ ip: "10.69.252.1", site: "host" });
const h2 = await becomeHost(host2, { kind: "company", name: "AI Screen Co" });
T2.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('cr-69b', ?, 20, 0, 'test', ?)").run(h2.org.json.id, realNow());
{
  const ev = await mkEvent(host2, "AI screen night");
  // The viewer: a sensitive tag and headline phrase of their own, and the plan's intention.
  const V = await signup(T2, "Vic Viewer", { tags: ["Design", "Hindu Society"], headline: "Designer | Pride network lead" });
  verify(V);
  await checkIn(V, ev, { suggest: true, intention: "meet other Muslim founders" });
  // Six people carrying the fixture between them, each with something plain to match on.
  const groups = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17]];
  const people = [];
  for (const [n, idx] of groups.entries()) {
    const xs = idx.map((i) => FIXTURE[i]);
    const tags = ["Founders", ...xs.filter((x) => x.where === "tag").map((x) => x.text)];
    const headline = ["Founder at Acme", ...xs.filter((x) => x.where === "headline").map((x) => x.text)].join(" | ");
    const intention = xs.find((x) => x.where === "intention")?.text || "";
    const p = await signup(T2, `Per${"abcdef"[n]} Son`, { tags, headline });
    verify(p);
    await checkIn(p, ev, { suggest: true, intention });
    people.push({ ...p, tags, headline, intention });
  }
  model.reply = (b) => {
    const d = JSON.parse(/<data>\n([\s\S]*)\n<\/data>/.exec(b.messages[0].content)[1]);
    const [x, y, z] = d.people;
    return { matches: [
      { id: x.id, quote: "Founders", reason: "You both pray at the same church" },
      { id: y.id, quote: "Founders", reason: "Both in the Christian Union, a perfect fit" },
      { id: z.id, quote: "Christian Union", reason: "Shares your faith" },
    ] };
  };
  const r = await V.c.post(`/api/e/${ev.id}/who-to-meet`, {});
  check("(the list was ranked with one model call)", model.calls.length === 1 && r.status === 200 && r.json.ai === true, r.json);
  const rawBody = model.raws[0];
  const body = model.calls[0];
  const d = JSON.parse(/<data>\n([\s\S]*)\n<\/data>/.exec(body.messages[0].content)[1]);
  const leaked = FIXTURE.flatMap((x) => x.needles).concat(["Muslim", "Hindu", "Pride", "Christian Union", "prayer"]).filter((n) => has(rawBody, n));
  check(`the raw request body holds none of the ${FIXTURE.length} screened tags, intention phrases or headline phrases (searched for ${FIXTURE.flatMap((x) => x.needles).length + 5} words)`, leaked.length === 0, leaked);
  check("…covering every category in the plan", new Set(FIXTURE.map((x) => x.cat)).size === 7 && FIXTURE.length >= 12);
  check("…while the plain parts are still sent (tags, headline phrases, the rest of an intention)", d.people.length === 6 && d.people.every((p) => p.tags?.includes("Founders") && p.headline === "Founder at Acme") && d.people.some((p) => p.intention === "Meet other founders with" || p.intention === "Find a Friday group"), d.people);
  check("the viewer's own record: 'meet other founders', 'Design', 'Designer', and no 'Muslim'", d.me.intention === "meet other founders" && JSON.stringify(d.me.tags) === '["Design"]' && d.me.headline === "Designer" && !/muslim/i.test(JSON.stringify(d.me)), d.me);
  check("the system prompt sent is the one with the fixed line", body.system.includes(SENSITIVE_LINE));
  const reasons = r.json.people.map((p) => p.reason);
  check("no reason shown, AI or plain, contains a screened term", reasons.every((x) => !isSensitive(x)) && !/pray|church|christian|faith/i.test(JSON.stringify(r.json.people.map((p) => p.reason))), reasons);
  check("the AI's reasons that mention faith (lower case, and named) are replaced by the plain reason for that person ('Into Founders')", r.json.people[0].reason === "Into Founders" && r.json.people[1].reason === "Into Founders", r.json.people.map((p) => [p.name, p.reason]));
  const kept = T2.env.DB.raw.prepare("SELECT result FROM ai_cache WHERE feature = 'who_to_meet'").all().map((x) => JSON.stringify(x)).join();
  check("…and the kept picks do not store those reasons", kept.length > 0 && !/pray|church|christian|faith/i.test(kept), kept.slice(0, 300));
  check("a pick quoting a screened tag (not in the record sent) is dropped, not shown with its reason", !reasons.includes("Shares your faith"));
  const again = await V.c.post(`/api/e/${ev.id}/who-to-meet`, {});
  check("the kept order (no new call) is checked the same way on the next request", model.calls.length === 1 && again.json.ai === true && again.json.people.every((p) => !isSensitive(p.reason)) && again.json.people[0].reason === "Into Founders");
  // bar 5: the entries and the cards show exactly what the cards show.
  let same = r.json.people.length === 5;
  const info = [];
  for (const p of people) {
    const e = r.json.people.find((x) => x.name === `${p.name.split(" ")[0]} S.`);
    const card = await T2.client({ ip: `10.69.253.${people.indexOf(p) + 1}` }).get(`/api/c/${p.card}`);
    const ok = (!e || JSON.stringify(e.tags) === JSON.stringify(p.tags.slice(0, 3)) && e.intention === p.intention && e.headline === p.headline)
      && card.status === 200 && p.tags.every((t) => JSON.stringify(card.json).includes(JSON.stringify(t)));
    if (!ok) { same = false; info.push([p.name, e, card.json?.tags]); }
  }
  check("each person's entry (five shown) has their own tags (first three), headline and intention unchanged, and every card shows every tag", same, info);
  const viewerCard = await T2.client({ ip: "10.69.253.50" }).get(`/api/c/${V.card}`);
  check("the viewer's card still shows 'Hindu Society' and the whole headline", JSON.stringify(viewerCard.json).includes("Hindu Society") && JSON.stringify(viewerCard.json).includes("Designer | Pride network lead"));
  // bar 7 through the AI as well: the stubbed model sees "founders", never "Muslim".
  check("'meet other Muslim founders': the model sees 'founders' and no 'Muslim'", d.me.intention.includes("founders") && !/muslim/i.test(rawBody));
}
Date.now = realNow;
globalThis.fetch = realFetch;

// The candidate and viewer records, without the Worker: every fixture example is screened out of each field.
console.log("\n# The records the AI is built from, field by field");
{
  let bad = [];
  for (const x of FIXTURE) {
    const rec = candidateRecord({ mode: "career", role: x.text, company: x.text, tags: [x.text, "Fintech"], card_tags: null, headline: x.text, uni: x.text, intention: x.text });
    const me = viewerRecord({ mode: "student", course: x.text, tags: [x.text, "Fintech"], card_tags: null, headline: x.text }, x.text);
    const s = JSON.stringify([rec, me]);
    if (x.needles.some((n) => has(s, n)) || isSensitive(s)) bad.push([x.text, rec, me]);
  }
  check(`no fixture example survives in any field of a candidate's or the viewer's record (${FIXTURE.length} examples)`, bad.length === 0, bad);
}

console.log("\n# The Privacy Policy says it, and the Terms version is not bumped");
{
  const pol = read("src/views/Privacy.vue");
  const f = pol.slice(pol.indexOf("<h2>8f."), pol.indexOf("<h2>9."));
  check("section 8f says suggestions never use words about religion or belief, health, sexuality or gender identity, politics, ethnicity or trade union membership", /suggestions never use words about religion or belief, health, sexuality or gender identity, politics, ethnicity or trade union membership/.test(f));
  check("…and that the card still shows them", /Your card still shows them where you put them/.test(f));
  const { TERMS_VERSION } = await import("../worker/legal.js");
  check("the Terms and Privacy version is unchanged (2026-11-22)", TERMS_VERSION === "2026-11-22");
}

summary();
