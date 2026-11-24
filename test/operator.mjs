// F50: the company that runs Lanyard is named on the legal pages and in the footers, and nothing more.
// Also the one Terms and Privacy version bump for F45 to F50, and that people are asked again.
// Run: node test/operator.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8").replace(/\r\n/g, "\n");
const flat = (s) => s.replace(/\s+/g, " ").trim();
const NAME = "Quantlink Investment Service Company Limited";

// Every file under a folder, as [path, text].
const files = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? files(p) : [[p, readFileSync(p, "utf8")]];
});
const src = files(join(root, "src"));
const worker = files(join(root, "worker"));

const contact = read("src/lib/contact.js");
const privacy = read("src/views/Privacy.vue");
const terms = read("src/views/Terms.vue");
const pages = { Landing: read("src/views/Landing.vue"), Hosts: read("src/views/Hosts.vue"), Terms: terms, Privacy: privacy };

// Section 1 of a legal page: from its first heading to the next one of the same kind.
const section1 = (s, tag) => {
  const a = s.indexOf(`<${tag}>1.`);
  const b = s.indexOf(`<${tag}>2.`, a);
  return a < 0 || b < 0 ? "" : s.slice(a, b);
};
const plain = (s) => flat(s.replace(/\{\{ OPERATOR \}\}/g, NAME).replace(/<[^>]+>/g, " ").replace(/\s+([.,])/g, "$1"));

console.log("\n# The name is in one place, spelt as registered");
check("OPERATOR is exported from src/lib/contact.js with that spelling and case", contact.includes(`export const OPERATOR = "${NAME}";`));
check("no other file in src/ writes the name out (one place)", src.every(([p, t]) => p.endsWith("contact.js") || !t.includes(NAME)));

console.log("\n# Privacy section 1 and Terms section 1");
const p1 = plain(section1(privacy, "h2"));
const t1 = plain(section1(terms, "h3"));
check("Privacy section 1 says it as the owner worded it",
  p1.includes(`Lanyard is run by ${NAME} ("Lanyard", "we"), which is the controller of the personal data described here under the UK GDPR and the Data Protection Act 2018. Contact us at {{ CONTACT }} for anything about your data.`), p1);
check("…and the contact there is the legal address from contact.js", /<a :href="`mailto:\$\{CONTACT\}`">/.test(section1(privacy, "h2")) && /const CONTACT = LEGAL_EMAIL/.test(privacy) && /LEGAL_EMAIL = "legal@lanyd\.fyi"/.test(contact));
check("Terms section 1 says it as the owner worded it", t1.includes(`It is run by ${NAME} ("Lanyard", "we", "us"). For help using Lanyard, email`), t1);
check("the ICO complaint line is kept", /ico\.org\.uk/.test(privacy));
check("Terms section 14 still says England and Wales", /England and Wales/.test(terms.slice(terms.indexOf("<h3>14."), terms.indexOf("<h3>15."))));

console.log("\n# Name only: no address, number or person (checked by shape, nothing written down)");
const onlyOurs = (s) => (s.match(/[\w.+-]+@[\w.-]+/g) || []).every((e) => e.endsWith("@lanyd.fyi"));
for (const [label, s] of [["Privacy section 1", section1(privacy, "h2")], ["Terms section 1", section1(terms, "h3")], ["contact.js", contact]]) {
  check(`${label}: only @lanyd.fyi addresses, no run of 6 or more digits`, onlyOurs(s) && !/\d{6,}/.test(s), s.match(/\d{6,}/));
}
for (const [name, s] of Object.entries(pages)) check(`${name} has no ADDRESS constant`, !/\bADDRESS\b/.test(s));
check("the old operator name and postcode appear nowhere in src/ or worker/", [...src, ...worker].every(([, t]) => !/ARCK Softworks/i.test(t) && !/WC1E\s*6BT/i.test(t)));
check("the footer lines name no place of incorporation", Object.values(pages).every((s) => !/run by \{\{ OPERATOR \}\}[^.<]*(Hong Kong|registered|incorporated)/i.test(s)));
check("the 'bracketed items' comments are gone from the legal pages", !/Bracketed items/.test(privacy + terms));

console.log("\n# The footer line, small and muted, on four pages");
const FOOT = /<p class="small muted operator"[^>]*>Lanyard is run by \{\{ OPERATOR \}\}\.<\/p>/;
for (const [name, s] of Object.entries(pages)) {
  check(`${name} shows the footer line from the shared constant`, FOOT.test(s) && /import \{[^}]*\bOPERATOR\b[^}]*\} from "\.\.\/lib\/contact"/.test(s));
}

console.log("\n# One Terms and Privacy version for F45 to F50");
const legal = read("worker/legal.js");
check("TERMS_VERSION is 2026-11-22", /TERMS_VERSION = "2026-11-22"/.test(legal));
check("both pages say when they were last updated (Terms 22 November 2026; the Privacy Policy 24 November 2026, F60's section 8f, version not bumped)", /UPDATED = "24 November 2026"/.test(privacy) && /UPDATED = "22 November 2026"/.test(terms));

const T = await makeEnv();
const { client, q1, env } = T;
const OLD = "2026-11-13";

console.log("\n# A person who agreed to the old version is asked again");
const c = client({ ip: "10.50.0.1" });
const r = await c.post("/api/profile", { name: "Alma", acceptTerms: true, over18: true });
const me0 = (await c.get("/api/me")).json;
const id = me0.user.id;
check("signing up records the current version", r.status === 201 && me0.user.termsAccepted === true && !!q1("SELECT 1 x FROM consents WHERE user_id = ? AND scope = 'terms:2026-11-22' AND granted = 1", id));
env.DB.raw.prepare("UPDATE consents SET scope = ? WHERE user_id = ? AND scope LIKE 'terms:%'").run(`terms:${OLD}`, id);
const me1 = (await c.get("/api/me")).json;
check("with only the old version agreed, /api/me says to ask again", me1.user.termsAccepted === false && me1.user.needsTerms === true && me1.user.termsVersion === "2026-11-22", me1.user);
const acc = await c.post("/api/terms/accept", { accept: true, over18: true });
const me2 = (await c.get("/api/me")).json;
check("agreeing records the new version and clears the ask", acc.status === 200 && acc.json.version === "2026-11-22" && me2.user.termsAccepted === true && me2.user.needsTerms === false);

console.log("\n# A host is asked again too (the Host Terms use the same version)");
const h = client({ ip: "10.50.0.2", site: "host" });
const email = "host-op@work.example.com";
const b = await becomeHost(h, { email });
const ready = (await h.get("/api/host/me")).json;
check("a new host is through setup", b.terms.status === 200 && ready.step === "ready", ready.step);
env.DB.raw.prepare("UPDATE host_accounts SET terms_version = ? WHERE email = ?").run(OLD, email);
const hm = (await h.get("/api/host/me")).json;
check("with the old version agreed, the host is sent back to the terms step", hm.step === "terms" && hm.account.termsAccepted === false, hm.step);
const ha = await h.post("/api/host/terms", { accept: true });
const hm2 = (await h.get("/api/host/me")).json;
check("agreeing again puts them back in the portal", ha.status === 200 && hm2.step === "ready" && hm2.account.termsAccepted === true, hm2.step);
check("the host's agreement is logged under the new host_terms scope", !!q1("SELECT 1 x FROM consent_log WHERE scope = 'host_terms:2026-11-22'"));

summary();
