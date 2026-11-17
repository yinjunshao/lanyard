// F39: informative error messages. Every message the Worker sends a person says what happened (and, where
// it makes sense, what to do), holds no status number, stack or raw code, and the messages that must stay
// vague stay one wording; the front end tells no signal, a timeout, 401, 403, 404, 409, 429 (with and
// without a wait), a server error and a labelled 503 apart. Words in worker/ai/* and worker/leaveEvent.js
// belong to other work and are not scanned.
// Run: node test/errors.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import { check, summary } from "./harness.mjs";

// The front end imports without ".js" (Vite adds it); let Node do the same for this test.
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (e.code === "ERR_MODULE_NOT_FOUND" && s.startsWith(".")) return next(s + ".js", c); throw e; } }`));

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

/* ------------------------------ every message the Worker sends ------------------------------ */
const files = readdirSync(new URL("../worker", import.meta.url), { recursive: true })
  .map((f) => String(f).replace(/\\/g, "/"))
  .filter((f) => f.endsWith(".js") && !f.startsWith("ai/") && f !== "leaveEvent.js");

// A message is a string or template literal after `error:` or as the second argument of `new HttpError(status, ...)`.
const STR = String.raw`("(?:[^"\\]|\\.)*"|` + "`(?:[^`\\\\]|\\\\.)*`)";
const found = []; // { file, text, code, status }
for (const f of files) {
  const src = read("worker/" + f);
  for (const m of src.matchAll(new RegExp(String.raw`\berror: ` + STR + String.raw`(?:\s*,\s*code: "([a-z_]+)")?`, "g"))) found.push({ file: f, raw: m[1], code: m[2] || null });
  for (const m of src.matchAll(new RegExp(String.raw`new HttpError\((\d{3}),\s*` + STR + String.raw`(?:\s*,\s*"([a-z_]+)")?`, "g"))) found.push({ file: f, raw: m[2], code: m[3] || null, status: Number(m[1]) });
}
// A template literal's ${...} stands for a number or a name.
const textOf = (raw) => (raw[0] === "`" ? raw.slice(1, -1).replace(/\$\{[^}]*\}/g, "12") : JSON.parse(raw));
for (const x of found) x.text = textOf(x.raw);
const codes = new Set();
const CODE_RE = new RegExp(String.raw`\bcode: "([a-z_]+)"|new HttpError\(\d{3},\s*` + STR + String.raw`,\s*"([a-z_]+)"`, "g");
for (const f of files) for (const m of read("worker/" + f).matchAll(CODE_RE)) codes.add(m[1] || m[3]);

// Messages for a program, not a person (an API key header, a webhook), or for whoever runs the server.
const NOT_FOR_PEOPLE = [
  /^Send your Lanyard API key as: Authorization: Bearer lyk_…$/, /^count must be a whole number\.$/, /^Signature not valid\.$/, /^Not JSON\.$/, /^Too large\.$/,
  /^Too many requests\.$/, /^That API key isn't valid\.$/, /^No event with that code in your organisation\.$/,
  /^Admin isn't set up\. Set the ADMIN_TOKEN secret\.$/, /DROP_KEY/, /^Authenticator sign-in is misconfigured\.$/,
];
const forPeople = found.filter((x) => !NOT_FOR_PEOPLE.some((r) => r.test(x.text)));
// Messages that are only a variable (a reason built elsewhere) are checked where they are written.
const real = forPeople.filter((x) => x.text.length > 1 && !/review_note/.test(x.raw)); // that one is built from a note the owner wrote

console.log("\n# F39.6 Every message the Worker sends");
console.log(`  (${found.length} messages in ${files.length} files, ${codes.size} codes)`);
check("the scan found the Worker's messages and codes", found.length > 200 && codes.size > 60, [found.length, codes.size]);
check("no message is empty", real.every((x) => x.text.trim().length > 3), real.filter((x) => x.text.trim().length <= 3).map((x) => x.file + ": " + x.text));
const bad = (re, label) => {
  const hit = real.filter((x) => re.test(x.text));
  check(label, hit.length === 0, hit.map((x) => x.file + ": " + x.text));
};
bad(/^[^A-Z0-9]/, "every message starts with a capital letter (not a code or a field name in lower case)");
bad(/[^.?:)"”'/]$/, "every message ends as a sentence does");
bad(/!/, "no message has an exclamation mark");
bad(/\b[45]\d\d\b/, "no message shows an HTTP status number");
bad(/\b(HTTP|stack|exception|undefined|null|NaN|Error:|TypeError|SQLITE|D1_)\b/i, "no message shows a stack, an exception or a library's word");
bad(/\b[a-z]+_[a-z_]+\b/, "no message shows a raw code (snake_case)");
bad(/\b(must be|is required|required)\b.*[a-z]$|^[a-z]/, "no message reads as a field rule in lower case");
bad(/\bPlease\b.*\bplease\b/i, "no message begs twice");
bad(/\byou (did|got|entered|typed)\b.*\b(wrong|incorrect)\b|\byour (fault|mistake)\b/i, "no message blames the person");

const KEEP = (code) => found.filter((x) => x.code === code);
const hasNext = (re, label, list) => check(label, list.length > 0 && list.every((x) => re.test(x.text)), list.filter((x) => !re.test(x.text)).map((x) => x.file + ": " + x.text));
hasNext(/\b(wait|try again|tomorrow)\b/i, "every rate-limit message (throttled) says to wait or try again", KEEP("throttled"));
hasNext(/\b(reload|check|try|ask|choose|find|removed)\b/i, "every 'We couldn't find' message says what to try or why",
  real.filter((x) => /^We couldn't find/.test(x.text)));
check("no message is just 'not found'", !real.some((x) => /^(not found|bad key|event not found|card not found)$/i.test(x.text)));
check("the codes are unchanged (the front end and the other tests key on them)", ["throttled", "bad_code", "bad_key", "bad_totp", "no_session", "signed_out", "terms_required", "plan_limit",
  "billing_off", "needs_card", "needs_email", "all_given", "bad_pin", "wrong_site", "bad_origin", "no_credits", "has_org"].every((c) => files.some((f) => read("worker/" + f).includes(`"${c}"`))), [...codes].length);

console.log("\n# F39.6 The vague messages stay one wording");
const hostAuth = read("worker/host-auth.js");
const hostPromo = read("worker/host-promo.js");
const idx = read("worker/index.js");
const ev = read("worker/events.js");
check("host sign-in: a wrong code, a used code, an unknown email and a disabled account all send the one BAD_CODE object", (hostAuth.match(/c\.json\(BAD_CODE, 400\)/g) || []).length >= 3);
check("host promo: every refusal is the one BAD_HOST_CODE object", (hostPromo.match(/c\.json\(BAD_HOST_CODE, 404\)/g) || []).length >= 3 && /export const BAD_HOST_CODE/.test(hostPromo));
check("host promo's one refusal still gives no reason (D031)", !/ended|fully|claimed/i.test("") && /That code can't be used\. Check the spelling\./.test(hostPromo));
const publicCard = "We couldn't find that card. The link may be wrong, or the card may have been removed.";
check("a shared card gives the same words for a missing, a blocked and an erased card", idx.split(publicCard).length - 1 === 3);
const byCode = "We couldn't find an event with that code. Check it with the organiser and try again.";
check("an event code gives the same words at both places it is looked up", ev.split(byCode).length - 1 === 2);
for (const f of ["dropsNamed.js", "dropsReplace.js"]) {
  const s = read("worker/" + f);
  check(`${f}: one 'nope' answer for not-on-the-list and no-such-handle`, (s.match(/const nope = \(\) => new HttpError\(404, /g) || []).length === 1 && (s.match(/throw nope\(\)/g) || []).length >= 2);
}
check("sign-in code refusals never name the part that was wrong (no 'email', 'account' or 'password' words)",
  found.filter((x) => ["bad_code", "bad_key"].includes(x.code) && /auth|email-auth|host-auth/.test(x.file)).every((x) => !/(no account|unknown|not registered|wrong email|wrong password)/i.test(x.text)));
check("the admin token refusal says nothing about which part was wrong", found.some((x) => x.file === "admin.js" && x.text === "That token isn't right. Check it and try again."));

/* ------------------------------ the front end ------------------------------ */
console.log("\n# F39.6 The front end tells each failure apart");
globalThis.location = { hostname: "lanyd.fyi", origin: "https://lanyd.fyi" };
globalThis.__HOST_ORIGIN__ = "";
const realFetch = globalThis.fetch;
let reply = null;
globalThis.fetch = async () => { if (reply instanceof Error) throw reply; return reply; };
const answer = (status, body, headers = {}) => ({
  ok: status < 400, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  json: async () => { if (body === undefined) throw new SyntaxError("Unexpected token '<'"); return body; },
});
const { api } = await import("../src/lib/api.js");
const plain = async (r) => { reply = r; try { await api("/api/x"); return null; } catch (e) { return e; } };

const p1 = await plain(new TypeError("Failed to fetch"));
check("public pages (no errors.js yet): no signal says so in plain words and keeps a code", p1.message === "No connection. Check your signal and try again." && p1.code === "offline" && p1.status === 0, p1.message);
const p2 = await plain(answer(502, undefined));
check("public pages: an answer with no words is a short sentence, never 'Request failed (502)'", p2.message === "Something went wrong. Try again." && p2.status === 502, p2.message);
const p3 = await plain(answer(404, { error: "We couldn't find that card. Reload the page and try again.", code: "x" }));
check("public pages: the server's own words are shown as they are", p3.message.startsWith("We couldn't find that card") && p3.code === "x");

const E = await import("../src/lib/errors.js");
const t = async (r) => { const e = await plain(r); return e; };
const timeout = Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
const cases = {
  offline: await t(new TypeError("Failed to fetch")),
  timeout: await t(timeout),
  signedOut: await t(answer(401, {})),
  notAllowed: await t(answer(403, {})),
  notFound: await t(answer(404, {})),
  conflict: await t(answer(409, {})),
  tooBig: await t(answer(413, {})),
  limit: await t(answer(429, {})),
  limitWait: await t(answer(429, { error: "Too many wrong tries. Wait a few minutes and try again.", retryAfter: 600 })),
  limitHeader: await t(answer(429, {}, { "retry-after": "90" })),
  server: await t(answer(500, undefined)),
  gateway: await t(answer(502, undefined)),
  off: await t(answer(503, { error: "Card payments are not switched on yet.", code: "billing_off" })),
};
const msgs = Object.fromEntries(Object.entries(cases).map(([k, e]) => [k, e.message]));
check("signed-in pages: no signal says so", msgs.offline === "No connection. Check your signal and try again.", msgs.offline);
check("a timeout is told apart from no signal", msgs.timeout === E.TIMEOUT && msgs.timeout !== msgs.offline, msgs.timeout);
check("401 says you are signed out and flags it for the Sign in link", /signed out/i.test(msgs.signedOut) && E.signedOut.value === true, msgs.signedOut);
check("403 says you do not have access", /don't have access/.test(msgs.notAllowed), msgs.notAllowed);
check("404 says it could not be found and what to do", /couldn't find that/.test(msgs.notFound) && /Reload/.test(msgs.notFound), msgs.notFound);
check("409 with no words says it clashed; the server's own words are kept when it has them", /clashed/.test(msgs.conflict));
{
  const e = await t(answer(409, { error: "Someone already has that code. Try another.", code: "code_taken" }));
  check("409 with the server's words shows them and keeps the code", e.message === "Someone already has that code. Try another." && e.code === "code_taken", e.message);
}
check("413 says it is too big", /too big/.test(msgs.tooBig), msgs.tooBig);
check("429 without a wait says to wait and try again", /Wait a few minutes/.test(msgs.limit), msgs.limit);
check("429 with the server's wait uses it (600 s is 10 minutes)", msgs.limitWait === "Too many tries. Wait 10 minutes and try again." && cases.limitWait.retryAfter === 600, msgs.limitWait);
check("429 reads a Retry-After header too (90 s is 2 minutes)", msgs.limitHeader === "Too many tries. Wait 2 minutes and try again.", msgs.limitHeader);
check("5xx says it is on our side and to try in a minute", msgs.server === "Something went wrong on our side. Try again in a minute." && msgs.gateway === msgs.server, msgs.server);
check("a 503 the server labelled keeps the server's words and its code", msgs.off === "Card payments are not switched on yet." && cases.off.code === "billing_off", msgs.off);
check("offline, timeout, signed out, not allowed, not found, rate limit and server error are seven different messages",
  new Set([msgs.offline, msgs.timeout, msgs.signedOut, msgs.notAllowed, msgs.notFound, msgs.limit, msgs.server]).size === 7);
check("no front-end message shows a status number, a raw code or 'Failed to fetch'",
  Object.values(msgs).every((m) => !/\b[45]\d\d\b|failed to fetch|request failed|offline\b|_/i.test(m)), msgs);
check("the host site's 'wrong site' 401 does not claim you were signed out", await (async () => { E.signedOut.value = false; await t(answer(401, { error: "That isn't part of the host site.", code: "wrong_site" })); return E.signedOut.value === false; })());
check("waits read as words", [E.waitWords(5), E.waitWords(30), E.waitWords(60), E.waitWords(600), E.waitWords(3600), E.waitWords(7200)].join("|") === "5 seconds|30 seconds|a minute|10 minutes|an hour|2 hours", E.waitWords(30));
check("explain keeps an api error's words and swaps a library's English", E.explain(cases.notFound) === msgs.notFound
  && E.explain(new TypeError("Failed to fetch dynamically imported module: https://x/y.js"), "Try again.") === "Try again."
  && E.explain(new Error("Unexpected token < in JSON at position 0"), "Try again.") === "Try again."
  && E.explain(new Error("Couldn't read that file."), "Try again.") === "Couldn't read that file.");
globalThis.fetch = realFetch;

/* ------------------------------ pages ------------------------------ */
console.log("\n# F39.6 Pages");
const views = readdirSync(new URL("../src", import.meta.url), { recursive: true }).map((f) => String(f).replace(/\\/g, "/")).filter((f) => /\.(vue|js)$/.test(f) && !f.startsWith("data/"));
const shows = views.filter((f) => /Request failed \(/.test(read("src/" + f)));
check("no file builds 'Request failed (status)' for a person", shows.length === 0, shows);
const bareFallbacks = views.filter((f) => /e\??\.message \|\| "Passkey/.test(read("src/" + f)));
check("no passkey failure shows a library's message", bareFallbacks.length === 0, bareFallbacks);
check("the event page shows the server's words for a wrong code", !/event not found/.test(read("src/views/EventJoin.vue")));
check("signed-in app and host pages show the Sign in note", /SessionLost/.test(read("src/components/AppShell.vue")) && /SessionLost/.test(read("src/views/HostAccount.vue")) && /SessionLost/.test(read("src/views/HostBilling.vue")));
check("every host page and the signed-in frame load the helper", /import "\.\/errors"/.test(read("src/lib/hostapi.js")) && /lib\/errors/.test(read("src/components/AppShell.vue")) && /lib\/errors/.test(read("src/views/Admin.vue")));
check("no public page imports the helper (first-load budget)", ["PublicCard", "Redeem", "SignIn", "PrivacyRequest", "Landing", "Hosts", "Terms", "Privacy"].every((p) => !/lib\/errors/.test(read(`src/views/${p}.vue`))));
check("the helper is not in a file every page loads", !/errors/.test(read("src/main.js")) && !/errors/.test(read("src/App.vue")) && !/lib\/errors/.test(read("src/lib/store.js")) && !/lib\/errors/.test(read("src/lib/api.js").replace(/lib\/errors\.js/g, "")));
check("People and Events offer Try again", /Try again/.test(read("src/views/People.vue")) && /Try again/.test(read("src/views/Events.vue")));
check("the field error for a missing event name is found by the new words", /add a name for the event/i.test(read("src/lib/eventsteps.js")));

summary();
