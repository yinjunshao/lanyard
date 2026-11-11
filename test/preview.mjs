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
import { cardFacts } from "../src/lib/cardmerge.js";
import { cardOf, profileOf, viewOf } from "../src/lib/cardpreview.js";
import { buildLinks } from "../src/lib/links.js";
import { subtitleParts } from "../src/lib/profile.js";

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

console.log("\n# F18.3 Which links, tags, headline and about a card shows (one function, used by the Worker and the preview)");
{
  const prof = { links: { LinkedIn: "https://l.example/a", GitHub: "https://g.example/a", Site: "https://s.example/a" }, tags: ["robots", "cv"], headline: "Profile line", about: "Profile about" };
  const f0 = cardFacts({ visible_links: [], tags: [], headline: "", about: "" }, prof);
  check("a card with nothing of its own shows the profile's links, tags, headline and about", JSON.stringify(f0) === JSON.stringify({ links: prof.links, tags: prof.tags, headline: "Profile line", about: "Profile about" }));
  const f1 = cardFacts({ visible_links: ["GitHub", "Gone"], tags: ["own"], headline: "Own line", about: "Own about" }, prof);
  check("its own win; picked links keep only those that exist; a label the profile no longer has is dropped", JSON.stringify(f1) === JSON.stringify({ links: { GitHub: "https://g.example/a" }, tags: ["own"], headline: "Own line", about: "Own about" }));
  check("a profile with no links, tags or text gives empty things, not undefined", (() => { const f = cardFacts({ visible_links: ["X"], tags: [] }, {}); return Object.keys(f.links).length === 0 && f.tags.length === 0; })());
  const w = read("worker/index.js");
  check("the Worker builds every card page with it", /import \{ cardFacts \} from "\.\.\/src\/lib\/cardmerge\.js"/.test(w) && /const facts = cardFacts\(card, p\)/.test(w) && !/Object\.fromEntries\(card\.visible_links/.test(w));
  check("it has no imports, so the Worker can load it from src/", !/^import /m.test(read("src/lib/cardmerge.js")));
}

console.log("\n# The card preview and the real card show the same, for the same edits");
{
  const CardView = await load("src/components/CardView.vue");
  const Badge = await load("src/components/Badge.vue");
  const people = [];
  const signup = async (ip, base) => {
    const c = T.client({ ip });
    const r = await c.post("/api/profile", { name: base.name || "Start", acceptTerms: true, over18: true });
    if (r.status !== 201) throw new Error(r.text);
    const me = (await c.get("/api/me")).json;
    return { c, id: me.user.id, cardId: me.cards[0].cardId, code: me.cards[0].code };
  };
  const stranger = T.client({ ip: "10.18.9.9" });
  const linkRows = (o) => Object.entries(o).map(([label, url]) => ({ label, url }));
  const CASES = [
    { label: "a student with every field", edit: { name: "Ada Preview", mode: "student", uni: "Test University", course: "Computer Science", year: "2", company: "Ignored Ltd", role: "Ignored", headline: "Building robots", about: "I like small robots.", tags: "robotics, CV reviews, hackathons", links: linkRows({ LinkedIn: "linkedin.com/in/ada", GitHub: "https://github.com/ada" }) }, card: { name: "General", note: "Say hello", theme: "default" } },
    { label: "a career profile with a studied-at line", edit: { name: "Grace Hopper", mode: "career", uni: "Test College", course: "Ignored course", company: "Acme", role: "Engineer", headline: "Compilers", about: "", tags: "mentoring", links: linkRows({ Site: "grace.example.com" }) }, card: { name: "Work", note: "", theme: "formal" } },
    { label: "a career profile with no company or role", edit: { name: "No Job", mode: "career", uni: "", company: "", role: "", headline: "", about: "", tags: "", links: [] }, card: { name: "Bare", note: "", theme: "night" } },
    { label: "only a name", edit: { name: "Only A Name", mode: "student", headline: "", about: "", tags: "", links: [] }, card: { name: "Card", note: "", theme: "default" } },
    { label: "a card that overrides the headline, about and tags and picks one link", edit: { name: "Over Ride", mode: "student", uni: "Test University", course: "Maths", headline: "Profile line", about: "Profile about", tags: "a, b, c", links: linkRows({ LinkedIn: "linkedin.com/in/o", GitHub: "github.com/o", Site: "o.example.com" }) }, card: { name: "Careers fair", note: "Find me by the stage", theme: "night", headline: "Card line", about: "Card about", tagsText: "x, y", visibleLinks: ["GitHub"] } },
    { label: "too long, and links that are not links", edit: { name: "N".repeat(500), mode: "student", uni: "U".repeat(300), course: "C".repeat(500), year: "9".repeat(500), headline: "H".repeat(500), about: "A".repeat(700), tags: Array.from({ length: 40 }, (_, i) => `tag${i}`).join(", "), links: [...linkRows({ ["L".repeat(50)]: "https://long.example" }), { label: "Bad", url: "javascript:alert(1)" }, { label: "Ok", url: "ok.example.com/" + "p".repeat(400) }] }, card: { name: "N".repeat(80), note: "n".repeat(400), theme: "default", headline: "h".repeat(120), about: "a".repeat(700) } },
    { label: "markup in the words", edit: { name: "<b>Bold</b>", mode: "student", uni: "<i>Uni</i>", course: "\"Quoted\" & co", headline: "<script>x</script>", about: "a < b", tags: "<u>t</u>", links: linkRows({ "<b>L</b>": "https://x.example" }) }, card: { name: "<card>", note: "<n>", theme: "default" } },
  ];
  let n = 0;
  for (const cs of CASES) {
    n += 1;
    const who = await signup(`10.18.8.${n}`, { name: "Start" });
    people.push(who);
    const payload = {
      name: cs.edit.name, mode: cs.edit.mode, company: cs.edit.company || "", role: cs.edit.role || "", uni: cs.edit.uni || "", institutionId: null, course: cs.edit.course || "",
      year: cs.edit.year || "", headline: cs.edit.headline || "", about: cs.edit.about || "",
      tags: (cs.edit.tags || "").split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 12), links: buildLinks(cs.edit.links), showAge: false,
    };
    const put = await who.c.put("/api/profile", payload);
    const cardForm = { name: cs.card.name, note: cs.card.note, theme: cs.card.theme, headline: cs.card.headline || "", about: cs.card.about || "", visibleLinks: cs.card.visibleLinks || [], strapColor: "" };
    const cardTags = (cs.card.tagsText || "").split(",").map((s) => s.trim().slice(0, 24)).filter(Boolean);
    const cput = await who.c.put(`/api/cards/${who.cardId}`, { name: cardForm.name, note: cardForm.note, theme: cardForm.theme, headline: cardForm.headline, about: cardForm.about, visibleLinks: cardForm.visibleLinks, tags: cardTags });
    const real = (await stranger.get(`/api/c/${who.cardId}`)).json;
    const mine = (await who.c.get("/api/me")).json;
    const prof = profileOf(payload, null, mine.profile.projects);
    const card = cardOf(cardForm, { tags: cardTags, cardId: who.cardId, code: who.code });
    const view = viewOf(prof, card);
    const KEYS = ["name", "uni", "course", "year", "mode", "company", "role", "headline", "about", "links", "tags", "projects"];
    const sameData = put.status === 200 && cput.status === 200 && real.name === view.name && real.note === view.note && real.theme === view.theme && (real.strapColor ?? null) === (view.strapColor ?? null)
      && KEYS.every((k) => JSON.stringify(real.profile[k]) === JSON.stringify(view.profile[k]));
    check(`${cs.label}: the preview's data is what the saved card serves`, sameData, { put: put.status, cput: cput.status, KEYS: KEYS.filter((k) => JSON.stringify(real.profile[k]) !== JSON.stringify(view.profile[k])).map((k) => [k, real.profile[k], view.profile[k]]), top: [real.name, view.name, real.note, view.note, real.theme, view.theme] });
    const a = strip(await render(CardView, { view: real })), b = strip(await render(CardView, { view }));
    check(`${cs.label}: What they see is the same HTML as the real card page`, a === b, [a.length, b.length]);
    const sub = (v) => subtitleParts(v.profile, { year: true }).join("  ·  ");
    const ownerView = mine.cards[0];
    const ba = strip(await render(Badge, { view: ownerView, url: "https://lanyard.test/c/x", subtitle: sub(ownerView) }));
    const bb = strip(await render(Badge, { view, url: "https://lanyard.test/c/x", subtitle: sub(view) }));
    check(`${cs.label}: the Badge is the same HTML as My card's`, ba === bb, [ba.length, bb.length]);
  }

  console.log("\n# Hiding a link on a card hides it in What they see");
  {
    const who = people[4]; // the card that picks one link
    const real = (await stranger.get(`/api/c/${who.cardId}`)).json;
    const html = strip(await render(CardView, { view: real }));
    check("only the picked link is on the real card, and the card page does not list the others", Object.keys(real.profile.links).join() === "GitHub" && html.includes("GitHub") && !html.includes("LinkedIn") && !html.includes("o.example.com"));
    const mine = (await who.c.get("/api/me")).json;
    const prof = profileOf(mine.profile, null, mine.profile.projects);
    const all = viewOf(prof, cardOf({ name: "x", visibleLinks: [] }, { tags: [] }));
    const one = viewOf(prof, cardOf({ name: "x", visibleLinks: ["LinkedIn"] }, { tags: [] }));
    const none = viewOf(prof, cardOf({ name: "x", visibleLinks: ["Gone"] }, { tags: [] }));
    check("in the preview: none picked shows all three, one picked shows one, a stale label shows none", Object.keys(all.profile.links).length === 3 && Object.keys(one.profile.links).join() === "LinkedIn" && Object.keys(none.profile.links).length === 0);
    const hi = strip(await render(CardView, { view: one }));
    check("and the rendered page loses the hidden links", hi.includes("LinkedIn") && !hi.includes("GitHub") && !hi.includes("o.example.com"));
  }

  console.log("\n# Themes, the strap colour and empty cards");
  {
    const base = { name: "Card", note: "", visibleLinks: [], tags: [], headline: "", about: "" };
    const prof = profileOf({ name: "Sam Smith", mode: "student" }, null, []);
    const html = async (extra) => strip(await render(CardView, { view: viewOf(prof, cardOf({ ...base, ...extra }, { tags: [] })) }));
    const d = await html({ theme: "default" }), f = await html({ theme: "formal" }), ni = await html({ theme: "night" });
    check("each theme is the card's own class, as on the card page", /class="profile default"/.test(d) && /class="profile formal"/.test(f) && /class="profile night"/.test(ni));
    check("a strap colour colours the strap on the card, and none leaves the theme colour", /class="profile-strap"[^>]*style="background:#2a6f4e;?"/.test(await html({ theme: "default", strapColor: "#2a6f4e" })) && !/background:/.test(d));
    check("a card with only a name says so, as a stranger sees it", /hasn(&#39;|')t filled in their card yet/.test(d) && !d.includes("Your card only shows"));
    check("no In common line, selfie or connect button is drawn in a preview", !d.includes("In common") && !d.includes("Selfie") && !d.includes("Connect with"));
  }
}

console.log("\n# The card preview is inert, saves nothing and reads nothing");
{
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...a) => { calls.push(a[0]); return new Response("{}"); };
  const Preview = await load("src/components/CardPreview.vue");
  const prof = profileOf({ name: "Sam Smith", mode: "student", links: { Site: "https://x.example" }, tags: ["a"] }, null, []);
  const card = cardOf({ name: "Card", theme: "night" }, { tags: [], cardId: "c1", code: "ABC123" });
  const html = await render(Preview, { profile: prof, card, url: "https://lanyard.test/c/c1" });
  globalThis.fetch = realFetch;
  check("drawing the preview makes no request at all", calls.length === 0, calls);
  check("the page inside is inert and hidden from a screen reader, and the preview says nothing is saved", /class="cp-page"[^>]*\binert\b/.test(html) && /aria-hidden="true"/.test(html) && html.includes("Nothing is saved or sent until you press Save"));
  check("it opens on the Badge, with What they see one press away", html.includes("badge-stage") && /aria-pressed="true"[^>]*>Badge</.test(html) && html.includes("What they see"));
  const files = ["src/components/CardPreview.vue", "src/lib/cardpreview.js", "src/lib/cardmerge.js", "src/components/CardView.vue"];
  const code = files.map((f) => read(f).replace(/<style[\s\S]*$/, "")).join("\n").replace(/\/\/.*$/gm, "");
  check("none of the preview's files imports a store or an API or calls fetch", !/lib\/(store|api|hostapi)|\bfetch\(|\bApi\./.test(code), files.filter((f) => /lib\/(store|api|hostapi)|fetch\(|\bApi\./.test(read(f))));
  const cp = read("src/components/CardPreview.vue");
  check("typing is shown a moment later: one 150 ms timer, cleared on the next change and on leaving", /setTimeout\(\(\) => \{ shown\.value = \{ profile, card \}; \}, 150\)/.test(cp) && /clearTimeout\(timer\)/.test(cp) && /onBeforeUnmount/.test(cp));
  check("the preview draws the real Badge and the real CardView, and the card page and My card draw the same ones", /import Badge from "\.\/Badge\.vue"/.test(cp) && /import CardView from "\.\/CardView\.vue"/.test(cp) && /<CardView :view="view">/.test(read("src/views/PublicCard.vue")) && /<Badge :view="card"/.test(read("src/views/MyCard.vue")));
  check("the Badge subtitle is built the way My card builds it", /subtitleParts\(view\.value\.profile, \{ year: true \}\)\.join\("  ·  "\)/.test(cp) && /subtitleParts\(card\.value\?\.profile, \{ year: true \}\)\.join\("  ·  "\)/.test(read("src/views/MyCard.vue")));
  const ep = read("src/views/EditProfile.vue"), cards = read("src/views/Cards.vue");
  check("Edit profile saves the same payload the preview reads", /const payload = payloadOf\(\)/.test(ep) && /profileOf\(payloadOf\(\)/.test(ep) && /<CardPreview /.test(ep));
  check("My cards shows it for a new card and for the card being edited, never both at once", (cards.match(/<CardPreview /g) || []).length === 2 && /creating\.value = false;\s+editingId\.value = card\.cardId/.test(cards.replace(/\r/g, "")) && /if \(creating\.value\) editingId\.value = null/.test(cards));
  check("a card that is not saved yet gets a QR that opens nothing, and the real server has no such card", /\/c\/preview-only/.test(cards) && (await stranger0().get("/api/c/preview-only")).status === 404);
  check("only the two card editors import the preview; the card page, the entry and the shared files do not", ["src/main.js", "src/App.vue", "src/router/index.js", "src/router/routes.attendee.js", "src/lib/store.js", "src/lib/api.js", "src/lib/profile.js", "src/components/Icon.vue", "src/components/Badge.vue", "src/views/PublicCard.vue", "src/views/MyCard.vue", "src/views/Landing.vue"].every((f) => !/CardPreview|cardpreview/.test(read(f))));
  check("the card page's own parts stay on the card page: the connect sheet and the selfie are not in CardView", !/ConnectSheet|selfie|connectedVia/i.test(read("src/components/CardView.vue").replace(/\/\/.*$/gm, "")));
}
function stranger0() { return T.client({ ip: "10.18.9.10" }); }

await vite.close();
summary();
