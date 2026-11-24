// F51: sign-up consent as a line by the button. Run: node test/consent-line.mjs
// Wherever someone without an account signs up (the connect sheet, welcome step 1, a first check-in, Host setup's
// Terms step) the 18+ and Terms tick is gone: a small line directly above the main button says that pressing it
// agrees. The shared-selfie tick and the Terms pop-up's tick stay. The real components are drawn on the server
// (Vue SSR through Vite, no browser), their own handlers are called as the button would call them, and their
// requests go to the real Worker on in-memory SQLite (every /api/ fetch is routed to it; nothing leaves the machine).
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { renderToString } from "vue/server-renderer";
import { createSSRApp, h, reactive } from "vue";
import { routerKey, routeLocationKey } from "vue-router";
import { makeEnv, becomeHost, check, summary, PNG } from "./harness.mjs";
import { SIGNUP_NOTICE, TERMS_VERSION } from "../worker/legal.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// The page's globals the shared files read when they load (site.js reads location; the sheet listens for Escape).
globalThis.location = new URL("https://lanyard.test/c/x");
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
globalThis.document ??= { body: { style: {} }, title: "" };

const T = await makeEnv();
// Every same-origin request a component makes goes to the real Worker as the browser `as` (main or host site).
let as = null;
const sent = []; // { method, path, body }
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
const setMe = (user, profile = null) => { me.user = user; me.profile = profile; me.cards = []; };

// Draws a component and hands back its HTML, its own setup state (submit, save, checkIn, acceptTerms, the refs)
// and what it exposes to its parent (defineExpose).
// `before` may set state before it draws (a selfie that was just taken, the step on screen).
const replaced = [];
const router = { push: (to) => replaced.push(to), replace: (to) => replaced.push(to) };
async function draw(comp, props = {}, { before, query = {}, params = {} } = {}) {
  let state, exposed;
  const Wrapped = { ...comp, ssrRender(ctx, push, parent, attrs, $props, $setup, ...rest) {
    state = $setup; exposed = ctx.$.exposed; before?.($setup);
    return comp.ssrRender(ctx, push, parent, attrs, $props, $setup, ...rest);
  } };
  const app = createSSRApp({ render: () => h(Wrapped, props) });
  app.component("router-link", { props: ["to", "target"], render() { return h("a", { href: this.to, target: this.target }, this.$slots.default?.()); } });
  app.provide(routerKey, router);
  app.provide(routeLocationKey, reactive({ query, params, path: "/", fullPath: "/" }));
  const ctx = {};
  const html = (await renderToString(app, ctx)).replace(/ data-v-[0-9a-f]+/g, "").replace(/<!--[\s\S]*?-->/g, "");
  return { html, state, exposed, teleports: ctx.teleports || {} };
}
// The words a person reads in an element: tags gone, entities decoded, spaces collapsed.
const words = (s) => s.replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const linesOf = (html) => [...html.matchAll(/<p class="consent-line">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
const linksOf = (s) => [...s.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
const checkboxes = (html) => (html.match(/type="checkbox"/g) || []).length;
const logOf = (userId, scope) => T.q("SELECT scope, action, ref, wording, version FROM consent_log WHERE user_id = ? AND scope = ? ORDER BY at, rowid", userId, scope);
const meOf = async (c) => (await c.get("/api/me")).json;
const termsScope = `terms:${TERMS_VERSION}`;

// Someone with a card to connect to.
const owner = T.client({ ip: "10.51.0.1" });
await owner.post("/api/profile", { name: "Ann Owner", acceptTerms: true, over18: true });
const ownerId = (await meOf(owner)).user.id;
const cardId = T.q1("SELECT id FROM cards WHERE user_id = ?", ownerId).id;
const view = (await owner.get(`/api/c/${cardId}`)).json; // the card as a scan opens it (the owner's own view is fine for drawing)
const sheetView = { ...view, cardId, profile: { name: "Ann Owner" }, viewer: {} };

console.log("\n# The words: each page shows the line the Worker records, word for word");
{
  const sources = {
    connect: read("src/components/ConnectSheet.vue"), welcome: read("src/views/Welcome.vue"),
    checkin: read("src/components/EventPage.vue"), host: read("src/components/HostSetup.vue"),
  };
  for (const [place, src] of Object.entries(sources)) {
    const m = src.match(/<p v-if="[^"]+" class="consent-line">([\s\S]*?)<\/p>/);
    check(`${place}: the page has one line, and it reads exactly as the Worker records it`, (src.match(/class="consent-line"/g) || []).length === 1 && m && words(m[1]) === SIGNUP_NOTICE[place], m && words(m[1]));
  }
  check("each line names the button it sits above, in that button's own words", SIGNUP_NOTICE.connect.startsWith("By pressing Connect,") && SIGNUP_NOTICE.welcome.startsWith("By pressing Continue,") && SIGNUP_NOTICE.checkin.startsWith("By pressing Check in,") && SIGNUP_NOTICE.host.startsWith("By pressing Agree and continue,"));
  check("the host line keeps its authorised-to-act part", /authorised to act for the organisation you set up/.test(SIGNUP_NOTICE.host) && /Host Terms and Privacy Policy\.$/.test(SIGNUP_NOTICE.host));
  check("every line says 18 or over", Object.values(SIGNUP_NOTICE).every((s) => s.includes("you're 18 or over")));
  check("the Terms version is unchanged (2026-11-22): no one is asked to agree again", TERMS_VERSION === "2026-11-22");
  check("the line is small muted text and its links are underlined (one rule in main.css)", /\.consent-line \{[^}]*font-size: 13px;[^}]*color: var\(--graphite\);/.test(read("src/styles/main.css")) && /\.checkbox-row a, \.consent-line a \{[^}]*text-decoration: underline/.test(read("src/styles/main.css")));
}

console.log("\n# The connect sheet: a guest connects by pressing Connect");
{
  setMe(null);
  const Sheet = await load("src/components/ConnectSheet.vue");
  const { html, state } = await draw(Sheet, { view: sheetView });
  const ls = linesOf(html);
  check("a guest sees exactly one line and no tick at all (no selfie yet)", ls.length === 1 && checkboxes(html) === 0, checkboxes(html));
  check("the line sits directly above the buttons, Connect among them", /<\/p><div class="btn-row"><button class="btn btn-ghost" type="button">Not now<\/button><button class="btn btn-primary">Connect<\/button>/.test(html));
  const links = linksOf(ls[0]);
  check("its Terms and Privacy Policy links open in a new tab, as before", links.length === 2 && links[0].text === "Terms" && /href="\/terms"/.test(links[0].attrs) && links[1].text === "Privacy Policy" && /href="\/privacy"/.test(links[1].attrs) && links.every((l) => /target="_blank"/.test(l.attrs)), links);
  check("the Connect button calls submit (the handler run below)", /<button class="btn btn-primary" :disabled="busy" @click="submit">\s*\{\{ busy \? "Saving…" : "Connect" \}\}/.test(read("src/components/ConnectSheet.vue")));
  as = T.client({ ip: "10.51.1.1" });
  state.name = "Gail Guest"; state.email = "gail@example.com";
  const before = sent.length;
  await state.submit();
  const req = sent.slice(before).find((r) => r.path === "/api/connect");
  check("pressing Connect sends acceptTerms: true and over18: true", req?.body.acceptTerms === true && req?.body.over18 === true, req?.body);
  check("…and connects them (the sheet shows the done screen)", !state.error && state.result?.connectionId, state.error);
  const mine = await meOf(as);
  check("their account shows the Terms accepted and 18+", mine.user.termsAccepted === true && mine.user.over18 === true, mine.user);
  const log = logOf(mine.user.id, termsScope);
  check("the consent history says how: by pressing Connect under the line, with its words and the Terms version", log.length === 1 && log[0].action === "granted" && log[0].ref === "notice:connect" && log[0].wording === SIGNUP_NOTICE.connect && log[0].version === TERMS_VERSION, log);
}
{
  // With a selfie: the selfie tick is the only tick, unticked, and Connect is refused until it is ticked.
  setMe(null);
  const Sheet = await load("src/components/ConnectSheet.vue");
  const { html, state } = await draw(Sheet, { view: sheetView }, { before: (s) => { s.selfieDataUrl = PNG; } });
  check("with a selfie attached there is one tick, the selfie one, worded exactly as before and not ticked", checkboxes(html) === 1 && /<input type="checkbox">\s*<span class="small"> Everyone in the shared selfie agrees to it\. Either of us can delete it at any time, and it disappears for both\. The other person has to accept it in the app, or it is deleted after 7 days\. <\/span>/.test(html) && linesOf(html).length === 1);
  as = T.client({ ip: "10.51.1.2" });
  state.name = "Sam Selfie"; state.email = "sam@example.com";
  let before = sent.length;
  await state.submit();
  check("Connect with the selfie tick off is refused, says why, and sends nothing", state.error === "Both of you need to agree to the shared selfie." && sent.length === before && !state.result, state.error);
  check("…and that message mentions no Terms box", !/Terms|18/.test(state.error));
  state.consent = true;
  before = sent.length;
  await state.submit();
  const req = sent.slice(before).find((r) => r.path === "/api/connect");
  check("ticked, Connect sends the selfie, its tick, and both Terms flags, and connects", req?.body.consent === true && !!req?.body.selfieDataUrl && req.body.acceptTerms === true && req.body.over18 === true && state.result?.connectionId, [state.error, req?.body.consent]);
}
{
  // Someone who already agreed sees no line, and nothing is sent for the Terms.
  as = T.client({ ip: "10.51.1.3" });
  await as.post("/api/profile", { name: "Ada Agreed", acceptTerms: true, over18: true });
  const mine = await meOf(as);
  setMe(mine.user, mine.profile);
  const Sheet = await load("src/components/ConnectSheet.vue");
  const { html, state } = await draw(Sheet, { view: sheetView });
  check("someone who has agreed sees no line and no tick", linesOf(html).length === 0 && !/By pressing/.test(html) && checkboxes(html) === 0);
  const before = sent.length;
  await state.submit();
  const req = sent.slice(before).find((r) => r.path === "/api/connect");
  check("…and their Connect sends no Terms flags and still connects", req && !("acceptTerms" in req.body && req.body.acceptTerms !== undefined) && req.body.over18 === undefined && state.result?.connectionId, req?.body);
  check("…and adds no second Terms row to their history", logOf(mine.user.id, termsScope).length === 1);
}

console.log("\n# Welcome step 1: a new card's first step");
{
  setMe(null);
  const Welcome = await load("src/views/Welcome.vue");
  const StepYou = await load("src/components/welcome/StepYou.vue");
  const you = await draw(StepYou);
  check("step 1 has no tick", checkboxes(you.html) === 0 && !/I'm 18 or over|I&#39;m 18 or over/.test(you.html));
  check("without a name Continue stays disabled (ready is false)", you.state.ready === false);
  you.state.name = "Nina New";
  check("with a name it is ready, with no tick to tick", you.state.ready === true);
  check("step 1 asks the shell for the line while the person has not agreed (exposed termsLine)", you.exposed?.termsLine?.value === true && you.exposed.ready.value === true);
  // The shell draws the line above Continue from what the step exposes.
  const shell = await draw(Welcome, {}, { query: { step: "1" }, before: (s) => { s.ready = true; s.stepEl = { termsLine: true, ready: true }; } });
  const ls = linesOf(shell.html);
  check("the shell shows one line directly above Continue", ls.length === 1 && /<\/p><button type="button" class="btn btn-primary">Continue<\/button>/.test(shell.html), ls);
  const links = linksOf(ls[0] || "");
  check("its Terms and Privacy Policy links open in a new tab", links.length === 2 && /href="\/terms"/.test(links[0].attrs) && /href="\/privacy"/.test(links[1].attrs) && links.every((l) => /target="_blank"/.test(l.attrs)), links);
  const noName = await draw(Welcome, {}, { query: { step: "1" }, before: (s) => { s.ready = true; s.stepEl = { termsLine: true, ready: false }; } });
  check("without a name the shell's Continue is disabled", /<button type="button" class="btn btn-primary" disabled>Continue<\/button>/.test(noName.html));
  const agreed = await draw(Welcome, {}, { query: { step: "1" }, before: (s) => { s.ready = true; s.stepEl = { termsLine: false, ready: true }; } });
  check("for someone who has agreed the shell shows no line", linesOf(agreed.html).length === 0 && !/By pressing/.test(agreed.html));
  as = T.client({ ip: "10.51.2.1" });
  const before = sent.length;
  await you.state.save();
  const req = sent.slice(before).find((r) => r.path === "/api/profile" && r.method === "POST");
  check("pressing Continue (save) sends acceptTerms: true and over18: true and makes the card", req?.body.acceptTerms === true && req?.body.over18 === true && req?.body.onboarding === true, req?.body);
  const mine = await meOf(as);
  check("their account shows the Terms accepted and 18+", mine.profile?.name === "Nina New" && mine.user.termsAccepted === true && mine.user.over18 === true);
  const log = logOf(mine.user.id, termsScope);
  check("the consent history says how: by pressing Continue under the line", log.length === 1 && log[0].ref === "notice:welcome" && log[0].wording === SIGNUP_NOTICE.welcome && log[0].version === TERMS_VERSION, log);
  setMe(mine.user, mine.profile);
  const again = await draw(StepYou);
  check("once agreed, step 1 asks for no line", again.exposed?.termsLine?.value === false && checkboxes(again.html) === 0);
  // A person who had already agreed and makes a card this way is not recorded as having seen the line.
  const pre = T.client({ ip: "10.51.2.2" });
  await pre.post("/api/terms/accept", { accept: true, over18: true }); // a signed-in person with no card who agreed already
  const preId = (await meOf(pre)).user?.id;
  await pre.post("/api/profile", { name: "Pre Agreed", acceptTerms: true, over18: true });
  const preLog = preId ? logOf(preId, termsScope) : [];
  check("…someone who had agreed already gets a plain row, not a notice row, when the card is made", preId && preLog.length === 2 && preLog[1].ref === null && preLog[1].wording === null, preLog);
}

console.log("\n# A first check-in to an event");
const host = T.client({ ip: "10.51.3.1", site: "host" });
const hinfo = await becomeHost(host, { kind: "company", name: "Line Co" });
T.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES (?, ?, 5, 0, ?, ?)").run("cr-f51", hinfo.org.json.id, "test", Date.now());
const evr = await host.post("/api/host/events", { name: "Line night", startsAt: Date.now() - 60e3, endsAt: Date.now() + 3 * 3600e3, directoryOn: true, feedbackOn: false, questions: [], perks: [] });
check("(a host made an event to check in to)", evr.status === 201, evr.text);
const code = evr.json.code;
{
  setMe(null);
  const EventPage = await load("src/components/EventPage.vue");
  const EventJoin = await load("src/views/EventJoin.vue");
  const event = (await T.client({ ip: "10.51.3.9" }).get(`/api/e/${code}`)).json.event;
  const form = { name: "", answers: {}, sponsorConsent: {}, directoryConsent: false, collect: null, hasEmail: true };
  const page = await draw(EventPage, { event, form, showName: true, needsAgree: true });
  const ls = linesOf(page.html);
  check("a first-timer sees one line, inside the Check in bar, directly above the button", ls.length === 1 && /<div class="thumb-bar"><div class="inner"><p class="consent-line">[\s\S]*?<\/p><button class="btn btn-primary">Check in<\/button><\/div><\/div>/.test(page.html));
  // F60 adds the Suggest me tick (pre-ticked by the owner's decision, D054), which is not a Terms tick either.
  check("there is no Terms tick (only the attendee room tick, which is the person's own choice, and F60's Suggest me)", checkboxes(page.html) === 2 && /attendee room/.test(page.html) && /data-suggest-me/.test(page.html) && !/I&#39;m 18 or over/.test(page.html));
  const links = linksOf(ls[0]);
  check("its Terms and Privacy Policy links open in a new tab", links.length === 2 && /href="\/terms"/.test(links[0].attrs) && /href="\/privacy"/.test(links[1].attrs) && links.every((l) => /target="_blank"/.test(l.attrs)), links);
  const known = await draw(EventPage, { event, form, showName: false, needsAgree: false });
  check("someone who has agreed sees no line", linesOf(known.html).length === 0 && !/By pressing/.test(known.html));
  check("the Check in button emits checkin, and EventJoin's checkIn answers it", /@click="\$emit\('checkin'\)"/.test(read("src/components/EventPage.vue")) && /@checkin="checkIn"/.test(read("src/views/EventJoin.vue")));

  // EventJoin's own checkIn, against the real Worker.
  as = T.client({ ip: "10.51.3.2" });
  const join = await draw(EventJoin, {}, { params: { code }, before: (s) => { s.state = "checkin"; s.event = event; } });
  check("EventJoin draws the line for a first-timer", linesOf(join.html).length === 1);
  join.state.form.name = "Chen Checkin";
  const before = sent.length;
  await join.state.checkIn();
  const req = sent.slice(before).find((r) => /\/checkin$/.test(r.path));
  check("pressing Check in sends acceptTerms: true and over18: true and checks in", req?.body.acceptTerms === true && req?.body.over18 === true && !join.state.error && replaced.includes(`/app/events/${event.id}`), [join.state.error, req?.body]);
  const mine = await meOf(as);
  check("their account shows the Terms accepted and 18+", mine.user.termsAccepted === true && mine.user.over18 === true);
  const log = logOf(mine.user.id, termsScope);
  check("the consent history says how: by pressing Check in under the line", log.length === 1 && log[0].ref === "notice:checkin" && log[0].wording === SIGNUP_NOTICE.checkin && log[0].version === TERMS_VERSION, log);
}

console.log("\n# Host setup's Terms step");
{
  const HostSetup = await load("src/components/HostSetup.vue");
  const hc = T.client({ ip: "10.51.4.1", site: "host" });
  const { hostSignIn } = await import("./harness.mjs");
  await hostSignIn(hc, "newhost@work.example.com");
  await hc.post("/api/host/account/details", { fullName: "Hana Host", survey: { useCase: "Weekly socials", frequency: "Weekly or more" } });
  const acct = (await hc.get("/api/host/me")).json;
  check("(the new host is at the Terms step)", acct.step === "terms", acct.step);
  const t = await draw(HostSetup, { view: "terms", account: acct.account });
  const ls = linesOf(t.html);
  check("the Terms step has no tick and one host line, directly above Agree and continue", checkboxes(t.html) === 0 && ls.length === 1 && /<\/p><button class="btn btn-primary">Agree and continue<\/button>/.test(t.html));
  check("the line keeps the authorised-to-act part", words(ls[0]) === SIGNUP_NOTICE.host);
  const links = linksOf(ls[0]);
  check("its Host Terms and Privacy Policy links go to the main site and open in a new tab, as before", links.length === 2 && links[0].text === "Host Terms" && /href="https:\/\/lanyard\.test\/terms#hosts"/.test(links[0].attrs) && links[1].text === "Privacy Policy" && /href="https:\/\/lanyard\.test\/privacy"/.test(links[1].attrs) && links.every((l) => /target="_blank"/.test(l.attrs) && /rel="noopener"/.test(l.attrs)), links);
  as = hc;
  let before = sent.length;
  await t.state.acceptTerms();
  const req = sent.slice(before).find((r) => r.path === "/api/host/terms");
  check("pressing Agree and continue sends accept: true (the host route's one flag, as before) and completes the step", req?.body.accept === true && !t.state.error && (await hc.get("/api/host/me")).json.step === "org", [t.state.error, req?.body]);
  const hostId = (await hc.get("/api/host/me")).json.account.id ?? T.q1("SELECT id FROM host_accounts WHERE email = ?", "newhost@work.example.com")?.id;
  const hlog = T.q("SELECT scope, action, ref, wording, version FROM consent_log WHERE scope = ? AND ref = 'host_account' AND user_id = ?", `host_terms:${TERMS_VERSION}`, hostId);
  check("the host's consent history says how, under ref host_account (which keeps it in the host's own download)", hlog.length === 1 && hlog[0].wording === SIGNUP_NOTICE.host && hlog[0].version === TERMS_VERSION, hlog);
  check("…and the host's own data download still lists it", (await hc.get("/api/host/account/export")).json.consentHistory?.some((r) => r.scope === `host_terms:${TERMS_VERSION}`));
  // Back from the organisation step: already agreed, so no line, and Continue sends nothing.
  const done = (await hc.get("/api/host/me")).json;
  const t2 = await draw(HostSetup, { view: "terms", account: done.account });
  check("a host who has agreed sees no line and no tick, and the button says Continue", linesOf(t2.html).length === 0 && checkboxes(t2.html) === 0 && /<button class="btn btn-primary">Continue<\/button>/.test(t2.html) && /You&#39;ve agreed to the/.test(t2.html));
  before = sent.length;
  await t2.state.acceptTerms();
  check("…and Continue does not agree again", !sent.slice(before).some((r) => r.path === "/api/host/terms") && T.q("SELECT 1 FROM consent_log WHERE user_id = ? AND scope LIKE 'host_terms:%'", hostId).length === 1);
}

console.log("\n# The Worker still refuses a sign-up without both flags, exactly as before");
{
  const shapes = [{}, { acceptTerms: true }, { over18: true }, { acceptTerms: "true", over18: "true" }, { acceptTerms: 1, over18: 1 }, { acceptTerms: false, over18: true }];
  let i = 0;
  for (const s of shapes) {
    i += 1;
    const g = T.client({ ip: `10.51.5.${i}` });
    const c = await g.post("/api/connect", { cardId, name: "No Flags", email: `noflags${i}@example.com`, ...s });
    const p = await T.client({ ip: `10.51.6.${i}` }).post("/api/profile", { name: "No Flags", onboarding: true, ...s });
    const k = await T.client({ ip: `10.51.7.${i}` }).post(`/api/e/${code}/checkin`, { name: "No Flags", ...s });
    check(`connect, make a card and check in with ${JSON.stringify(s)} are each refused with terms_required`, [c, p, k].every((r) => r.status === 400 && r.json?.code === "terms_required"), [c.status, p.status, k.status]);
  }
  check("…and none of those made anyone a card or checked anyone in", !T.q1("SELECT 1 x FROM profiles WHERE name = 'No Flags'") && !T.q1("SELECT 1 x FROM checkins c JOIN profiles p ON p.user_id = c.user_id WHERE p.name = 'No Flags'"));
  check("the refusals mention no box", [...shapes].length && !/box|tick/i.test((await T.client({ ip: "10.51.8.1" }).post("/api/connect", { cardId, name: "X", email: "x8@example.com" })).json.error));
  const hc = T.client({ ip: "10.51.9.1", site: "host" });
  const { hostSignIn } = await import("./harness.mjs");
  await hostSignIn(hc, "refused@work.example.com");
  await hc.post("/api/host/account/details", { fullName: "Rex Refused", survey: { useCase: "Weekly socials", frequency: "Weekly or more" } });
  const refusals = await Promise.all([{}, { accept: "true" }, { accept: 1 }, { accept: false }].map((b) => hc.post("/api/host/terms", b)));
  check("host terms without accept: true are refused with terms_required, and the step stays", refusals.every((r) => r.status === 400 && r.json.code === "terms_required") && (await hc.get("/api/host/me")).json.step === "terms");
  check("the existing-account route still needs both flags", (await owner.post("/api/terms/accept", { accept: true })).status === 400 && (await owner.post("/api/terms/accept", { over18: true })).status === 400);
}

console.log("\n# What stays: the Terms pop-up's tick, and no message about a box that is gone");
{
  const TermsGate = await load("src/components/TermsGate.vue");
  setMe({ needsTerms: true, termsAccepted: false }, { name: "Old Account" });
  const g = await draw(TermsGate);
  const body = Object.values(g.teleports).join("");
  check("the Terms pop-up still has its tick, unticked, and its button is disabled until it is ticked", checkboxes(body) === 1 && /I&#39;m 18 or over, and I agree to the Terms of Service and Privacy Policy\./.test(body) && /<button class="btn btn-primary" disabled>/.test(body) && !/consent-line/.test(body));
  check("…and it is still on every /app page", /<TermsGate \/>/.test(read("src/components/AppShell.vue")));
  const four = ["src/components/ConnectSheet.vue", "src/components/welcome/StepYou.vue", "src/views/Welcome.vue", "src/components/EventPage.vue", "src/views/EventJoin.vue", "src/components/HostSetup.vue"].map(read).join("\n");
  check("no sign-up page has a Terms tick or the old wording left", !/v-model="agreed"|form\.agreed|agreed\.value|I'm 18 or over(,)? and I agree|I'm 18 or over, I'm authorised/.test(four));
  check("no message on those pages asks to tick a box or to confirm 18+ first", !/tick the box|Please (confirm|agree)/i.test(four));
  const workerMsgs = ["worker/index.js", "worker/events.js", "worker/hosts.js"].map(read).join("\n");
  check("no Worker message asks to tick a box for the Terms or 18+ (the selfie one is for its tick, which stays)", ![...workerMsgs.matchAll(/error: "([^"]*)"/g)].some((m) => /tick|box/i.test(m[1]) && /Terms|18/.test(m[1])));
  check("the Terms and Privacy Policy describe no tick for 18+ or the Terms", ![read("src/views/Terms.vue"), read("src/views/Privacy.vue")].some((s) => /tick[^.]*(18|Terms of|the Terms)|(18 or over)[^.]*tick/i.test(s)));
  check("the Terms still say to tick the confirmation for a shared selfie", /Only take or upload one if every person in it has agreed, and tick the confirmation when you do\./.test(read("src/views/Terms.vue")));
}

await vite.close();
summary();
