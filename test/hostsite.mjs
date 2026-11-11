// F10: the host portal on its own site. Old /host addresses move there (301),
// each site's router carries only its own pages, and host code stays out of
// the attendee bundle. Browser steps are in the F10 plan note.
import { readFileSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const T = await makeEnv();
const main = T.client({ ip: "10.80.0.1" });
const host = T.client({ ip: "10.80.0.2", site: "host" });

console.log("\n# Old addresses go to the host site (Worker, 301)");
for (const [from, to] of [
  ["/host/events/abc", "https://host.lanyard.test/events/abc"],
  ["/host", "https://host.lanyard.test/"],
  ["/host/", "https://host.lanyard.test/"],
  ["/host/billing?from=email", "https://host.lanyard.test/billing?from=email"],
  ["/host/account", "https://host.lanyard.test/account"],
  ["/host/signin", "https://host.lanyard.test/signin"],
  ["/host/signout", "https://host.lanyard.test/signout"],
]) {
  const r = await main.get(from);
  check(`lanyd.fyi${from} → ${to}`, r.status === 301 && r.headers.get("location") === to, [r.status, r.headers.get("location")]);
}
const old = await host.get("/host/events/abc");
check("the host site's own old /host/... addresses move to the root too", old.status === 301 && old.headers.get("location") === "https://host.lanyard.test/events/abc", old.headers.get("location"));
check("/hosts (the pitch page) stays on the main site", (await main.get("/hosts")).status === 200);
check("/host-icon.svg is not caught by the redirect", (await main.get("/host-icon.svg")).status === 200);
check("the redirect sets no cookie", (await main.get("/host/events/abc")).setCookies.length === 0);

console.log("\n# The browser sends old addresses to the same place");
globalThis.__HOST_ORIGIN__ = "https://host.lanyd.fyi";
globalThis.location = { hostname: "lanyd.fyi", origin: "https://lanyd.fyi" };
const site = await import("../src/lib/site.js");
check("hostAddress maps /host/events/abc", site.hostAddress("/host/events/abc") === "https://host.lanyd.fyi/events/abc");
check("…/host and /host?x=1", site.hostAddress("/host") === "https://host.lanyd.fyi/" && site.hostAddress("/host?x=1") === "https://host.lanyd.fyi/?x=1");
check("…and keeps queries", site.hostAddress("/host/billing?from=email") === "https://host.lanyd.fyi/billing?from=email");
check("a production build points at host.lanyd.fyi", /mode === 'production' \? 'https:\/\/host\.lanyd\.fyi'/.test(read("vite.config.js")));
const siteSrc = read("src/lib/site.js");
check("without a build setting, the host site is host. + this address (host.localhost in dev)", siteSrc.includes('location.origin.replace("//", "//host.")'));

console.log("\n# Each site's router has only its own pages (source guards)");
const idx = read("src/router/index.js"), att = read("src/router/routes.attendee.js"), hr = read("src/router/routes.host.js");
check("the router picks the route table by ON_HOST_SITE", /ON_HOST_SITE\s*\?\s*\[\.\.\.hostRoutes/.test(idx) && idx.includes("...attendeeRoutes"));
check("the attendee routes name no host page", !/Host(Dashboard|Live|Billing|Account|SignOut)/.test(att) && !/path: "\/host(\/|")/.test(att));
check("the host routes name no attendee page", !/(Landing|PublicCard|MyCard|Settings|People|Scan|EventJoin|Admin)\.vue/.test(hr));
for (const p of ['"/"', '"/signin"', '"/events/:id/:screen(present|print)?"', '"/billing"', '"/account"', '"/signout"']) {
  check(`host page at the root: ${p}`, hr.includes(`path: ${p}`));
}
check("old /host/... addresses on the host site redirect to the root", hr.includes('path: "/host/:rest(.*)*", redirect:'));
check("the main site sends /host... to the host site", idx.includes('to.path === "/host" || to.path.startsWith("/host/")') && idx.includes("hostAddress(to.fullPath)"));
check("the host site sends anything else to the main site", idx.includes("MAIN_ORIGIN + to.fullPath"));
check("the host site never waits on the attendee /api/me", idx.indexOf("return true; // host pages") < idx.indexOf("ensureMe()"));

console.log("\n# Host code stays out of the attendee bundle");
check("api.js (loaded by every page) has no host API calls", !read("src/lib/api.js").includes("/api/host/"));
for (const v of ["HostDashboard", "HostLive", "HostBilling", "HostAccount", "HostSignOut"]) {
  check(`${v} talks to the host API through hostapi.js`, /from "\.\.\/lib\/hostapi"/.test(read(`src/views/${v}.vue`)));
}
check("the pitch page and Settings link to the host site, not /host", read("src/views/Hosts.vue").includes("`${HOST_ORIGIN}/`")
  && read("src/views/settings/SettingsAccount.vue").includes(":href=\"`${HOST_ORIGIN}/`\"") && !/to="\/host"/.test(read("src/views/settings/SettingsAccount.vue")));
const stray = ["src/views/HostDashboard.vue", "src/views/HostLive.vue", "src/views/HostBilling.vue", "src/views/HostAccount.vue"]
  .filter((f) => /(to=|:to=|assign\(|push\()["'`]\/host[/"'`]/.test(read(f)));
check("no host page links to an old /host address", stray.length === 0, stray);

check("the dev proxy keeps the browser's Host header, so the Worker can tell host.localhost apart",
  read("vite.config.js").includes("'/api': { target: 'http://localhost:8787', changeOrigin: false }"));

console.log("\n# Config (F10.11)");
const prod = read("wrangler.production.toml"), local = read("wrangler.toml");
const prodOrigins = prod.match(/^APP_ORIGIN = "([^"]+)"/m)?.[1].split(",") || [];
check("production APP_ORIGIN lists the host portal", prodOrigins.includes("https://host.lanyd.fyi") && prodOrigins.includes("https://lanyd.fyi"), prodOrigins);
check("production HOST_ORIGIN is https://host.lanyd.fyi", /^HOST_ORIGIN = "https:\/\/host\.lanyd\.fyi"$/m.test(prod));
check("local dev: host.localhost:5173 is allowed and is HOST_ORIGIN", /^APP_ORIGIN = "[^"]*http:\/\/host\.localhost:5173/m.test(local) && /^HOST_ORIGIN = "http:\/\/host\.localhost:5173"$/m.test(local));
check("local dev prints email instead of sending it; production does not", /^MAIL_LOG = "1"$/m.test(local) && !/MAIL_LOG/.test(prod));
check("passkeys never accept the host portal's origin", read("worker/passkeys.js").includes(String.raw`filter((o) => o && !/^https?:\/\/host\./.test(o))`));
const { sendMail } = await import("../worker/mail.js");
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { calls++; return new Response("{}"); };
const log = console.log; let printed = "";
console.log = (m) => { printed += m; };
await sendMail({ MAIL_LOG: "1", RESEND_DECISIONS_KEY: "re_not_real" }, "decisions", { to: "a@example.com", subject: "123456 is your code", text: "code 123456" });
console.log = log; globalThis.fetch = realFetch;
check("with MAIL_LOG on, mail is printed and nothing is sent, even with a key set", calls === 0 && printed.includes("123456"));

summary();
