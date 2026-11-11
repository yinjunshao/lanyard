// F18: live previews for cards and events. A preview must show exactly what the real page
// shows for the same data, so these tests render the real components on the server (Vue's
// SSR through Vite, no browser) and compare, rather than trusting the eye. Nothing here
// saves anything: previews only draw.
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h } from "vue";
import { check, summary, makeEnv, becomeHost } from "./harness.mjs";
import { createBody, detailsBody, eventFromBody } from "../src/lib/eventform.js";

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

console.log("\n# F18.2 The host preview shows what the saved event will show");
const T = await makeEnv();
const host = T.client({ ip: "10.18.0.1", site: "host" });
const info = await becomeHost(host, { kind: "company", name: "Preview Co" });
T.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 80, 0, ?, ?)").run("cr-pv", info.org.json.id, "test", Date.now());
const main = T.client({ ip: "10.18.0.2" });
const blank = () => ({ from: "", name: "", venue: "", startsAt: null, endsAt: null, theme: "default", strapColor: "", perksText: "", directoryOn: true, q1: "", q2: "", rsvpCount: "", access: "", food: "", feedbackOn: true, feedbackQuestions: [] });
const long = (n, c = "x") => c.repeat(n);
const FORMS = {
  "everything filled in": { ...blank(), name: "Spring night", venue: "Room 4", startsAt: Date.UTC(2026, 10, 20, 18, 0), theme: "formal", strapColor: "#2a6f4e", perksText: "Free coffee\n  Raffle entry  \n\n", q1: "Course", q2: "What are you looking for?", access: "Step-free", food: "Pizza", directoryOn: true },
  "only a name": { ...blank(), name: "Only a name" },
  "a name with spaces round it": { ...blank(), name: "   Padded name   ", venue: "  Hall  " },
  "too long: name, venue, perks, notes, questions": { ...blank(), name: long(200), venue: long(200), perksText: Array.from({ length: 14 }, (_, i) => `perk ${i} ${long(100)}`).join("\n"), access: long(300), food: long(300), q1: long(90), q2: "ok" },
  "an unknown theme and a bad colour": { ...blank(), name: "Odd", theme: "neon", strapColor: "red" },
  "night with a brand colour": { ...blank(), name: "Late one", theme: "night", strapColor: "#FFAA00" },
  "directory and feedback off": { ...blank(), name: "Quiet", directoryOn: false, feedbackOn: false },
  "markup in the words": { ...blank(), name: "<b>Bold</b> & co", venue: "\"Quoted\" <i>room</i>", perksText: "<script>x</script>", access: "a < b" },
};
const SHAPE = ["name", "venue", "startsAt", "theme", "strapColor", "perks", "directoryOn", "questions", "info", "feedbackOn"];
const pick = (e) => Object.fromEntries(SHAPE.map((k) => [k, e[k]]));
const created = {};
for (const [label, f] of Object.entries(FORMS)) {
  const r = await host.post("/api/host/events", createBody(f));
  const real = r.status === 201 ? (await main.get(`/api/e/${r.json.code}`)).json : null;
  created[label] = { f, code: r.json?.code, id: r.json?.id, real };
  check(`create: ${label}: the preview's data is what the saved event serves`, r.status === 201 && JSON.stringify(pick(eventFromBody(createBody(f)))) === JSON.stringify(pick(real.event)), [r.status, pick(eventFromBody(createBody(f))), real && pick(real.event)]);
}

console.log("\n# The preview and the real page draw the same HTML");
const EventPage = await load("src/components/EventPage.vue");
for (const [label, c] of Object.entries(created)) {
  const props = (event, sponsors) => ({ event, sponsors, form: form({ answers: Object.fromEntries(event.questions.map((q) => [q.key, ""])) }), showName: true, needsAgree: true });
  const real = strip(await render(EventPage, props(c.real.event, c.real.sponsors)));
  const prev = strip(await render(EventPage, props(eventFromBody(createBody(c.f)), [])));
  check(`${label}: the same markup`, real === prev, [real.length, prev.length]);
}
{
  // Sponsors come from the saved event; the host's own live data carries them for Details.
  const c = created["everything filled in"];
  T.env.DB.raw.prepare("INSERT INTO sponsors (id, event_id, name, perk) VALUES ('sp1', ?, 'Acme', 'Free pens')").run(c.id);
  const real = (await main.get(`/api/e/${c.code}`)).json;
  const live = (await host.get(`/api/host/events/${c.id}/live`)).json;
  const props = (event, sponsors) => ({ event, sponsors, form: form({ answers: { extra1: "", extra2: "" } }), showName: false, needsAgree: false });
  const a = strip(await render(EventPage, props(real.event, real.sponsors)));
  const b = strip(await render(EventPage, props(eventFromBody(detailsBody({ ...FORMS["everything filled in"] }), live.event.questions), live.sponsors)));
  check("the host's own live data carries the sponsors, theme, colour, perks, directory and questions", live.sponsors.length === 1 && live.sponsors[0].name === "Acme" && live.event.theme === "formal" && live.event.strapColor === "#2a6f4e" && live.event.perks.length === 2 && live.event.directoryOn === true && live.event.questions.length === 2, live.event);
  check("Details: the preview from the form and the real page for the saved event are the same markup, sponsors included", a === b && a.includes("Acme") && a.includes("Free pens"));
  check("the added live fields hold only what the host typed: sponsors are id, name and perk", Object.keys(live.sponsors[0]).sort().join() === "id,name,perk");
}

console.log("\n# Editing: what Details saves is what the page then shows");
{
  const c = created["only a name"];
  const d = { name: "  Renamed  ", venue: "Main hall", startsAt: Date.UTC(2026, 11, 1, 9, 0), endsAt: Date.UTC(2026, 11, 1, 17, 0), rsvpCount: "", access: "Lift", dress: "Smart", food: "", other: "Quiet room", theme: "night", strapColor: "#123456", perksText: "Tea\n Biscuits ", directoryOn: false };
  const put = await host.put(`/api/host/events/${c.id}`, detailsBody(d));
  const real = (await main.get(`/api/e/${c.code}`)).json;
  const live = (await host.get(`/api/host/events/${c.id}/live`)).json;
  const prev = eventFromBody(detailsBody(d), live.event.questions);
  check("a saved edit reads back as the preview showed it", put.status === 200 && JSON.stringify(pick(prev)) === JSON.stringify(pick(real.event)), [pick(prev), pick(real.event)]);
  const clear = await host.put(`/api/host/events/${c.id}`, detailsBody({ ...d, strapColor: "" }));
  check("clearing the brand colour sends an empty string and the event goes back to the theme colour", clear.status === 200 && (await main.get(`/api/e/${c.code}`)).json.event.strapColor === null);
}

console.log("\n# The theme shows on the page; the default page is unchanged");
{
  const ev = (extra) => ({ name: "T", venue: "", questions: [], directoryOn: false, feedbackOn: false, info: {}, ...extra });
  const html = async (e) => strip(await render(EventPage, { event: ev(e), form: form() }));
  const plain = await html({ theme: "default", strapColor: null });
  check("default theme and no colour: the old head, with its Event check-in label and no strap", plain.includes('class="page-head"') && plain.includes(">Event check-in<") && !plain.includes("event-brand") && !plain.includes("profile-strap"), plain.slice(0, 300));
  check("an event with no theme at all (an older one) is the same as default", (await html({})) === plain);
  const cls = (h, ...names) => { const m = h.match(/class="([^"]*)"[^>]*data-v-[0-9a-f]+><div class="profile-strap"/); return !!m && names.every((n) => m[1].split(" ").includes(n)); };
  const formal = await html({ theme: "formal", strapColor: null }), night = await html({ theme: "night", strapColor: null });
  check("formal and night draw a card head with its own strap, like a card", cls(formal, "profile", "event-brand", "formal") && cls(night, "profile", "event-brand", "night") && formal.includes("profile-strap") && !formal.includes("background"));
  const brand = await html({ theme: "default", strapColor: "#2a6f4e" });
  check("a brand colour alone colours the strap only", cls(brand, "profile", "event-brand") && /class="profile-strap"[^>]*style="background:#2a6f4e;?"/.test(brand), brand.slice(0, 400));
  const rest = (h) => h.slice(h.indexOf('<div class="notice"'));
  check("everything below the head is the same whatever the theme", rest(plain) === rest(formal) && rest(formal) === rest(night) && rest(night) === rest(brand));
}

console.log("\n# The preview is inert, saves nothing and reads nothing (source guards and a run)");
{
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => { calls.push(a[0]); return new Response("{}"); };
  const Pane = await load("src/components/EventPreview.vue");
  const html = await render(Pane, { event: eventFromBody(createBody(FORMS["everything filled in"])), sponsors: [{ id: "s", name: "Acme", perk: "" }] });
  globalThis.fetch = realFetch;
  check("drawing the preview makes no request at all", calls.length === 0, calls);
  check("the page inside is inert and hidden from a screen reader, and says it is a preview", /class="pv-page"[^>]*\binert\b/.test(html) && /aria-hidden="true"/.test(html) && html.includes("Preview only. Nothing here is saved or sent"));
  const files = ["src/components/EventPreview.vue", "src/components/EventPage.vue", "src/lib/eventform.js"];
  const code = files.map((f) => read(f).replace(/<style[\s\S]*$/, "")).join("\n").replace(/\/\/.*$/gm, "");
  check("none of the preview files imports a store or an API, or calls fetch, or checks anyone in", !/lib\/(store|api|hostapi)|\bfetch\(|HostApi|Api\.|checkIn\(|\/api\//.test(code), files.filter((f) => /lib\/(store|api|hostapi)|fetch\(|HostApi|Api\./.test(read(f))));
  const ep = read("src/components/EventPreview.vue");
  check("typing is shown a moment later: one 150 ms timer, cleared on the next change and on leaving", /setTimeout\(\(\) => \{ shown\.value = e; \}, 150\)/.test(ep) && /clearTimeout\(timer\)/.test(ep) && /onBeforeUnmount/.test(ep));
  check("below 1000 px a Preview button opens a full-screen dialog that closes on Escape", /Preview what attendees see/.test(ep) && ep.includes(`:role="open ? 'dialog' : null"`) && ep.includes(`:aria-modal="open ? 'true' : null"`) && /e\.key === "Escape"/.test(ep) && /min-width: 1000px/.test(ep));
  check("the real page's own fixed Check in bar is made part of the frame, not the window", /\.pv-page :deep\(\.thumb-bar\) \{ position: sticky/.test(read("src/components/EventPreview.vue")));
  const dash = read("src/views/HostDashboard.vue"), live = read("src/views/HostLive.vue");
  check("the dashboard sends the same body the preview reads", /hostCreateEvent\(createBody\(f\.value\)\)/.test(dash) && /eventFromBody\(createBody\(f\.value\)\)/.test(dash));
  check("Details saves the same body the preview reads", /hostUpdateEvent\(id\.value, detailsBody\(d\.value\)\)/.test(live) && /eventFromBody\(detailsBody\(d\.value\)/.test(live));
  check("only host pages use the preview; the attendee pages and the entry do not know it", ["src/main.js", "src/App.vue", "src/router/index.js", "src/router/routes.attendee.js", "src/lib/store.js", "src/lib/api.js", "src/lib/profile.js", "src/components/Icon.vue", "src/views/EventJoin.vue", "src/views/PublicCard.vue"].every((f) => !/EventPreview|eventform/.test(read(f))));
  check("a copy of an earlier event shows no preview (its questions are not known here), a new event does", /:off="!!f\.from"/.test(dash));
  const n = T.q1("SELECT (SELECT COUNT(*) FROM events) AS e, (SELECT COUNT(*) FROM checkins) AS c, (SELECT COUNT(*) FROM connections) AS n");
  check("(sanity) only the real create route made events here, and nobody was checked in or connected", n.c === 0 && n.n === 0 && n.e === Object.keys(FORMS).length, n);
}

await vite.close();
summary();
