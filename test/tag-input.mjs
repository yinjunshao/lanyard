// F53: tag boxes and new suggestions. Run: node test/tag-input.mjs
// The rules (add on Enter or comma, paste splits, repeats ignored ignoring case, Backspace twice removes, the
// count and length limits), the real UiTagInput, TagFields, CardForm and StepFor drawn on the server (Vue SSR
// through Vite, no browser) with their own handlers called as the keys would call them, and the request each
// form sends, checked against the real Worker on in-memory SQLite. The look and the keyboard are checked in a
// browser (see the F53 plan note).
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h, reactive } from "vue";
import { routerKey, routeLocationKey } from "vue-router";
import { makeEnv, check, summary } from "./harness.mjs";
import { addTags, parseTags, joinTags, hasTag, removeTagAt, suggestionsFor, SUGGESTED_TAGS, PROFILE_TAGS, CARD_TAGS } from "../src/lib/tags.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# The rules (src/lib/tags.js)");
{
  const o = { max: 12, maxLength: 24 };
  check("Investing adds one tag", JSON.stringify(addTags([], "Investing", o).tags) === '["Investing"]');
  check("the text is trimmed and inner runs of spaces become one", JSON.stringify(addTags([], "  CV   reviews  ", o).tags) === '["CV reviews"]');
  check("an empty or blank piece adds nothing", addTags(["a"], "   ", o).added === 0 && addTags(["a"], ",,", o).added === 0);
  check("pasting 'Design, Finance, Design' makes two tags", JSON.stringify(addTags([], "Design, Finance, Design", o).tags) === '["Design","Finance"]');
  check("pasted lines split too", JSON.stringify(addTags([], "a\nb\r\nc", o).tags) === '["a","b","c"]');
  check("a repeat is ignored ignoring case, and the first spelling stays", JSON.stringify(addTags(["Investing"], "investing, INVESTING, Law", o).tags) === '["Investing","Law"]');
  check("a tag is cut to the length limit (24) and trimmed again", addTags([], "x".repeat(40), o).tags[0] === "x".repeat(24) && addTags([], "ab" + " ".repeat(30) + "cd", { max: 5, maxLength: 3 }).tags[0] === "ab");
  const full = addTags([], Array.from({ length: 15 }, (_, i) => "t" + i).join(","), o);
  check("it stops at the maximum count (12) and says something was left out", full.tags.length === 12 && full.added === 12 && full.full === true);
  const at12 = addTags(full.tags, "more", o);
  check("a further tag at the maximum adds nothing", at12.added === 0 && at12.tags.length === 12 && at12.full === true);
  check("a repeat at the maximum is not reported as full (nothing was lost)", addTags(full.tags, "T0", o).full === false);
  check("the app's limits are the ones it always sent: 12 of 24 on a profile, 30 of 24 on a card (the Worker allows 30 of 60)", PROFILE_TAGS.max === 12 && PROFILE_TAGS.maxLength === 24 && CARD_TAGS.max === 30 && CARD_TAGS.maxLength === 24);
  check("the text form round-trips: parse drops empties, join uses comma and space", JSON.stringify(parseTags("a, b ,, c")) === '["a","b","c"]' && joinTags(["a", "b"]) === "a, b" && parseTags("").length === 0 && parseTags(undefined).length === 0);
  check("hasTag ignores case and removeTagAt takes one out", hasTag(["Law"], "law") && !hasTag(["Law"], "lawn") && JSON.stringify(removeTagAt(["a", "b", "c"], 1)) === '["a","c"]');
}

console.log("\n# The suggestions");
{
  const student = suggestionsFor("student"), career = suggestionsFor("career");
  check("Student mode has exactly the five student suggestions", JSON.stringify(student) === JSON.stringify(["Internships", "Career advice", "Study groups", "Investing", "Side projects"]));
  check("Career mode has exactly the five career suggestions", JSON.stringify(career) === JSON.stringify(["Hiring", "Mentoring", "Industry advice", "Finance", "Partnerships"]));
  check("no mode but career gets the career list (anything else is Student)", suggestionsFor(undefined) === student && suggestionsFor("x") === student);
  check("none says hackathons, and each fits the tag length", [...student, ...career].every((t) => !/hackathon/i.test(t) && t.length <= PROFILE_TAGS.maxLength));
  check("five a mode, no repeats inside a mode", student.length === 5 && career.length === 5 && new Set(student).size === 5 && new Set(career).size === 5 && Object.keys(SUGGESTED_TAGS).join() === "student,career");
  check("the old hackathon-led list is gone from the source", !/hackathons|"CV reviews", "internships"|finding a team/.test(read("src/components/TagFields.vue") + read("src/lib/tags.js")));
}

// ---- the real components, drawn on the server ----
globalThis.location = new URL("https://lanyard.test/app");
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.document ??= { body: { style: {} }, title: "", addEventListener() {}, removeEventListener() {} };
const T = await makeEnv();
let as = null;
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (path, init = {}) => {
  if (typeof path !== "string" || !path.startsWith("/api/")) return realFetch(path, init);
  const method = init.method || "GET", body = init.body ? JSON.parse(init.body) : undefined;
  sent.push({ method, path, body });
  const r = await as.req(method, path, body);
  return new Response(r.text, { status: r.status, headers: { "content-type": "application/json" } });
};
const vite = await createServer({
  configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
});
const load = async (p) => (await vite.ssrLoadModule("/" + p)).default;
const { me } = await vite.ssrLoadModule("/src/lib/store.js");
const router = { push() {}, replace() {} };
async function draw(comp, props = {}, { before } = {}) {
  let state, exposed;
  const Wrapped = { ...comp, ssrRender(ctx, push, parent, attrs, $props, $setup, ...rest) {
    state = $setup; exposed = ctx.$.exposed; before?.($setup);
    return comp.ssrRender(ctx, push, parent, attrs, $props, $setup, ...rest);
  } };
  const app = createSSRApp({ render: () => h(Wrapped, props) });
  app.component("router-link", { props: ["to"], render() { return h("a", { href: this.to }, this.$slots.default?.()); } });
  app.provide(routerKey, router);
  app.provide(routeLocationKey, reactive({ query: {}, params: {}, path: "/", fullPath: "/" }));
  const html = (await renderToString(app, {})).replace(/ data-v-[0-9a-f]+/g, "").replace(/<!--[\s\S]*?-->/g, "");
  return { html, state, exposed };
}
const key = (k, extra = {}) => ({ key: k, shiftKey: false, isComposing: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra });
const typed = (v) => ({ target: { value: v } });
const paste = (s) => ({ clipboardData: { getData: () => s }, target: { value: "" }, prevented: false, preventDefault() { this.prevented = true; } });
const boxes = (html) => [...html.matchAll(/<span class="(?:sel )?tag-box"><span class="tag-text">([^<]*)<\/span><button/g)].map((m) => m[1]);

console.log("\n# UiTagInput: the keys");
const Tag = await load("src/components/ui/UiTagInput.vue");
{
  const updates = [];
  const { html, state } = await draw(Tag, { "onUpdate:modelValue": (v) => updates.push(v) });
  check("empty, it shows no box and the placeholder 'Type a topic and press Enter' (no examples in it)", boxes(html).length === 0 && /placeholder="Type a topic and press Enter"/.test(html));
  state.text = "Investing";
  const enter = key("Enter");
  state.onKeydown(enter);
  check("typing Investing then Enter makes one box and clears the input", JSON.stringify(state.tags) === '["Investing"]' && state.text === "");
  check("Enter is always prevented, so the surrounding form is not submitted (with text and with none)", enter.prevented === true && (() => { const e = key("Enter"); state.onKeydown(e); return e.prevented; })());
  check("the model was told (an update with the one tag)", updates.at(-1)?.join() === "Investing");
  state.onKeydown(key("Enter"));
  check("Enter on an empty input adds nothing", state.tags.length === 1);
  state.onInput(typed("Law,"));
  check("typing a comma makes a box from what came before it and clears the input", JSON.stringify(state.tags) === '["Investing","Law"]' && state.text === "");
  state.onInput(typed("De"));
  check("ordinary typing only fills the input", state.text === "De" && state.tags.length === 2);
  const tab = key("Tab"); state.onKeydown(tab);
  check("Tab with text makes it a box (and stays in the field for the next one)", state.tags.join() === "Investing,Law,De" && tab.prevented === true);
  const tab2 = key("Tab"); state.onKeydown(tab2);
  check("Tab with nothing typed moves on as usual", tab2.prevented === false);
  state.text = "investing"; state.onKeydown(key("Enter"));
  check("a repeat is ignored ignoring case, and the input is cleared", state.tags.join() === "Investing,Law,De" && state.text === "");
  const p = paste("Design, Finance, Design");
  state.onPaste(p);
  check("pasting 'Design, Finance, Design' makes two boxes", p.prevented === true && state.tags.join() === "Investing,Law,De,Design,Finance");
  const plain = paste("one piece"); state.onPaste(plain);
  check("pasting one piece without a comma is left to the browser", plain.prevented === false && state.tags.length === 5);
  const bs1 = key("Backspace"); state.onKeydown(bs1);
  check("Backspace on an empty input only highlights the last box first", state.selected === true && state.tags.length === 5 && bs1.prevented === true);
  state.onKeydown(key("a"));
  check("typing anything else lets go of the highlight", state.selected === false);
  state.onKeydown(key("Backspace")); state.onKeydown(key("Backspace"));
  check("a second Backspace removes the last box", state.tags.join() === "Investing,Law,De,Design" && state.selected === false && state.ghosts.length === 1);
  state.text = "x"; const bs3 = key("Backspace"); state.onKeydown(bs3);
  check("Backspace with text typed edits the text, never a box", state.tags.length === 4 && bs3.prevented === false);
  state.text = "";
  state.remove(0);
  check("the remove button on a box takes out that box (the first)", state.tags.join() === "Law,De,Design");
  const compose = key("Enter", { isComposing: true }); state.text = "ab"; state.onKeydown(compose);
  check("Enter while an input method is composing is left alone", state.tags.length === 3 && state.text === "ab" && compose.prevented === false);
  state.text = "";
  state.onBlur(); state.text = "Pending"; state.onBlur();
  check("leaving the field with text typed makes it a box, so Save never loses it", state.tags.at(-1) === "Pending" && state.text === "");
}
{
  const { state } = await draw(Tag, { max: 3 }, { before: (s) => { s.tags = ["a", "b", "c"]; } });
  state.text = "d"; const e = key("Enter"); state.onKeydown(e);
  check("at the maximum, a further Enter adds nothing, keeps what was typed and is still prevented", state.tags.length === 3 && state.text === "d" && e.prevented === true);
  state.onInput(typed("e,"));
  check("...a comma adds nothing either", state.tags.length === 3);
  const { html } = await draw(Tag, { max: 3 }, { before: (s) => { s.tags = ["a", "b", "c"]; } });
  check("a muted line says the limit, as a status", /<span class="small muted tag-limit" role="status">That&#39;s the most you can add \(3\)\. Remove one to add another\.<\/span>/.test(html), html.match(/tag-limit[^<]*<?[^<]*/)?.[0]);
  const { html: under } = await draw(Tag, { max: 3 }, { before: (s) => { s.tags = ["a", "b"]; } });
  check("below the maximum the line is not shown", !/tag-limit/.test(under));
  const { state: s2 } = await draw(Tag, { max: 12, maxLength: 5 });
  s2.text = "abcdefghij"; s2.onKeydown(key("Enter"));
  check("a box is cut to the length limit", s2.tags[0] === "abcde");
  const { html: h2 } = await draw(Tag, { max: 12, maxLength: 5 });
  check("the input itself stops at the length limit (maxlength)", /maxlength="5"/.test(h2));
}

{
  // A parent only hands the new list back when it next draws, so fast typing must not lose boxes made in the same moment.
  const seen = [];
  const { state } = await draw(Tag, { modelValue: [], "onUpdate:modelValue": (v) => seen.push(v) });
  for (const t of ["a1,", "a2,", "a3,", "a4,"]) state.onInput(typed(t));
  state.text = "a5"; state.onKeydown(key("Enter"));
  check("boxes made one straight after another all stay, though the parent has not drawn again (fast typing, a paste)", state.tags.join() === "a1,a2,a3,a4,a5" && seen.at(-1).join() === "a1,a2,a3,a4,a5", state.tags);
}

console.log("\n# UiTagInput: what is on the page");
{
  const { html } = await draw(Tag, { id: "tags" }, { before: (s) => { s.tags = ["Investing", "Law & policy"]; } });
  check("each box has a remove button named 'Remove <tag>' (escaped)", /aria-label="Remove Investing"/.test(html) && /aria-label="Remove Law &amp; policy"/.test(html));
  check("the buttons are type=button (they never submit a form)", (html.match(/<button /g) || []).length === 2 && (html.match(/<button type="button" class="tag-x"/g) || []).length === 2);
  check("the boxes read in order, the field is last and carries the id the label points at", boxes(html).join("|") === "Investing|Law &amp; policy" && /<input id="tags"[^>]*class="tag-field"/.test(html) && html.lastIndexOf("<input") > html.lastIndexOf("</button>"));
  check("with boxes the field's hint is the short 'Add another'", /placeholder="Add another"/.test(html));
  const { html: sel } = await draw(Tag, {}, { before: (s) => { s.tags = ["a", "b"]; s.selected = true; } });
  check("the highlighted box is the last one only", (sel.match(/class="sel tag-box"/g) || []).length === 1 && /class="sel tag-box"><span class="tag-text">b<\/span>/.test(sel), sel);
  check("a polite status line tells a screen reader which box is highlighted and what Backspace does", /role="status">b is highlighted\. Press Backspace again to remove it\.<\/span>/.test(sel));
  check("the field takes the enter key hint and no autocomplete", /enterkeyhint="enter"/.test(html) && /autocomplete="off"/.test(html));
  const src = read("src/components/ui/UiTagInput.vue");
  check("a click on the box (not on a button) focuses the field", /function focusInput\(e\) \{ if \(!e\.target\.closest\?\.\("button"\)\) input\.value\?\.focus/.test(src) && /@click="focusInput"/.test(src));
  check("after a box is removed focus goes back to the field (the button it had is gone)", /nextTick\(\(\) => input\.value\?\.focus/.test(src));
}

console.log("\n# Motion and the source rules");
{
  const src = read("src/components/ui/UiTagInput.vue"), css = read("src/styles/main.css");
  check("a new box eases in with the pop token (and boxes there at the start do not)", /\.tag-input\.ready \.tag-box \{ animation: m-pop-in var\(--dur-fast\) var\(--ease-out\) backwards; \}/.test(css) && /onMounted\(\(\) => \{ ready\.value = true; \}\)/.test(src));
  check("a removed box fades out where it was, takes no clicks, and is gone after 140 ms (the --dur-out token)", /\.tag-gone \{ animation: m-fade-out var\(--dur-out\) var\(--ease-in\) forwards; pointer-events: none/.test(css) && /\}, 140\)/.test(src));
  check("a removed box is not read out (aria-hidden)", /class="tag-box tag-gone" aria-hidden="true"/.test(src));
  check("no Vue Transition, no library", !/<Transition|<TransitionGroup/.test(src) && [...src.matchAll(/^import .* from "([^"]+)"/gm)].every((m) => m[1] === "vue" || m[1] === "../../lib/tags"));
  check("the tag field's focus ring is on the whole box (focus-within), not lost", /\.tag-input:focus-within \{ outline: 2\.5px solid var\(--strap\)/.test(css));
  check("a box's remove button is at least 28 px square", /\.tag-x \{[^}]*min-width: 28px; min-height: 28px/.test(css));
  const PUBLIC = ["Landing", "PublicCard", "Hosts", "Privacy", "Terms", "Redeem", "SignIn", "PrivacyRequest", "EventJoin"];
  check("no public page imports the tag input, the tag rules, or TagFields or CardForm", PUBLIC.every((n) => !/UiTagInput|lib\/tags|TagFields|CardForm/.test(read(`src/views/${n}.vue`))));
}

console.log("\n# TagFields (Edit profile and welcome step 3)");
const TagFields = await load("src/components/TagFields.vue");
{
  const form = reactive({ mode: "student", tags: "" });
  const { html, state } = await draw(TagFields, { form });
  const chips = [...html.matchAll(/<button type="button" class="chip chip-toggle">\+ ([^<]*)<\/button>/g)].map((m) => m[1]);
  check("Student mode shows exactly the five student suggestions, in one group", chips.join("|") === "Internships|Career advice|Study groups|Investing|Side projects" && (html.match(/role="group"/g) || []).length === 1);
  check("the label is 'Come to me for' and points at the tag field", /<label for="tags">Come to me for<\/label>/.test(html) && /<input id="tags"/.test(html));
  check("none says hackathons", !/hackathon/i.test(html));
  state.add("Investing");
  check("tapping a suggestion adds a box (the form's text now holds it)", form.tags === "Investing");
  const again = await draw(TagFields, { form });
  const left = [...again.html.matchAll(/class="chip chip-toggle">\+ ([^<]*)</g)].map((m) => m[1]);
  check("an added suggestion disappears from the row, and its box is on the page", left.join("|") === "Internships|Career advice|Study groups|Side projects" && boxes(again.html).join() === "Investing");
  const career = await draw(TagFields, { form: reactive({ mode: "career", tags: "" }) });
  check("Career mode shows exactly the five career suggestions", [...career.html.matchAll(/class="chip chip-toggle">\+ ([^<]*)</g)].map((m) => m[1]).join("|") === "Hiring|Mentoring|Industry advice|Finance|Partnerships");
  check("the suggestion is hidden case-insensitively (a typed 'finance' hides Finance)", !/\+ Finance</.test((await draw(TagFields, { form: reactive({ mode: "career", tags: "finance" }) })).html));
  const f12 = reactive({ mode: "student", tags: Array.from({ length: 12 }, (_, i) => "t" + i).join(", ") });
  const atMax = await draw(TagFields, { form: f12 });
  check("at 12 tags the suggestions are hidden and the limit line shows", !/chip chip-toggle/.test(atMax.html) && /most you can add \(12\)/.test(atMax.html));
  state.add("Side projects"); state.add("side projects");
  check("a suggestion tapped twice makes one box", form.tags === "Investing, Side projects");
  check("the help line says to press Enter", /Press Enter after each one\./.test(html) && !/comma/i.test(html));
}

console.log("\n# What is saved does not change");
{
  const stepFor = read("src/components/welcome/StepFor.vue"), edit = read("src/views/EditProfile.vue"), cards = read("src/views/Cards.vue");
  const OLD_PROFILE = 'tags.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12)';
  check("welcome step 3 and Edit profile still build tags from the comma text, 24 characters, 12 tags", stepFor.includes("f.value." + OLD_PROFILE) && edit.includes("f.value." + OLD_PROFILE));
  check("Cards.vue still turns a card's tag text into a list with the same tagList (24 characters, 30 tags)", cards.includes('const tagList = (text) => text.split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 30);'));
  check("the text fields still hold tags as comma text (form.tags, f.tagsText), not arrays", /tags: \(p\.tags \|\| \[\]\)\.join\(", "\)/.test(stepFor) && /tags: \(p\.tags \|\| \[\]\)\.join\(", "\)/.test(edit) && /tagsText: \(card\.tagsOverride \|\| \[\]\)\.join\(", "\)/.test(cards));
  const owner = T.client({ ip: "10.53.0.1" });
  await owner.post("/api/profile", { name: "Tess Tagger", acceptTerms: true, over18: true, mode: "student" });
  as = owner;
  const profile = { name: "Tess Tagger", mode: "student", tags: ["old"], headline: "" };
  me.user = { id: "x" }; me.profile = profile; me.cards = [];
  const StepFor = await load("src/components/welcome/StepFor.vue");
  const s = await draw(StepFor);
  const f = s.state.f;
  check("step 3 starts from the saved tags as comma text", f.tags === "old" && f.mode === "student");
  const typedTags = ["Investing", "investing", "CV reviews", "Design, Finance", "Side projects"];
  let list = parseTags(f.tags);
  for (const t of typedTags) list = addTags(list, t, PROFILE_TAGS).tags;
  f.tags = joinTags(list);
  const before = sent.length;
  await s.exposed.save();
  const put = sent.slice(before).find((r) => r.method === "PUT" && r.path === "/api/profile");
  check("the request is PUT /api/profile with tags as an array of strings, as before", !!put && Array.isArray(put.body.tags) && put.body.tags.every((t) => typeof t === "string"), put?.body);
  check("...holding exactly the boxes, in order, with the repeat gone", JSON.stringify(put.body.tags) === JSON.stringify(["old", "Investing", "CV reviews", "Design", "Finance", "Side projects"]), put?.body.tags);
  check("the body has the same keys as before (tags, headline) and nothing new", Object.keys(put.body).sort().join() === "headline,tags", Object.keys(put.body));
  const stored = (await owner.get("/api/me")).json.profile.tags;
  check("the Worker stored the same tags", JSON.stringify(stored) === JSON.stringify(put.body.tags), stored);
  const oldWay = "old, Investing, CV reviews, Design, Finance, Side projects".split(",").map((x) => x.trim().slice(0, 24)).filter(Boolean).slice(0, 12);
  check("typing the same words as old comma text gives the identical array", JSON.stringify(oldWay) === JSON.stringify(put.body.tags));
  const CardForm = await load("src/components/CardForm.vue");
  const cf = reactive({ name: "Fair", theme: "default", note: "", headline: "", about: "", tagsText: "", visibleLinks: [], strapColor: "" });
  const c = await draw(CardForm, { modelValue: cf });
  c.state.cardTags = ["Law", "Policy"];
  check("a card's boxes are written into f.tagsText as comma text", cf.tagsText === "Law, Policy");
  c.state.cardTags = addTags(c.state.cardTags, "policy, Markets", CARD_TAGS).tags;
  const tagList = new Function("return " + /const tagList = (\(text\) => [^;]+);/.exec(cards)[1])();
  const cardBody = { name: "Fair", note: "", theme: "default", headline: "", about: "", visibleLinks: [], tags: tagList(cf.tagsText) };
  check("Cards.vue's own tagList turns the boxes into the array it has always sent", JSON.stringify(cardBody.tags) === '["Law","Policy","Markets"]', cardBody.tags);
  const post = await owner.post("/api/cards", cardBody);
  check("the card request still sends tags as an array of strings and the Worker takes it", post.status === 200 || post.status === 201, post.status + " " + post.text);
  const mine = (await owner.get("/api/me")).json.cards.find((x) => x.name === "Fair");
  check("...and stores Law, Policy, Markets", JSON.stringify(mine?.tagsOverride) === JSON.stringify(["Law", "Policy", "Markets"]), mine?.tagsOverride);
  const cfHtml = (await draw(CardForm, { modelValue: reactive({ name: "x", theme: "default", note: "", headline: "", about: "", tagsText: "Law, Policy", visibleLinks: [], strapColor: "" }) })).html;
  check("a card form shows its tags as boxes with remove buttons", boxes(cfHtml).join() === "Law,Policy" && /aria-label="Remove Policy"/.test(cfHtml));
  check("the card's label points at its tag field (an id from nextUid)", /<label for="ui\d+">Come to me for<\/label>/.test(cfHtml) && /<input id="ui\d+"/.test(cfHtml));
  me.profile = { ...profile, tags: ["Investing", "Law"] };
  const hint = (await draw(CardForm, { modelValue: reactive({ name: "x", theme: "default", note: "", headline: "", about: "", tagsText: "", visibleLinks: [], strapColor: "" }) })).html;
  check("an empty card says the profile's tags will show instead", /Empty: your profile&#39;s tags show instead \(Investing, Law\)\./.test(hint), hint.match(/Empty:[^<]*/)?.[0]);
  const tpl = (f) => read(f).slice(read(f).indexOf("<template>"));
  check("no 'comma' wording is left in what these forms show", ["src/components/CardForm.vue", "src/components/TagFields.vue", "src/components/welcome/StepFor.vue", "src/components/ui/UiTagInput.vue"].every((f) => !/comma/i.test(tpl(f))));
}

await vite.close();
summary();
