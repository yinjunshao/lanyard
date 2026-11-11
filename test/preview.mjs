// F18: live previews for cards and events. A preview must show exactly what the real page
// shows for the same data, so these tests render the real components on the server (Vue's
// SSR through Vite, no browser) and compare, rather than trusting the eye. Nothing here
// saves anything: previews only draw.
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

const vite = await createServer({
  configFile: "vite.config.js", root: process.cwd(), logLevel: "silent", appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true },
});
const load = async (p) => (await vite.ssrLoadModule("/" + p)).default;
async function render(comp, props) {
  const app = createSSRApp({ render: () => h(comp, props) });
  app.component("router-link", { props: ["to"], render() { return h("a", { href: this.to }, this.$slots.default?.()); } });
  return renderToString(app);
}
const form = (extra = {}) => ({ name: "", answers: {}, sponsorConsent: {}, directoryConsent: false, agreed: false, ...extra });

console.log("\n# F18.1 The check-in page is one component, drawn by the real page");
{
  const page = read("src/components/EventPage.vue"), join = read("src/views/EventJoin.vue");
  const code = page.slice(0, page.indexOf("<template>"));
  check("EventPage imports no store, API or router: it only draws what it is given", !/from "\.\.\/lib\/(store|api|hostapi)"|from "vue-router"|\bfetch\(|Api\./.test(code), code.match(/^import .*/gm));
  check("EventJoin draws the page through EventPage and keeps no copy of its markup", /<EventPage\b/.test(join) && !/Event check-in|page-head|Checking in unlocks/.test(join));
  check("EventJoin still fetches the event and checks in", /Api\.event\(/.test(join) && /Api\.checkIn\(/.test(join));

  const EventPage = await load("src/components/EventPage.vue");
  const ev = { name: "Spring night", venue: "Room 4", startsAt: Date.UTC(2026, 10, 20, 18, 0), info: { access: "Step-free", food: "Pizza" },
    questions: [{ key: "extra1", label: "Course" }], directoryOn: true, feedbackOn: true };
  const html = strip(await render(EventPage, { event: ev, form: form({ answers: { extra1: "" } }), sponsors: [{ id: "s1", name: "Acme", perk: "Free pens" }], showName: true, needsAgree: true }));
  check("it shows the name, venue, info, the host's question, a sponsor, the room tick, and the terms tick",
    ["Spring night", "Room 4 · ", "Access", "Step-free", "Food and drink", "Pizza", ">Course<", "<strong", "Free pens", "attendee room", "Your name", "Terms"].every((t) => html.includes(t)));
  check("the button says Check in and a busy page says Checking in…", html.includes(">Check in<") && (await render(EventPage, { event: ev, form: form(), busy: true })).includes("Checking in…"));
  const bare = strip(await render(EventPage, { event: { name: "Bare", questions: [], directoryOn: false, feedbackOn: false, info: {} }, form: form() }));
  check("empty fields leave nothing behind: no venue dot, no info panel, no room tick, no name box, no sponsors, no terms tick, no feedback line",
    !bare.includes(" · </span>") && !bare.includes("event-info") && !bare.includes("attendee room to other") && !bare.includes('id="name"') && !bare.includes("Sponsors") && !bare.includes("agree to the") && !bare.includes("anonymous feedback"), bare);
}

await vite.close();
summary();
