// F07, then F10: a half-finished host account setup must never trap someone.
// F10 removed the cause: the host account signs in with an email code, each
// setup step is saved on the server, and signing out works from every step.
// This is the server side of the steps the browser takes in the host setup.
import { readFileSync } from "node:fs";
import { makeEnv, check, summary, hostSignIn } from "./harness.mjs";

const T = await makeEnv();
const { client } = T;
const COOKIE = "__Host-lanyard_host";
const EMAIL = "stuck@company.example.com";

const c = client({ ip: "10.7.0.1", site: "host" });
let r = await c.get("/api/host/me");
check("signed out, the host portal asks you to sign in", r.status === 401 && r.json.code === "signed_out", r.json);

async function signOutAndBack(step) {
  const out = await c.post("/api/host/logout");
  check(`at the '${step}' step, Sign out works`, out.status === 200 && out.json.ok === true, out.json);
  check("…the host cookie is gone", !c.jar.has(COOKIE), [...c.jar.keys()]);
  r = await c.get("/api/host/me");
  check(`…and the portal is signed out, not stuck at '${step}'`, r.status === 401 && r.json.code === "signed_out", r.json);
  const back = await hostSignIn(c, EMAIL);
  r = await c.get("/api/host/me");
  check(`signing in again carries on at '${step}' (nothing is lost)`, back.verify.status === 200 && r.json.step === step, r.json);
}

console.log("\n# Step 1: details");
const first = await hostSignIn(c, EMAIL);
check("an email code signs a new host in", first.verify.status === 200 && c.jar.has(COOKIE), first.verify.json);
r = await c.get("/api/host/me");
check("a new account starts at the details step", r.json.step === "details", r.json);
r = await c.get("/api/host/me");
check("a refresh lands on the same step, from the server", r.json.step === "details");
await signOutAndBack("details");

console.log("\n# Step 2: Host Terms");
await c.post("/api/host/account/details", { fullName: "Sam Stuck", survey: { useCase: "Meetups", frequency: "About once a month" } });
r = await c.get("/api/host/me");
check("after the details, the terms step", r.json.step === "terms" && r.json.account.fullName === "Sam Stuck", r.json);
await signOutAndBack("terms");
r = await c.post("/api/host/account/details", { fullName: "Sam Stuck", survey: { useCase: "Meetups and talks", frequency: "About once a month" } });
check("Back from the terms to the details can change them", r.status === 200 && (await c.get("/api/host/me")).json.account.useCase === "Meetups and talks");

console.log("\n# Step 3: own name or an organisation");
await c.post("/api/host/terms", { accept: true });
r = await c.get("/api/host/me");
check("after the terms, the organisation step", r.json.step === "org", r.json);
await signOutAndBack("org");
await c.post("/api/host/orgs", { kind: "individual" });
r = await c.get("/api/host/me");
check("after choosing, the dashboard", r.json.step === "ready" && r.json.org?.name === "Sam Stuck", r.json);
await signOutAndBack("ready");

console.log("\n# Signing out is always safe");
await c.post("/api/host/logout");
const twice = await c.post("/api/host/logout");
check("signing out when already signed out is fine", twice.status === 200);
check("no attendee session is ever made on the host site", !c.jar.has("lanyard_session"), [...c.jar.keys()]);

console.log("\n# The screens keep their way out (source guards; the browser steps are in the F07 and F10 plan notes)");
const dash = readFileSync(new URL("../src/views/HostDashboard.vue", import.meta.url), "utf8");
const head = dash.slice(dash.indexOf('<div class="page-head">'), dash.indexOf('<p v-if="state ==='));
check("the dashboard header has a Sign out button that is not tied to any one step",
  head.includes('@click="signOut"') && !head.slice(0, head.indexOf('@click="signOut"')).includes("state ==="), head.slice(0, 300));
const router = readFileSync(new URL("../src/router/index.js", import.meta.url), "utf8");
check("/host/signout is a route", router.includes('path: "/host/signout"'));
const api = readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");
check("logout clears the offline copy even if the request fails", api.includes("finally { setSignedInHint(false); await clearOfflineData(); }"));

summary();
