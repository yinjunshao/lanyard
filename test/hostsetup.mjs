// F07: a half-finished host account setup must never trap someone.
// Reproduces the steps the browser takes in src/views/HostDashboard.vue.
import { readFileSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";

const T = await makeEnv();
const { client } = T;

console.log("\n# Half-finished setup: recovery key made, profile not saved");
const c = client({ ip: "10.7.0.1" });
let r = await c.get("/api/host/me");
check("a visitor with no sign-in method is shown 'create your account'", r.status === 403 && r.json.code === "account_required", r.json);

// "No passkey? Use a recovery key": the key is made first, terms and profile come after.
const key = (await c.post("/api/auth/recovery")).json.key;
check("a recovery key is made and shown once", typeof key === "string" && key.length > 8);
r = await c.get("/api/host/me");
check("the key alone makes this a host user, so setup is now at the terms step", r.status === 403 && r.json.code === "terms_required", r.json);
await c.post("/api/host/terms", { accept: true });
r = await c.get("/api/host/me");
check("then terms are accepted but there is no profile: stuck on the 'profile' step", r.status === 403 && r.json.code === "profile_required", r.json);

console.log("\n# Closing the tab changes nothing (the cookie is the memory)");
r = await c.get("/api/host/me");
check("reopening later lands on the same step", r.json?.code === "profile_required", r.json);
// Service worker note: /api/host/me is never cached by public/sw.js (it returns early for every /api/ path but /api/me).

console.log("\n# Signing out ends the setup");
const out = await c.post("/api/logout");
check("sign-out works from the half-finished state", out.status === 200 && out.json.ok === true, out.json);
check("the session cookie is gone", ![...c.jar.keys()].some((k) => k === "lanyard_session"), [...c.jar.keys()]);
r = await c.get("/api/host/me");
check("after sign-out the host portal starts from 'create your account' again", r.status === 403 && r.json.code === "account_required", r.json);
r = await c.get("/api/me");
check("…and the app sees no user", r.json?.user === null, r.json);

console.log("\n# The recovery key still gets the person back in (nothing is lost)");
const back = await c.post("/api/auth/recovery/redeem", { key });
check("signing in with the key works", back.status === 200, back.json);
r = await c.get("/api/host/me");
check("…and returns to the profile step", r.json?.code === "profile_required", r.json);
await c.post("/api/logout");
r = await c.get("/api/host/me");
check("a second sign-out is clean too", r.json?.code === "account_required", r.json);

console.log("\n# The screens keep their way out (source guards; the browser steps are in the F07 plan note)");
const dash = readFileSync(new URL("../src/views/HostDashboard.vue", import.meta.url), "utf8");
const head = dash.slice(dash.indexOf('<div class="page-head">'), dash.indexOf('<p v-if="state ==='));
check("the dashboard header has a Sign out button that is not tied to any one step",
  head.includes('@click="signOut"') && !head.slice(0, head.indexOf('@click="signOut"')).includes("state ==="), head.slice(0, 300));
const router = readFileSync(new URL("../src/router/index.js", import.meta.url), "utf8");
check("/host/signout is a route", router.includes('path: "/host/signout"'));
const api = readFileSync(new URL("../src/lib/api.js", import.meta.url), "utf8");
check("logout clears the offline copy even if the request fails", api.includes("finally { setSignedInHint(false); await clearOfflineData(); }"));

summary();
