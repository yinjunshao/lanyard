// F67: the check-in page layout. The page (src/components/EventPage.vue, drawn by the real page and the host's preview) is three
// panels, About you, At this event and Sharing, each there only when it has something, with one gap between panels and one gap
// between rows, every tick a full-width row at least 44 px tall, and no inline style. It changes the layout only: every notice
// word, every pre-tick and the F51 consent line are as they were, and each is pinned again here. Rendered on the server (Vue SSR
// through Vite, no browser); the measured look is checked in a browser and logged in the plan note.
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { check, summary } from "./harness.mjs";
import { SUGGEST_NOTICE, SUGGEST_DETAIL, INTENTION_LABEL } from "../src/lib/suggest.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vite = await createServer({ configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom", server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } });
const EventPage = (await vite.ssrLoadModule("/src/components/EventPage.vue")).default;
async function render(props) {
  const app = createSSRApp({ render: () => h(EventPage, props) });
  app.component("router-link", { props: ["to"], render() { return h("a", { href: this.to }, this.$slots.default?.()); } });
  return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, "").replace(/>\s+</g, "><").replace(/\s+/g, " ").replace(/ data-v-[0-9a-f]+/g, "").replace(/&#39;/g, "'");
}
const form = (extra = {}) => ({ name: "", answers: {}, sponsorConsent: {}, directoryConsent: false, ...extra });
const WORDS = {
  items: [{ key: "attendance", label: "Your name and when you checked in" }, { key: "email", label: "Your verified email" }, { key: "card", label: "Your card" }],
  organiser: "Quad Events", why: "To thank people who came.",
};
const base = { name: "Spring night", venue: "Hall 1", startsAt: Date.UTC(2026, 10, 20, 18, 0), info: { food: "Pizza", foodOn: true, diet: ["vegan"] }, questions: [{ key: "extra1", label: "Course" }], directoryOn: true, feedbackOn: true };
const sponsors = [{ id: "s1", name: "Acme", perk: "Free pens" }, { id: "s2", name: "Beta" }];
const everything = { event: { ...base, collects: WORDS }, form: form({ answers: { extra1: "" } }), sponsors, showName: true, needsAgree: true };
const nothing = { event: { name: "Quiet", questions: [], directoryOn: false, feedbackOn: false, info: {}, suggestOn: false }, form: form() };
const at = (html, s) => html.indexOf(s);
const inputs = (html) => [...html.matchAll(/<input\b[^>]*>/g)].map((m) => m[0]);
const src = read("src/components/EventPage.vue");
const css = src.slice(src.indexOf("<style scoped>"));
const main = read("src/styles/main.css");

console.log("\n# F67 The panels, in order, each only when it has something");
{
  const full = await render(everything);
  const order = ["Event check-in", "Checking in unlocks perks", "Food and drink", "About you", "Your name", "Course", "At this event", "Show me in this event's attendee room", "Who to meet", INTENTION_LABEL, "Suggest me to people here", "Sharing", "Sponsors", "Acme", "This event collects details", "I agree to share", "anonymous feedback", ">Check in<"];
  const idx = order.map((w) => at(full, w));
  check("with everything on the page reads: head, notice, info, About you, At this event, Sharing, the line, Check in, in that order", idx.every((i, n) => i >= 0 && (n === 0 || i > idx[n - 1])), idx);
  check("the three panel headings are About you, At this event and Sharing, each one once and each a heading", ["ci-about", "ci-event", "ci-share"].every((id) => new RegExp(`<section[^>]*aria-labelledby="${id}"`).test(full) && new RegExp(`<h2 id="${id}" class="label">`).test(full)) && (full.match(/<h2\b/g) || []).length === 3);
  const sec = (name) => full.slice(at(full, `<section class="panel checkin-panel" aria-labelledby="${name}"`)).split("</section>")[0];
  check("About you holds the name and the host's questions and nothing else to tick", /id="name"/.test(sec("ci-about")) && /id="extra1"/.test(sec("ci-about")) && !/type="checkbox"/.test(sec("ci-about")));
  check("At this event holds the attendee room tick and Who to meet (the intention and Suggest me)", /attendee room/.test(sec("ci-event")) && /id="ev-intention"/.test(sec("ci-event")) && /data-suggest-me/.test(sec("ci-event")) && !/Sponsors|collects/.test(sec("ci-event")));
  check("Sharing holds the sponsors and This event collects, and not the name or the room", /Acme/.test(sec("ci-share")) && /data-collects/.test(sec("ci-share")) && !/id="name"|attendee room/.test(sec("ci-share")));
  check("the notice is under the head and above the info list, the line is above Check in", at(full, 'class="notice"') > at(full, "Spring night") && at(full, 'class="notice"') < at(full, "event-info") && at(full, "anonymous feedback") < at(full, 'class="thumb-bar"'));

  const panelsOf = async (props) => (await render(props)).match(/<section class="panel checkin-panel"/g)?.length || 0;
  const names = async (props) => [...(await render(props)).matchAll(/<h2 id="ci-(about|event|share)"/g)].map((m) => m[1]).join();
  check("an event with nothing extra has no panel at all (suggestions off, no questions, no room, no sponsors, nothing collected)", (await panelsOf(nothing)) === 0);
  check("with only suggestions on (the usual) there is one panel, At this event", (await names({ event: { ...nothing.event, suggestOn: undefined }, form: form() })) === "event");
  check("with only questions: About you; with only the name for a guest: About you", (await names({ event: { ...nothing.event, questions: base.questions }, form: form({ answers: { extra1: "" } }) })) === "about" && (await names({ ...nothing, showName: true })) === "about");
  check("with only the attendee room: At this event; with only sponsors: Sharing; with only collects: Sharing", (await names({ event: { ...nothing.event, directoryOn: true }, form: form() })) === "event" && (await names({ ...nothing, sponsors })) === "share" && (await names({ event: { ...nothing.event, collects: WORDS }, form: form() })) === "share");
  check("a panel with nothing to show is left out, not drawn empty", (await names({ event: { ...base, suggestOn: false, directoryOn: false }, form: form({ answers: { extra1: "" } }) })) === "about");
  check("the empty Sharing panel never shows for an event with collects off and no sponsors", !(await render({ event: { ...base }, form: form({ answers: { extra1: "" } }) })).includes("Sharing"));
}

console.log("\n# F67 What starts ticked has not changed");
{
  const full = await render(everything);
  const ticked = (t) => /\schecked(\s|=|>)/.test(t);
  const sp = inputs(full).filter((t) => /type="checkbox"/.test(t) && !/data-suggest-me|data-item|attendee/.test(t));
  check("sponsors are never pre-ticked: both sponsor ticks start unticked, and the page says so", sp.length === 3 && sp.slice(1).every((t) => !ticked(t)) && full.includes("Each sponsor is a separate, optional choice. Never pre-ticked."), sp);
  check("Suggest me starts ticked (D054)", ticked(inputs(full).find((t) => /data-suggest-me/.test(t))));
  check("This event collects starts ticked (D038)", ticked(inputs(full).find((t) => /data-item="all"/.test(t))));
  check("the attendee room tick starts unticked", !ticked(inputs(full).find((t) => /type="checkbox"/.test(t))));
  check("no text field starts with a value", inputs(full).filter((t) => /type="text"/.test(t)).every((t) => !/\svalue="[^"]/.test(t)));
}

console.log("\n# F67 Every word of every notice is unchanged");
{
  const full = await render(everything);
  const plain = await render({ event: { ...base, info: {} }, form: form({ answers: { extra1: "" } }) });
  check("the notice", full.includes("Checking in unlocks perks and the event album. If you choose to, you can also appear in the attendee room. The organisers see only what you leave ticked below, and never who you connect with.") && plain.includes("Checking in unlocks perks and the event album. If you choose to, you can also appear in the attendee room. Hosts see aggregate numbers only — never who connected with whom."));
  check("the line above Check in", full.includes("The organisers never see who you connect with. After the event you'll be asked for quick, anonymous feedback.") && plain.includes("The organiser only sees anonymous totals, never who you connect with. After the event you'll be asked for quick, anonymous feedback."));
  check("the attendee room tick", full.includes("Show me in this event's attendee room to other checked-in people."));
  check("the sponsor tick words and the sponsor small print", full.includes("Share my name, course and tags with <strong>Acme</strong>") && full.includes("— Free pens") && full.includes("Each sponsor is a separate, optional choice. Never pre-ticked."));
  const [head, ...rest] = SUGGEST_NOTICE.split(". ");
  check("Suggest me: the label, the tick's words (the exact recorded notice) and the small print", full.includes(`<strong>${head}.</strong> ${rest.join(". ")}`) && full.includes(SUGGEST_DETAIL) && full.includes(INTENTION_LABEL + " <span class=\"muted\">(optional)</span>"));
  check("This event collects: the tick, its optional line and the dialog's words", full.includes("I agree to share my name, check-in time, email and card with <strong>Quad Events</strong>.") && full.includes("Optional: untick it and you can still check in. Change your mind any time on this event's page.") && full.includes("What Quad Events collects") && full.includes("Organisers never see who you connect with. Lanyard deletes the list 12 months after the event. See the") && full.includes("<span class=\"muted\">Why:</span> To thank people who came.") && full.includes(">Got it<"));
  check("the F51 consent line is the same words, in the bar right above the Check in button, and only when the Terms are needed", full.includes(`<p class="consent-line"> By pressing Check in, you confirm you're 18 or over and agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>. </p><button class="btn btn-primary">Check in</button>`) && /<div class="thumb-bar"><div class="inner"><p class="consent-line">/.test(full) && !(await render({ ...everything, needsAgree: false })).includes("consent-line") && !/type="checkbox"[^>]*>[^<]*<span[^>]*>\s*I'm 18/.test(full));
  check("the labels: Your name, the questions, Event check-in and the Check in button", full.includes(">Your name<") && full.includes(">Course<") && full.includes("Event check-in") && (await render({ ...everything, busy: true })).includes("Checking in…"));
  check("an error still shows, above the bar", (await render({ ...everything, error: "Oops" })).indexOf("Oops") < (await render({ ...everything, error: "Oops" })).indexOf("thumb-bar") && (await render({ ...everything, error: "Oops" })).includes('role="alert"'));
}

console.log("\n# F67 One rhythm in the styles: no inline style, one gap between panels, one between rows, 44 px ticks");
{
  const tpl = src.slice(src.indexOf("<template>"), src.indexOf("</template>\n\n<style"));
  check("no inline style= is left in EventPage.vue", !/\sstyle="/.test(src), src.match(/\sstyle="[^"]*"/g));
  check("the only :style is the host's own strap colour and the ink on it (F65), two values only the host knows, set as custom properties", (src.match(/:style=/g) || []).length === 1 && /:style="\{ '--card-strap': event\.strapColor, '--card-strap-ink': event\.strapInk \}"/.test(src));
  check("an event with no theme and no colour draws no style attribute at all", !/style=/.test(await render(everything)));
  check("the old stack and margin helpers are gone from the page (the page spaces itself)", !/stack-[23]|margin:\s*\d/.test(tpl));
  check("one token for the gap between panels and one for the gap between rows, each set once", (css.match(/--panel-gap:\s*\d+px/g) || []).length === 1 && (css.match(/--row-gap:\s*\d+px/g) || []).length === 1);
  check("the page is one column with the panel gap; a panel and a group put the row gap between their rows", /\.checkin \{[^}]*display: flex; flex-direction: column; gap: var\(--panel-gap\)/.test(css) && /\.checkin-panel, \.checkin-group \{[^}]*gap: var\(--row-gap\)/.test(css));
  check("a field inside a panel has no margin of its own, so the row gap is the only gap", /\.checkin-panel \.field \{ margin: 0; \}/.test(css) && /\.checkin > \.page-head \{ margin: 0; \}/.test(css));
  const tap = +/--tap:\s*(\d+)px/.exec(main)[1];
  check("every tick row is a full-width row at least 44 px tall: one rule gives the tick rows and the collects row the same width and the --tap height", tap >= 44 && /\.tick-row, \.collect-row \{[^}]*width: 100%; min-height: var\(--tap\)/.test(css), tap);
  check("every tick in the template is in such a row: each checkbox label is a tick-row, or the collects tick inside the collects row", (tpl.match(/<label[^>]*class="checkbox-row[^"]*"/g) || []).every((l) => /tick-row|collect-tick/.test(l)) && (tpl.match(/<label[^>]*class="checkbox-row/g) || []).length === 4 && /<div class="collect-row">\s*<label class="checkbox-row collect-tick">/.test(tpl));
  check("the info button inside the collects row is 44 px square, so the row never grows because of it", /\.collect-info \{[^}]*width: 44px; height: 44px/.test(css));
  const full = await render(everything);
  const rows = (full.match(/class="checkbox-row tick-row"/g) || []).length + (full.match(/class="collect-row"/g) || []).length;
  check("with everything on the page draws five tick rows: the room, Suggest me, two sponsors and the collects tick", rows === 5, rows);
  check("the host's preview and the real page still draw the same component", /<EventPage\b/.test(read("src/views/EventJoin.vue")) && /<EventPage\b/.test(read("src/components/EventPreview.vue")));
  check("no new script: the page gained no timer, no listener and no import for the layout", !/setTimeout|addEventListener|ResizeObserver/.test(src) && (src.match(/^import /gm) || []).length === 5);
}
await vite.close();
summary();
