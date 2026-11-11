// F24: "Do I know someone who...". Everything runs against the real Worker with a stubbed gateway: no network, no key
// from disk. The model here is a plain function the test controls, so the checks are about WHAT REACHES THE GATEWAY
// (the request body is recorded and inspected) and what the code does with whatever comes back. What a real model
// ranks cannot be tested here. The attack strings are in test/ai-injection.mjs.
// Run: node test/people-search.mjs
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";
import { setSetting } from "../worker/ai/store.js";
import { gatherPeople, narrow, buildRecord, verifyMatches, whereQuoted, reasonIsGrounded, looksLikeInstruction } from "../worker/ai/peopleSearch.js";
import { visibleSide, sharedCard } from "../worker/inCommon.js";
import { askTerms, rankRows } from "../src/lib/ask.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`unexpected network call to ${url}`); };

const KEY = "sk-test-not-a-real-key-0123456789";
const model = { calls: [], reply: null, status: 200 };
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith("https://gateway.test/")) throw new Error(`unexpected network call to ${url}`);
  const body = JSON.parse(init.body);
  model.calls.push(body);
  if (model.status !== 200) return new Response("{}", { status: model.status });
  const out = typeof model.reply === "function" ? model.reply(body) : model.reply ?? { matches: [] };
  const text = typeof out === "string" ? out : JSON.stringify(out);
  return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 900, output_tokens: 80 }, stop_reason: "end_turn" }), { status: 200 });
};
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const advance = (ms) => { skew += ms; };
const H = 3600e3;
const shown = (body) => JSON.parse(/<data>\n([\s\S]*)\n<\/data>/.exec(body.messages[0].content)[1]);
const lastCall = () => model.calls.at(-1);

const T = await makeEnv({ AI_ENABLED: "1", AI_GATEWAY_URL: "https://gateway.test/v1/a/b/anthropic", CLAUDE_API_KEY: KEY, AI_PRICE_INPUT_PER_MTOK_USD: "1", AI_PRICE_OUTPUT_PER_MTOK_USD: "5" });
const { client, q, q1, env } = T;
await setSetting(env.DB, "rollout", "everyone");

let ipn = 0;
async function signup(name, body = {}, { verified = true } = {}) {
  ipn += 1;
  const c = client({ ip: `10.24.${Math.floor(ipn / 200)}.${(ipn % 200) + 1}` });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, ...body });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  const id = me.json.user.id;
  if (verified) env.DB.raw.prepare("UPDATE users SET recovery_email = ?, email_verified = 1, is_guest = 0 WHERE id = ?").run(`${name.split(" ")[0].toLowerCase()}.${id}@mail.test`.slice(0, 80), id);
  return { c, name, id, card: me.json.cards[0].cardId };
}
const connect = async (from, to, body = {}) => {
  const r = await from.c.post("/api/connect", { cardId: to.card, ...body });
  if (r.status !== 200) throw new Error(r.text);
  return r.json.connectionId;
};
const ask = (p, query, body = {}) => p.c.post("/api/ai/people-search", { query, ...body });
// A new day for each group of checks, so the daily and hourly limits do not get in the way.
const reset = () => { model.calls.length = 0; model.reply = null; model.status = 200; advance(26 * H); };
// The id the request gave a person, found by a word that is only in their record.
const idOf = (body, needle) => shown(body).people.find((p) => JSON.stringify(p).includes(needle))?.id;
const wordsIn = (v) => JSON.stringify(v);

// ------------------------------------------------------------------ the people
const SECRET = { email: "bea.private@secret.example", link: "https://secret-link.example/bea", course: "KEPT-HIDDEN-COURSE", tag: "Secret hobby", company: "KEPT-HIDDEN-COMPANY" };
const A = await signup("Alice Asker", { mode: "student", uni: "University of Example", course: "Computer Science", tags: ["Robotics", "Gardening"], headline: "ALICE-HEADLINE", links: { LinkedIn: "https://www.linkedin.com/in/alice" } });
const B = await signup("Bea Brightwater", {
  mode: "career", company: "Acme Ltd", role: "Climate policy adviser", uni: "University of Example", course: SECRET.course,
  tags: ["Climate policy", "Battery recycling", SECRET.tag], headline: "Advises councils on net zero", about: `Writes briefings. Contact ${SECRET.email} or see ${SECRET.link}`,
  links: { LinkedIn: "https://www.linkedin.com/in/bea", Site: SECRET.link },
});
const C = await signup("Cal Cartwright", { mode: "student", uni: "University of Example", course: "Engineering", company: SECRET.company, tags: ["ML", "Python"], headline: "Computer vision for farm robots", about: "Trains models that spot weeds." });
const D = await signup("Dee Optout", { tags: ["Climate policy"], headline: "DEE-HEADLINE climate lawyer" });
const E = await signup("Eli Blocked", { tags: ["Climate policy"], headline: "ELI-HEADLINE" });
const F = await signup("Fay Leaver", { tags: ["Climate policy"], headline: "FAY-HEADLINE" });
const Z = await signup("Zed Stranger", { tags: ["Climate policy"], headline: "ZED-HEADLINE not connected to Alice" });
// Bea shares a card that shows only two tags, so "Secret hobby" is kept on her profile but hidden from Alice.
const beaCard = await B.c.post("/api/cards", { name: "Work card", tags: ["Climate policy", "Battery recycling"], note: "Ask me about carbon budgets" });
const beaCardId = beaCard.json.cardId || beaCard.json.id;
env.DB.raw.prepare("UPDATE cards SET is_default = 0 WHERE user_id = ?").run(B.id);
env.DB.raw.prepare("UPDATE cards SET is_default = 1 WHERE id = ?").run(beaCardId);
B.card = beaCardId;
env.DB.raw.prepare("UPDATE users SET plan = 'plus', plan_until = ? WHERE id = ?").run(realNow() + 3650 * 24 * H, A.id);
const cnB = await connect(A, B, { via: "qr" });
const cnC = await connect(A, C, { via: "link" });
const cnD = await connect(A, D);
const cnE = await connect(A, E);
const cnF = await connect(A, F);
await A.c.put(`/api/connections/${cnB}/note`, { text: "Met at the demo table. Contact bea@home.example or https://my-notes.example/bea" });
await A.c.put(`/api/connections/${cnB}/meta`, { tags: ["mentor"] });
await B.c.put(`/api/connections/${cnB}/note`, { text: "BEA-PRIVATE-NOTE-ABOUT-ALICE" });
// Someone else's connections: a stranger connected to Bea but not to Alice must never be offered.
await connect(Z, B);
env.DB.raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(A.id, E.id, realNow()); // a block with the connection left in place
await D.c.put("/api/ai/search", { ok: false });

// ================================================================== who is searched
console.log("\n# Who is searched (decided in code, before any model call)");
{
  const people = await gatherPeople(env.DB, A.id);
  const ids = people.map((p) => p.userId);
  check("the asker's own connections who can be searched are gathered", ids.includes(B.id) && ids.includes(C.id) && ids.includes(F.id), ids);
  check("a person who switched AI search off is not gathered", !ids.includes(D.id));
  check("a person blocked by the asker is not gathered, even with the connection row still there", !ids.includes(E.id));
  check("a person who is not a connection is not gathered", !ids.includes(Z.id) && !ids.includes(A.id));
  const blockedBy = await signup("Gil Blocker");
  await connect(A, blockedBy);
  env.DB.raw.prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)").run(blockedBy.id, A.id, realNow());
  check("a person who blocked the asker is not gathered either (blocks work both ways)", !(await gatherPeople(env.DB, A.id)).some((p) => p.userId === blockedBy.id));
  check("each person is one record, with the connection id the page needs", people.every((p) => p.connectionId && p.record && typeof p.metAt === "number") && new Set(ids).size === ids.length);
  check("a person with no connections gathers nobody", (await gatherPeople(env.DB, Z.id)).every((p) => p.userId === B.id) && (await gatherPeople(env.DB, (await signup("Nobody Yet")).id)).length === 0);

  const bea = people.find((p) => p.userId === B.id).record;
  const dump = wordsIn(bea);
  check("Bea's record holds what her shared card and her chosen mode show", bea.line === "Climate policy adviser at Acme Ltd · Studied at University of Example" && bea.headline === "Advises councils on net zero" && bea.cardNote === "Ask me about carbon budgets", bea);
  check("her tags are the shared card's tags only", bea.tags.join() === "Climate policy,Battery recycling", bea.tags);
  check("a tag the card leaves out (kept on the profile) is not there", !dump.includes(SECRET.tag));
  check("a course her career profile keeps but does not show is not there", !dump.includes(SECRET.course));
  check("her email address and link are removed from her about text, the rest is kept", !dump.includes("secret.example") && !dump.includes("secret-link") && /Writes briefings/.test(bea.about), bea.about);
  check("her link labels and addresses are not in the record at all", !/linkedin|Site/i.test(dump));
  check("her name is not in the record", !/Bea|Brightwater/.test(dump));
  check("her private note about Alice is not in the record", !dump.includes("BEA-PRIVATE"));
  check("Alice's own note and tag for Bea are (they are Alice's), with the email and link cut", bea.myTags.join() === "mentor" && /demo table/.test(bea.myNote) && !/@|my-notes|https?:/.test(bea.myNote), [bea.myTags, bea.myNote]);
  check("where and when they met is there as words", /^[A-Z][a-z]+ 20\d\d$/.test(bea.met), bea.met);
  const cal = people.find((p) => p.userId === C.id).record;
  check("a student profile's kept company is not in the record", !wordsIn(cal).includes(SECRET.company) && cal.line === "Engineering · University of Example", cal);

  // The same card the F16 helper picks, for a card made for the connection and for one that is not theirs.
  let same = true;
  for (const p of people) {
    const cn = q1("SELECT * FROM connections WHERE id = ?", p.connectionId);
    const card = await sharedCard(env.DB, p.userId, cn);
    const prof = q1("SELECT * FROM profiles WHERE user_id = ?", p.userId);
    prof.tags = JSON.parse(prof.tags);
    const want = (visibleSide(prof, card)?.tags || []).slice(0, 8);
    same = same && JSON.stringify(want) === JSON.stringify(p.record.tags || []);
  }
  check("the tags in every record are the ones visibleSide(sharedCard) gives", same);
  // A card the connection was made through that is NOT the person's own falls back to their default card.
  env.DB.raw.prepare("UPDATE connections SET card_id = ? WHERE id = ?").run(A.card, cnC);
  const cal2 = (await gatherPeople(env.DB, A.id)).find((p) => p.userId === C.id).record;
  check("a connection whose card_id is somebody else's card uses the person's default card", cal2.tags.join() === "ML,Python", cal2);
  env.DB.raw.prepare("UPDATE connections SET card_id = NULL WHERE id = ?").run(cnC);
}

// ================================================================== checking the reply
console.log("\n# Checking the reply: only offered people, only real quotes, only grounded reasons");
{
  const rec = { line: "Climate policy adviser at Acme Ltd", tags: ["Climate policy", "Battery recycling"], headline: "Advises councils on net zero", about: "Writes briefings" };
  const by = new Map([["p1", rec], ["p2", { tags: ["ML"], headline: "Computer vision for farm robots" }], ["p3", { tags: ["Fintech"] }]]);
  check("a quote that is in the record is kept, with where it was found", whereQuoted(rec, "climate POLICY") === "line" && whereQuoted(rec, "Battery recycling") === "tags" && whereQuoted(rec, "net-zero") === "headline");
  check("a quote that is not in the record is not", whereQuoted(rec, "works at Google") === "" && whereQuoted(rec, "Climate change") === "");
  check("a quote that is too short, or only joining words, is not accepted", whereQuoted(rec, "at") === "" && whereQuoted(rec, "a") === "" && whereQuoted(rec, "") === "");
  check("a quote must start and end on whole words", whereQuoted({ tags: ["Machine learning"] }, "chine learn") === "");
  const v = verifyMatches([
    { id: "p9", quote: "Climate policy", reason: "Invented person." },            // never offered
    { id: "p1", quote: "Climate policy", reason: "Works in climate policy." },
    { id: "p1", quote: "Battery recycling", reason: "Second go for the same person." }, // a repeat
    { id: "p3", quote: "Quantum computing", reason: "Not in their record." },       // an invented quote
    { id: "p2", quote: "Computer vision", reason: "Does computer vision at Google in 2019." }, // a made-up employer and year
    { id: "__proto__", quote: "x", reason: "x" }, { id: 7, quote: "Climate policy", reason: "x" }, null, "p1",
  ], by, "someone in climate");
  check("only an offered id, once, with a real quote survives", v.length === 2 && v[0].id === "p1" && v[1].id === "p2", v);
  check("a good reason is kept", v[0].reason === "Works in climate policy.");
  check("a reason that names a company or a year that is not in the record is replaced by the quote", v[1].reason === "Matches “Computer vision”", v[1].reason);
  check("a reason may use words from the question and from the record", reasonIsGrounded("Advises Councils on net zero.", rec, "x") && reasonIsGrounded("Works on Climate issues.", rec, "someone in Climate"));
  check("a reason with an unknown name, number, acronym or an id is not grounded", !reasonIsGrounded("Works with Sarah on this.", rec, "x") && !reasonIsGrounded("Has 12 years of experience.", rec, "x") && !reasonIsGrounded("Knows the EU well.", rec, "x") && !reasonIsGrounded("Same as p1.", rec, "x"));
  check("no more than five are returned", verifyMatches(Array.from({ length: 9 }, (_, i) => ({ id: `p${i + 1}`, quote: "Climate policy", reason: "ok" })), new Map(Array.from({ length: 9 }, (_, i) => [`p${i + 1}`, rec])), "x").length === 5);
}
// ================================================================== narrowing, size and speed
console.log("\n# Narrowing to 150 and the cost of gathering them");
reset();
{
  const mk = (i, text) => ({ userId: `u${i}`, connectionId: `c${i}`, metAt: 1e12 - i * 1000, record: { headline: text } });
  const many = Array.from({ length: 400 }, (_, i) => mk(i, i === 399 ? "Works on climate policy and carbon" : `Person number ${i} builds things`));
  const cut = narrow(many, "someone who works in climate policy");
  check("more than 150 people are cut to 150", cut.length === 150);
  check("the person who matches the words is kept even though they are the oldest", cut.some((p) => p.userId === "u399"));
  check("the rest are the most recent", cut[1].userId === "u0" && cut.length === new Set(cut.map((p) => p.userId)).size);
  check("150 or fewer are left alone", narrow(many.slice(0, 150), "x").length === 150 && narrow(many.slice(0, 5), "x").length === 5);

}

// ================================================================== the keyword fallback
console.log("\n# The keyword ranking the page uses when AI is not used");
{
  const rows = [
    { id: "1", metAt: 1, peer: { name: "Ann", mode: "career", role: "Policy adviser", company: "Council", tags: ["Climate policy"], headline: "Net zero plans" } },
    { id: "2", metAt: 3, peer: { name: "Ben", mode: "student", course: "Law", uni: "Example", tags: ["Contracts"], headline: "Climate lawyer" } },
    { id: "3", metAt: 2, peer: { name: "Cat", mode: "student", course: "Art", uni: "Example", tags: ["Painting"], headline: "Murals" } },
  ];
  check("the words that matter are picked out of a sentence", askTerms("someone who works in climate policy").join() === "climate,policy", askTerms("someone who works in climate policy"));
  const out = rankRows(rows, "someone who works in climate policy");
  check("people who match more of the words come first; people who match none are left out", out.map((x) => x.row.id).join() === "1,2", out.map((x) => x.row.id));
  check("each result says where it matched", out[0].label === "Come to me for" || out[0].label === "What I do", out[0].label);
  check("a sentence of only joining words finds nothing", rankRows(rows, "someone who is").length === 0);
  check("at most 5 come back", rankRows(Array.from({ length: 9 }, (_, i) => ({ id: `${i}`, metAt: i, peer: { name: "N", tags: ["climate"] } })), "climate").length === 5);
}

summary();
globalThis.fetch = realFetch;
