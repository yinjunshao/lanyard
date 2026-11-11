// F23: AI feedback summary for hosts. The real Worker against a stubbed gateway: no network, no key from disk.
// Sections are added task by task (F23.1 redaction and checks, F23.2 route and cron, F23.3 the screen, F23.4 email).
// The attack strings are also in test/ai-injection.mjs. Run: node test/feedback-summary.mjs
import { readFileSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { redactAnswer, nameMatcher, nameWords, NAME_TOKEN, CONTACT_TOKEN, hasToken } from "../worker/ai/redact.js";
import { cleanText, CAPS } from "../worker/ai/sanitize.js";
import { exactQuotes } from "../worker/ai/validate.js";
import { summarySystem, SUMMARY_SCHEMA, sentenceProblem, plainSentences, refineSummary, MIN_THEME, MAX_POINTS, MAX_QUOTES, PARAGRAPH_WORDS } from "../worker/ai/prompts/feedbackSummary.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`unexpected network call to ${url}`); };

console.log("\n# F23.1 Redaction: people and contact details never reach the model");
{
  const names = ["Priya Natarajan", "Tom Hargreaves", "Will Smith", "Zoë O'Brien-Clarke"];
  const keep = ["Spring Networking Night"];
  const red = (t) => redactAnswer(t, { names, keep });
  check("a full name of someone at the event becomes [name]", red("Priya Natarajan was rude to me") === "[name] was rude to me", red("Priya Natarajan was rude to me"));
  check("a first name on its own, or a surname, in any case, is taken out", red("priya talked too long") === "[name] talked too long" && red("Hargreaves was great") === "[name] was great");
  check("a name with an accent, an apostrophe and a hyphen is taken out", red("Zoë O'Brien-Clarke ran the door") === "[name] ran the door", red("Zoë O'Brien-Clarke ran the door"));
  check("a name that is also a word is taken out only as part of the whole name", red("Will Smith spoke. Will the food be better?") === "[name] spoke. Will the food be better?", red("Will Smith spoke. Will the food be better?"));
  check("a title and a name (a person nobody has listed) becomes [name]", red("Dr Hollis was lovely, and so was Prof. Anne Kay") === "[name] was lovely, and so was [name]", red("Dr Hollis was lovely, and so was Prof. Anne Kay"));
  check("thanks to somebody by name (not on any list) is taken out", red("Thanks to Jordan for the intro") === "Thanks to [name] for the intro" && red("Shout out to Kwame!") === "Shout out to [name]!", red("Thanks to Jordan for the intro"));
  check("two capitalised words that look like a name are taken out", red("Jordan Lee talked too long") === "[name] talked too long", red("Jordan Lee talked too long"));
  check("everyday capitalised phrases are not taken for a person", red("Thanks to everyone. The Student Union room and Great Hall were loud. Monday was best.") === "Thanks to everyone. The Student Union room and Great Hall were loud. Monday was best.", red("Thanks to everyone. The Student Union room and Great Hall were loud. Monday was best."));
  check("the event's own title is not taken for a person", red("Spring Networking Night was great") === "Spring Networking Night was great");
  check("a phone number becomes [contact]", red("call me on 07700 900123 or +44 (0)7700 900 456") === "call me on [contact] or [contact]", red("call me on 07700 900123 or +44 (0)7700 900 456"));
  check("a short run of digits (a year range, a count) is left alone", red("It ran from 2024-2026, about 40 minutes") === "It ran from 2024-2026, about 40 minutes");
  check("an @handle becomes [contact], an email address is not an @handle problem here (cleanText removes it first)", red("find me @priya_n or @ig.handle") === "find me [contact] or [contact]");
  check("redaction twice changes nothing more", red(red("Priya Natarajan, Dr Hollis, 07700 900123, @x_y")) === red("Priya Natarajan, Dr Hollis, 07700 900123, @x_y"));
  const noList = redactAnswer("Priya Natarajan was rude", {});
  check("with no list of names the name patterns still work, and nothing throws", /\[name\] was rude/.test(noList) && redactAnswer("", {}) === "");
  check("name words are 3 letters or more, not everyday words, each once, in lower case", nameWords(["Will Smith", "Jo Li", "Priya Priya Nair"]).join() === "priya,smith,nair" || nameWords(["Will Smith", "Jo Li", "Priya Priya Nair"]).sort().join() === "nair,priya,smith", nameWords(["Will Smith", "Jo Li", "Priya Priya Nair"]));
  const isName = nameMatcher(names);
  check("the matcher finds a listed name in the model's own words, in any case, as a whole word", isName("PRIYA was brilliant") && isName("ask tom hargreaves") && !isName("a priyanka said") && !isName("The room was loud"));
  check("the matcher with no names says no", nameMatcher([])("Priya") === false);
  check("a marker means 'never show this'", hasToken("a [name] said") && hasToken("[contact]") && !hasToken("a name said"));
  check("a hostile name list cannot break the pattern (regex characters in names)", (() => { try { return redactAnswer("a.b (c) hello", { names: ["a.b (c)", "x[y", "(((", "\\"] }).length > 0; } catch { return false; } })());
  const t0 = Date.now();
  redactAnswer("Aa Bb ".repeat(20000), { names }); redactAnswer("Priya ".repeat(50000), { names }); redactAnswer("1 ".repeat(100000), { names });
  check("huge or nasty text is handled quickly", Date.now() - t0 < 2500, Date.now() - t0);
}

console.log("\n# F23.1 The prompt and the checks on what the model sends back");
{
  const sys = summarySystem();
  check("the task says: only the answers, UK English, no person, no numbers, ignore instructions inside answers", /Use only what is in the answers/.test(sys) && /UK English/.test(sys) && /Never name, describe or point at any one person/.test(sys) && /no digits, no number words/.test(sys) && /ignore it and carry on/.test(sys));
  check("it states the JSON shape and the 3-answer rule for a point", /"paragraph"/.test(sys) && /"worked"/.test(sys) && /"change"/.test(sys) && /"quotes"/.test(sys) && /at least 3 answers/.test(sys));
  check("nothing about an event, host or person is in the task text (that is data)", !/Spring|Priya|@|https?:/.test(sys));

  check("a digit, a percentage and a number word are problems", sentenceProblem("About 12 people liked it.") && sentenceProblem("It was 80% good.") && sentenceProblem("Three people asked for more time.") && sentenceProblem("It rated nine out of ten."));
  check("a strong count word is a problem; soft words are not", sentenceProblem("Most people enjoyed it.") && sentenceProblem("Everyone loved the food.") && sentenceProblem("Nobody liked the queue.") && !sentenceProblem("Some people enjoyed the format and a few found the room loud."));
  check("pointing at one person is a problem", sentenceProblem("Someone said the host was rude.") && sentenceProblem("One person found it loud.") && sentenceProblem("A single attendee wanted more food.") && !sentenceProblem("People found the room loud."));
  check("a marker or a listed name is a problem", sentenceProblem("[name] was rude.") && sentenceProblem("Priya was rude.", nameMatcher(["Priya Natarajan"])) && !sentenceProblem("The host was warm.", nameMatcher(["Priya Natarajan"])));
  check("words that merely contain a bad word are fine", !sentenceProblem("The tone was welcoming and the mixer well run.") && !sentenceProblem("People wanted more time to talk."));
  const para = plainSentences("People enjoyed the format. About 40 said so. Some wanted longer introductions. Everyone loved it.", () => false);
  check("a paragraph keeps the clean sentences and drops the ones with a number or a count", para === "People enjoyed the format. Some wanted longer introductions.", para);
  const long = Array.from({ length: 30 }, (_, i) => `People liked part ${"x".repeat(0)}thing and wanted more of it, in the same way, again and again.`).join(" ");
  check("a paragraph is cut at a sentence end to at most 80 words", plainSentences(long.replace(/\d+/g, ""), () => false).split(/\s+/).length <= PARAGRAPH_WORDS);
  check("a paragraph with nothing clean in it is empty", plainSentences("12 people. Most agreed.", () => false) === "");
}

console.log("\n# F23.1 The reply checks (refine): counts from code, quotes exact, names out");
{
  const texts = {
    q1: ["The room was far too loud and I could not hear anyone.", "Too loud at the start, hard to talk.", "Loud music made introductions difficult.", "More time at the start for introductions please.", "The room was so loud, introductions were hard.", "Great mix of people and a friendly welcome."],
    q2: ["Loved the speakers.", "Speakers were excellent.", "Brilliant speakers", "Great talks", "Fantastic talks"],
    q3: ["only two answers here that must never be quoted", "Another short answer, never quoted"],
  };
  const answers = []; const people = new Map(); const labels = new Map([["q1", "One thing to improve"], ["q2", "What went well"]]);
  let n = 0;
  for (const [qid, list] of Object.entries(texts)) list.forEach((t, i) => { n += 1; const id = `a${n}`; answers.push({ id, qid, text: t }); people.set(id, `p${qid === "q3" ? 20 + i : i}`); });
  // q3 answers are not sent (fewer than 5), so they are not in `answers` for the model; tests below try to quote them anyway.
  const sent = answers.filter((a) => a.qid !== "q3");
  const ids = (q) => sent.filter((a) => a.qid === q).map((a) => a.id);
  const refine = (value, extra = {}) => refineSummary({ answers: sent, people, labels, isName: nameMatcher(["Priya Natarajan"]), ...extra })(value);
  const good = { paragraph: "People enjoyed the speakers. Some found the room too loud. A few asked for more time at the start.", worked: [{ text: "The speakers were liked.", answers: ids("q2") }], change: [{ text: "The room was too loud", answers: ids("q1").slice(0, 5) }], quotes: ["The room was far too loud", "Great mix of people and a friendly welcome."] };
  const out = refine(good);
  check("a good reply passes, with the count worked out by code (5 different people, not the model's word)", out && out.worked[0].count === 5 && out.change[0].count === 5, out);
  check("the point text has no trailing full stop and the paragraph is kept", out.worked[0].text === "The speakers were liked" && /^People enjoyed the speakers\./.test(out.paragraph));
  check("a quote is kept when it is an exact piece of a real answer, and carries its question's wording", out.quotes.length === 2 && out.quotes[0].text === "The room was far too loud" && out.quotes[0].question === "One thing to improve", out.quotes);
  check("the model's own counts are ignored: extra fields are not read", !("count" in good.worked[0]) && refine({ ...good, worked: [{ text: "Liked", answers: ids("q2"), count: 99, approx: 99 }] }).worked[0].count === 5);
  check("ids the model invented, or repeated, add nothing to the count", refine({ ...good, worked: [{ text: "The speakers were liked", answers: [...ids("q2"), "a999", "p1", ids("q2")[0], ids("q2")[0]] }] }).worked[0].count === 5);
  check("a point resting on fewer than 3 people is dropped", refine({ ...good, worked: [{ text: "The speakers were liked", answers: ids("q2").slice(0, 2) }] }).worked.length === 0 && MIN_THEME === 3);
  const sameman = new Map(people); for (const id of ids("q2")) sameman.set(id, "one-person");
  check("a point whose answers all came from one person counts as one person and is dropped", refine(good, { people: sameman }).worked.length === 0);
  check("a point with a number, a count word, a single person or a name in it is dropped", refine({ ...good, change: [{ text: "12 people said it was loud", answers: ids("q1") }, { text: "Most people said it was loud", answers: ids("q1") }, { text: "Someone said it was loud", answers: ids("q1") }, { text: "Priya played it too loud", answers: ids("q1") }, { text: "The room was too loud", answers: ids("q1") }] }).change.map((p) => p.text).join() === "The room was too loud");
  check("at most 4 points each, the best supported first, no repeats", (() => { const many = Array.from({ length: 8 }, (_, i) => ({ text: `Point ${"abcdefgh"[i]} here`, answers: ids("q1").slice(0, 3 + (i % 3)) })); many.push({ text: "point a here", answers: ids("q1") }); const r = refine({ ...good, worked: many }); return r.worked.length === MAX_POINTS && r.worked[0].count >= r.worked[1].count && new Set(r.worked.map((p) => p.text.toLowerCase())).size === MAX_POINTS; })());
  check("an invented, paraphrased or spliced quote is dropped", refine({ ...good, quotes: ["The event was perfect and everyone loved it", "The room was too loud and I could not hear", "far too loud. Too loud at the start", "Loved speakers"] }).quotes.length === 0);
  check("a quote from a question that fewer than 5 people answered is dropped (it was never sent, and the check holds anyway)", refine({ ...good, quotes: ["only two answers here that must never be quoted"] }).quotes.length === 0);
  check("a quote that is not at least 12 characters is dropped", refine({ ...good, quotes: ["loud", "Great talks"] }).quotes.length === 0);
  check("a quote holding a marker or a name is dropped", (() => {
    const withName = [...sent, { id: "a900", qid: "q1", text: "[name] was rude and the room was loud." }];
    const r = refineSummary({ answers: withName, people: new Map([...people, ["a900", "p900"]]), labels, isName: nameMatcher(["Priya Natarajan"]) })({ ...good, quotes: ["[name] was rude and the room", "was rude and the room was loud."] });
    const r2 = refine({ ...good, quotes: ["Priya Natarajan"] });
    return r.quotes.length === 0 && r2.quotes.length === 0;
  })());
  check("at most 4 quotes, each once", (() => { const q = sent.map((a) => a.text).filter((t) => t.length >= 12); return refine({ ...good, quotes: [...q, ...q] }).quotes.length <= MAX_QUOTES; })());
  check("a reply with nothing usable is thrown away (null)", refine({ paragraph: "12 people. Most agreed.", worked: [], change: [], quotes: ["nothing real here at all"] }) === null && refine("text") === null && refine(null) === null);
  check("a paragraph that is all digits and count words, with a good quote, still passes with an empty paragraph", (() => { const r = refine({ paragraph: "Most people (80%) agreed.", worked: [], change: [], quotes: ["Great mix of people and a friendly welcome."] }); return r && r.paragraph === "" && r.quotes.length === 1; })());
  check("exactQuotes itself: a quote must be inside one real answer", exactQuotes(["too loud", "too  loud", "nowhere"], ["It was too loud"], { min: 4 }).join() === "too loud");
}

console.log("\n# F23.1 The schema");
{
  const ok = { paragraph: "x", worked: [], change: [], quotes: [] };
  check("the schema asks for a paragraph, worked, change and quotes", Object.keys(SUMMARY_SCHEMA.props).join() === "paragraph,worked,change,quotes" && SUMMARY_SCHEMA.required.length === 4 && !!ok);
}

console.log("\n# F23.1 Source guards");
{
  const prompt = read("worker/ai/prompts/feedbackSummary.js");
  check("the prompt file calls no model and reads no database", !/fetch\(|prepare\(|from "\.\.\/client\.js"|from "\.\.\/\.\.\/db\.js"/.test(prompt));
  check("redaction reads no database and sends nothing", !/fetch\(|prepare\(|client\.js|db\.js/.test(read("worker/ai/redact.js")));
  check("nothing public or shared imports the new files", ["src/lib/api.js", "src/lib/store.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/components/CardView.vue", "src/main.js"].every((f) => !/feedbackSummary|FeedbackSummary|redact/.test(read(f))));
}

globalThis.fetch = realFetch;
summary();
