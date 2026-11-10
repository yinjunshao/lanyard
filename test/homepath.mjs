// F02: the lanyard. logo goes to My card when signed in. The browser steps are in
// the F02 plan note; this checks the hint logic and guards the wiring in source.
import { readFileSync, readdirSync } from "node:fs";
import { check, summary } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

console.log("\n# The signed-in hint");
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { hasSignedInHint, setSignedInHint } = await import("../src/lib/signedin.js");
check("no hint on a new browser", hasSignedInHint() === false);
setSignedInHint(true);
check("the hint can be set", hasSignedInHint() === true && store.get("lanyard-signed-in") === "1");
setSignedInHint(false);
check("the hint can be cleared", hasSignedInHint() === false && !store.has("lanyard-signed-in"));
globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
let threw = false;
try { setSignedInHint(true); setSignedInHint(false); hasSignedInHint(); } catch { threw = true; }
check("blocked storage never throws", !threw && hasSignedInHint() === false);

console.log("\n# Wiring (source guards)");
const api = read("src/lib/api.js");
check("logout clears the hint", /logout:[^\n]*finally \{ setSignedInHint\(false\)/.test(api));
check("account deletion clears the hint", /deleteAccount:[^\n]*setSignedInHint\(false\)/.test(api));
const st = read("src/lib/store.js");
check("signed in means a card or a saved account", /me\.profile \|\| me\.user\?\.claimed/.test(st));
check("homePath is /app when signed in, / otherwise, and the host home / on the host site (F10)",
  /function homePath\(\)\s*\{\s*if \(ON_HOST_SITE\) return "\/";[\s\S]*"\/app" : "\/"/.test(st));
check("refreshMe keeps the hint in step with /api/me", /me\.loaded = true;\s*setSignedInHint\(isSignedIn\(\)\)/.test(st));
const router = read("src/router/index.js");
check("'/' goes to /app when the hint is set, unless ?about=1",
  router.includes('to.path === "/" && !to.query.about && hasSignedInHint()) return "/app"'));
check("the redirect does not wait on /api/me", router.indexOf("hasSignedInHint()) return") < router.indexOf("await ensureMe()"));

const wordmarks = ["src/App.vue", "src/views/PublicCard.vue", "src/views/Privacy.vue", "src/views/Terms.vue",
  "src/views/PrivacyRequest.vue", "src/views/Redeem.vue", "src/views/SignIn.vue", "src/views/Hosts.vue"];
for (const f of wordmarks) {
  const s = read(f);
  check(`${f}: the logo uses homePath()`, /:to="homePath\(\)"[^>]*class="wordmark/.test(s) && /import \{[^}]*homePath[^}]*\} from "[./]+\/lib\/store"/.test(s));
}
const stray = [];
for (const dir of ["src", "src/views", "src/components"]) {
  for (const f of readdirSync(new URL("../" + dir, import.meta.url)).filter((n) => n.endsWith(".vue"))) {
    if (/<router-link[^>]*\bto="\/"[^>]*class="wordmark/.test(read(`${dir}/${f}`))) stray.push(`${dir}/${f}`);
  }
}
check("no logo is still a fixed link to /", stray.length === 0, stray);
check("Settings has an About Lanyard link to /?about=1", read("src/views/settings/SettingsHelp.vue").includes('to="/?about=1"'));

summary();
