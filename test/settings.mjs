// F09: Settings in category pages. Source guards for the wiring, plus the old
// #plus / #signin / #install redirects. The browser steps are in the F09 plan note.
// Run: node test/settings.mjs
import { readFileSync, readdirSync } from "node:fs";
import { check, summary } from "./harness.mjs";
import { settingsRedirect, SETTINGS_HASHES } from "../src/router/settingsRedirect.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\n# Old links");
const to = (path, hash = "", query = {}) => ({ path, hash, query });
check("#plus goes to the Plan page", settingsRedirect(to("/app/settings", "#plus"))?.path === "/app/settings/plan");
check("#signin goes to Sign-in and devices", settingsRedirect(to("/app/settings", "#signin"))?.path === "/app/settings/security");
check("#install goes to Appearance and app", settingsRedirect(to("/app/settings", "#install"))?.path === "/app/settings/appearance");
check("a trailing slash still redirects", settingsRedirect(to("/app/settings/", "#plus"))?.path === "/app/settings/plan");
check("the query string is kept", JSON.stringify(settingsRedirect(to("/app/settings", "#plus", { a: "1" }))?.query) === '{"a":"1"}');
check("no hash, an unknown hash or another path is left alone",
  settingsRedirect(to("/app/settings")) === null && settingsRedirect(to("/app/settings", "#nope")) === null && settingsRedirect(to("/app/settings/plan", "#plus")) === null);
const router = read("src/router/index.js");
check("the router applies the redirect before anything waits on /api/me", router.indexOf("settingsRedirect(to)") > 0 && router.indexOf("settingsRedirect(to)") < router.indexOf("await ensureMe()"));
const routes = ["account", "security", "notifications", "privacy", "plan", "appearance", "help"];
check("every redirect target is a real settings route", Object.values(SETTINGS_HASHES).every((p) => routes.includes(p.split("/").pop()) && router.includes(`path: "${p.split("/").pop()}"`)));

const stale = [];
const walk = (d) => { for (const e of readdirSync(new URL("../" + d, import.meta.url), { withFileTypes: true })) {
  const p = d + "/" + e.name;
  if (e.isDirectory()) walk(p); else if (/\.(vue|js)$/.test(e.name) && /settings#/.test(read(p)) && p !== "src/router/settingsRedirect.js") stale.push(p);
} };
walk("src"); walk("worker");
check("no link in src/ or worker/ still uses a /app/settings#section anchor", stale.length === 0, stale);
check("emails point at the Sign-in and devices page", read("worker/alerts.js").includes("/app/settings/security") && read("worker/mail.js").includes("/app/settings/security"));

console.log("\n# The pages");
for (const r of routes) check(`/app/settings/${r} exists and has a title`, new RegExp(`path: "${r}", component: Settings[A-Za-z]+, meta: [{] title: "[^"]+" [}]`).test(router));
check("Settings is a nested route with a list at its root", /path: "\/app\/settings", component: Settings,[\s\S]*children:[\s\S]*path: "", component: SettingsPick/.test(router));
const layout = read("src/views/Settings.vue");
check("every category is a row in the list", routes.every((r) => layout.includes(`to: "/app/settings/${r}"`)));
check("Log out is at the bottom of the list, uses signOutAndReload and keeps the unsaved warning",
  layout.includes("signOutAndReload(") && layout.includes("Your card isn't saved yet") && layout.indexOf('class="settings-nav"') < layout.indexOf("@click=\"logout\""));
check("the layout has no <slot>, Teleport or useId (the shared Vue chunk stays small, D018)", !/<slot|Teleport|useId|defineAsyncComponent/.test(strip(layout)));

// What the old long page did, and where each thing now lives.
const page = (n) => read(`src/views/settings/Settings${n}.vue`);
const where = {
  Account: ["<EmailSetup", 'to="/app/profile"', 'to="/host"'],
  Security: ["<AuthenticatorSetup", "<DevicesSheet", "<SignInOnAnotherDevice", "registerPasskey", 'to="/claim"', "Save my card"],
  Notifications: ["<EmailPreferences"],
  Privacy: ["Api.exportUrl", "<ConsentHistory", "Api.deleteAccount", "Delete account"],
  Plan: ["Api.plusWaitlist", 'to="/redeem"', "me.plan.label", 'id="plus"'],
  Appearance: ["setThemePref", "<InstallGuide", 'id="install"'],
  Help: ["mailto:", 'to="/terms"', 'to="/privacy"', 'to="/?about=1"'],
};
for (const [n, needles] of Object.entries(where)) check(`${n} holds ${needles.length} things from the old page`, needles.every((x) => page(n).includes(x)), needles.filter((x) => !page(n).includes(x)));
check("the email switches are in EmailPreferences", ["Api.setEventEmails", "Api.setMarketing"].every((x) => read("src/components/EmailPreferences.vue").includes(x)));
check("the devices sheet uses UiSheet as the last child of its root", /<UiSheet[\s\S]*<\/UiSheet>\s*<\/div>\s*<\/template>\s*<style/.test(read("src/components/DevicesSheet.vue")));

summary();
