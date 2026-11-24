// Card codes: permanent by default, random replace, Plus custom codes weekly.
import { readFileSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";
import { FOREVER, OLD_CODE_GRACE_MS, CODE_HOLD_MS, CUSTOM_EVERY_MS } from "../worker/codes.js";

const T = await makeEnv();
const { client, q1, env } = T;
let ip = 0;
async function signup(name) {
  const c = client({ ip: "10.9.0." + (++ip) });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, course: "CS", tags: ["design"] });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, id: me.json.user.id, card: me.json.cards[0] };
}
const lookup = (code) => client({ ip: "10.8.0." + (++ip) }).get("/api/code/" + code);
const plus = (id) => env.DB.raw.prepare("UPDATE users SET plan = 'plus', plan_until = NULL WHERE id = ?").run(id);
const back = (cardId, ms) => env.DB.raw.prepare("UPDATE cards SET code_changed_at = code_changed_at - ? WHERE id = ?").run(ms, cardId);

console.log("\n# Permanent codes");
const A = await signup("Alice");
check("a new card has a code and no expiry", A.card.code && !A.card.codeRotatesAt && A.card.codeNextChangeAt === null, A.card);
check("its code is registered forever", q1("SELECT valid_until FROM card_codes WHERE code = ?", A.card.code).valid_until === FOREVER);
check("the code opens the card", (await lookup(A.card.code)).json?.cardId === A.card.cardId);
const pub = await client({ ip: "10.7.0.1" }).get(`/api/c/${A.card.cardId}`);
check("the public card never includes the code", !("code" in pub.json) && !JSON.stringify(pub.json).includes(A.card.code));

// A card from before codes were permanent: expiring row, code_rotates_at set.
env.DB.raw.prepare("UPDATE cards SET code_rotates_at = ? WHERE id = ?").run(Date.now() - 1000, A.card.cardId);
env.DB.raw.prepare("UPDATE card_codes SET valid_until = ? WHERE code = ?").run(Date.now() + 1000, A.card.code);
const again = await A.c.get("/api/me");
check("an old rotating card keeps the same code", again.json.cards[0].code === A.card.code, again.json.cards[0].code);
check("…and it is made permanent", q1("SELECT valid_until FROM card_codes WHERE code = ?", A.card.code).valid_until === FOREVER
  && q1("SELECT code_rotates_at FROM cards WHERE id = ?", A.card.cardId).code_rotates_at === null);

console.log("\n# Replace with a random code");
const old = A.card.code;
const rep = await A.c.post(`/api/cards/${A.card.cardId}/rotate-code`);
check("replace gives a new code", rep.status === 200 && rep.json.code !== old, rep.json);
check("the old code stops working at once", (await lookup(old)).status === 404);
check("the new code works", (await lookup(rep.json.code)).json?.cardId === A.card.cardId);
for (let i = 0; i < 2; i++) await A.c.post(`/api/cards/${A.card.cardId}/rotate-code`);
check("replacing is limited to a few a day", (await A.c.post(`/api/cards/${A.card.cardId}/rotate-code`)).status === 429);
const B0 = await signup("Bea");
const steal = await B0.c.post(`/api/cards/${A.card.cardId}/rotate-code`);
check("you can't replace someone else's code", steal.status === 404);

console.log("\n# Custom codes (Plus)");
const B = await signup("Ben");
const free = await B.c.post(`/api/cards/${B.card.cardId}/custom-code`, { code: "BEN24" });
check("free accounts can't choose a code", free.status === 402 && free.json.code === "plus_required", free.json);
plus(B.id);
for (const [bad, why] of [["AB", "too short"], ["ABCDEFGHJ", "too long"], ["1234", "no letter"], ["ADMIN", "reserved"], ["SH1T", "blocked word"]]) {
  const r = await B.c.post(`/api/cards/${B.card.cardId}/custom-code`, { code: bad });
  check(`rejects a code that is ${why}`, r.status === 400, r.json);
}
const ok = await B.c.post(`/api/cards/${B.card.cardId}/custom-code`, { code: "ben-24" });
check("Plus can choose a code (lower case and dashes are tidied)", ok.status === 200 && ok.json.code === "BEN24", ok.json);
check("it opens the card", (await lookup("ben24")).json?.cardId === B.card.cardId);
const bme = (await B.c.get("/api/me")).json.cards[0];
check("the owner sees it as chosen, with the next change date", bme.code === "BEN24" && bme.codeCustom && bme.codeNextChangeAt > Date.now(), bme);
const soon = await B.c.post(`/api/cards/${B.card.cardId}/custom-code`, { code: "BENNY" });
check("only once a week", soon.status === 429 && soon.json.code === "too_soon", soon.json);

const C = await signup("Cat"); plus(C.id);
const taken = await C.c.post(`/api/cards/${C.card.cardId}/custom-code`, { code: "BEN24" });
check("someone else's code is taken", taken.status === 409, taken.json);
const takenRandom = await C.c.post(`/api/cards/${C.card.cardId}/custom-code`, { code: A.card.code });
// A random code made only of digits is refused as a chosen code (400) before the
// "taken" check runs. Either way it can't be claimed.
check("a held (retired) random code can't be claimed", takenRandom.status === (/^\d+$/.test(A.card.code) ? 400 : 409), takenRandom.json);

back(B.card.cardId, CUSTOM_EVERY_MS + 1000);
const change = await B.c.post(`/api/cards/${B.card.cardId}/custom-code`, { code: "BENNY" });
check("after a week, Plus can change it", change.status === 200 && change.json.code === "BENNY", change.json);
check("the previous custom code still works for a while", (await lookup("BEN24")).json?.cardId === B.card.cardId);
const row = q1("SELECT valid_until FROM card_codes WHERE code = 'BEN24'");
check("…for about 30 days", Math.abs(row.valid_until - (Date.now() + OLD_CODE_GRACE_MS)) < 60e3, row);
const cl = await C.c.post(`/api/cards/${C.card.cardId}/custom-code`, { code: "BEN24" });
check("…and nobody else can take it meanwhile", cl.status === 409);
env.DB.raw.prepare("UPDATE card_codes SET valid_until = ? WHERE code = 'BEN24'").run(Date.now() - 1000);
check("once its grace ends it stops working", (await lookup("BEN24")).status === 404);
const cl2 = await C.c.post(`/api/cards/${C.card.cardId}/custom-code`, { code: "BEN24" });
check("but is still held from others for months", cl2.status === 409);
check("hold period is long", CODE_HOLD_MS >= 90 * 24 * 3600e3);

back(B.card.cardId, CUSTOM_EVERY_MS + 1000);
const backTo = await B.c.post(`/api/cards/${B.card.cardId}/custom-code`, { code: "BEN24" });
check("the owner can go back to their own old code", backTo.status === 200 && (await lookup("BEN24")).json?.cardId === B.card.cardId, backTo.json);

env.DB.raw.prepare("UPDATE users SET plan = 'free' WHERE id = ?").run(B.id);
check("a chosen code keeps working if Plus lapses", (await lookup("BEN24")).json?.cardId === B.card.cardId);

console.log("\n# Event codes don't clash");
const { uniqueCode } = await import("../worker/db.js");
const rnd = Math.random;
let calls = 0;
// Force the first attempt to hit an existing card code: put a 5-char card code in place.
env.DB.raw.prepare("INSERT INTO card_codes (code, card_id, valid_until) VALUES ('ZZ9ZZ', ?, ?)").run(C.card.cardId, FOREVER);
const orig = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
globalThis.crypto.getRandomValues = (arr) => {
  calls++;
  if (calls === 1 && arr.length === 5) { const map = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; "ZZ9ZZ".split("").forEach((ch, i) => (arr[i] = map.indexOf(ch))); return arr; }
  return orig(arr);
};
const evc = await uniqueCode(env.DB, "events", 5);
globalThis.crypto.getRandomValues = orig;
Math.random = rnd;
check("an event code never matches a card code", evc !== "ZZ9ZZ" && evc.length === 5, evc);

console.log("\n# Home screen");
const H = await signup("Hal");
check("a new account isn't marked as installed", (await H.c.get("/api/me")).json.user.appInstalled === false);
check("opening from the home screen marks it", (await H.c.post("/api/me/installed")).status === 200
  && (await H.c.get("/api/me")).json.user.appInstalled === true);
check("marking needs an account", (await client({ ip: "10.6.0.1" }).get("/api/me")).json.user === null);

console.log("\n# F33 Card code in the card editor");
const src = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const strip = (t) => t.replace(/<style[\s\S]*$/, "").replace(/\/\/.*$/gm, "");
const codeUi = strip(src("src/components/CardCode.vue")), myCard = strip(src("src/views/MyCard.vue")), cardsUi = strip(src("src/views/Cards.vue"));
check("the code panel is one component with every part of it", ["Card code", "Choose your own code", "Replace with a random code", "Tap again: your current code stops working straight away", "Want a code you choose, like your name?", "You can choose a new code on", "4 to 8 letters or numbers", "Chosen by you"].every((t) => codeUi.includes(t)));
check("it acts on the card it is given, through the same two API calls", /api\(`\/api\/cards\/\$\{props\.card\.cardId\}\/rotate-code`, "POST"\)/.test(codeUi) && /api\(`\/api\/cards\/\$\{props\.card\.cardId\}\/custom-code`, "POST", \{ code: customDraft\.value \}\)/.test(codeUi) && /defineProps\(\{ card:/.test(codeUi));
check("the card editor in My cards draws it, once, for the card being edited", (cardsUi.match(/<CardCode /g) || []).length === 1 && /<CardCode :card="c" \/>/.test(cardsUi) && /<UiReveal :open="editingId === c\.cardId"[^>]*>\s*<div[^>]*>[\s\S]*<CardCode :card="c" \/>/.test(cardsUi));
check("My card has no code controls any more", !/rotateCode|customCode|Choose your own code|Replace with a random code|aria-label="Card code"|CardCode/.test(myCard));
check("My card has the note straight after the badge hint, before anything else, and a quiet code line with Change in My cards",
  myCard.indexOf("Hold the card to show it") < myCard.indexOf("Change in My cards") && myCard.indexOf("Change in My cards") < myCard.indexOf("Note for the next person")
  && myCard.indexOf("Note for the next person") < myCard.indexOf('aria-label="Feedback"')
  && /query: \{ edit: card\.cardId, section: 'code' \}/.test(myCard));
check("My cards opens that card's editor from the address (so a refresh and Back work) and scrolls to its code", /route\.query\.edit/.test(cardsUi) && /route\.query\.section === "code"/.test(cardsUi) && /card-code-\$\{id\}/.test(cardsUi) && /id="`card-code-\$\{card\.cardId\}`"|:id="`card-code-\$\{card\.cardId\}`"/.test(codeUi));
const two = await signup("Two");
const second = await two.c.post("/api/cards", { name: "Second", theme: "default" });
check("a second card is made", second.status === 201, second.text);
const cardsNow = (await two.c.get("/api/me")).json.cards;
const [c1, c2] = cardsNow;
const rep2 = await two.c.post(`/api/cards/${c1.cardId}/rotate-code`);
const after = (await two.c.get("/api/me")).json.cards;
check("replacing one card's code changes that card only", rep2.status === 200 && after.find((c) => c.cardId === c1.cardId).code === rep2.json.code && after.find((c) => c.cardId === c2.cardId).code === c2.code);

summary();
