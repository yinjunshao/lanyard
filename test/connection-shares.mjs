// What each person shares in a connection (worker/shares.js, migration 0034). The card owner shares the scanned card;
// the scanner picks one of their own cards and which of its links in the connect sheet. The other person, every list
// and the AI follow-up data only ever see that choice.
import { readFileSync } from "node:fs";
import { makeEnv, check, summary } from "./harness.mjs";
import { followupContext, followupData } from "../worker/ai/followup.js";

const T = await makeEnv();
const { client, env } = T;
const db = env.DB;

async function signup(name, ip, extra = {}) {
  const c = client({ ip });
  const r = await c.post("/api/profile", { name, acceptTerms: true, over18: true, mode: "student", course: "Maths", uni: "Test University", ...extra });
  if (r.status !== 201) throw new Error(r.text);
  const me = await c.get("/api/me");
  return { c, name, id: me.json.user.id, card: me.json.cards[0].cardId };
}

// Owen owns the card that gets scanned. Sam scans it and has two cards: General (every link) and Work (its own
// "What I do" and About).
const owen = await signup("Owen Owner", "10.34.0.1", { headline: "OWEN-HEADLINE", links: { LinkedIn: "https://linkedin.com/in/owen", GitHub: "https://github.com/owen" } });
const sam = await signup("Sam Scanner", "10.34.0.2", { headline: "SAM-GENERAL-HEADLINE", about: "SAM-GENERAL-ABOUT", tags: ["Robotics"],
  links: { LinkedIn: "https://linkedin.com/in/sam", Instagram: "https://instagram.com/sam", Site: "https://sam.example" } });
const work = await sam.c.post("/api/cards", { name: "Work", headline: "SAM-WORK-HEADLINE", about: "SAM-WORK-ABOUT", visibleLinks: ["LinkedIn", "Site"] });
const workId = work.json.cardId || work.json.id;
check("(set-up) Sam has a second card", work.status === 201 && !!workId, work.text);

console.log("\n# The scanner picks the card and the links");
const r1 = await sam.c.post("/api/connect", { cardId: owen.card, via: "qr", share: { cardId: workId, links: ["LinkedIn", "Instagram"] } });
const cn = r1.json.connectionId;
check("(set-up) connected", r1.status === 200 || r1.status === 201, r1.text);
const seenByOwen = (await owen.c.get(`/api/connections/${cn}`)).json.peer;
check("the owner sees the card the scanner picked, with its own What I do and About", seenByOwen.headline === "SAM-WORK-HEADLINE" && seenByOwen.about === "SAM-WORK-ABOUT" && seenByOwen.cardName === "Work", seenByOwen);
check("only the links the scanner kept, and only ones that are on that card (Instagram is not on Work, so it is dropped)", JSON.stringify(Object.keys(seenByOwen.links)) === '["LinkedIn"]', seenByOwen.links);
const listRow = (await owen.c.get("/api/connections")).json.connections.find((x) => x.id === cn);
check("the People list shows the same: the Work card, its headline-about and only LinkedIn", listRow.cardId === workId && listRow.peer.cardName === "Work" && listRow.peer.headline === "SAM-WORK-HEADLINE" && listRow.peer.about === "SAM-WORK-ABOUT" && JSON.stringify(Object.keys(listRow.peer.links)) === '["LinkedIn"]', listRow.peer);
const opened = (await owen.c.get(`/api/c/${workId}`)).json;
check("opening that card's page as the connection shows only the kept links too", JSON.stringify(Object.keys(opened.profile.links)) === '["LinkedIn"]', opened.profile.links);
const seenBySam = (await sam.c.get(`/api/connections/${cn}`)).json.peer;
check("the scanner sees the owner's scanned card with every link on it", Object.keys(seenBySam.links).sort().join() === "GitHub,LinkedIn", seenBySam.links);

console.log("\n# The sheet opens on what you already share");
const again = (await sam.c.get(`/api/c/${owen.card}`)).json.viewer.connection.myShare;
check("scanning them again shows your current card and links", again?.cardId === workId && JSON.stringify(again.links) === '["LinkedIn"]', again);
await sam.c.post("/api/connect", { cardId: owen.card, via: "qr", share: { cardId: workId, links: [] } });
check("unticking every link shares none", JSON.stringify((await owen.c.get(`/api/connections/${cn}`)).json.peer.links) === "{}");
await sam.c.post("/api/connect", { cardId: owen.card, via: "qr", share: { cardId: workId, links: ["LinkedIn", "Site"] } });
check("ticking every link on the card stores no list, so links added to the card later are shared too", db.raw.prepare("SELECT links FROM connection_shares WHERE connection_id = ? AND user_id = ?").get(cn, sam.id).links === null);

console.log("\n# Choices that are not yours are ignored");
const pat = await signup("Pat Peer", "10.34.0.3", { links: { LinkedIn: "https://linkedin.com/in/pat" } });
const r2 = await pat.c.post("/api/connect", { cardId: owen.card, via: "qr", share: { cardId: sam.card, links: ["LinkedIn"] } });
const cn2 = r2.json.connectionId;
check("a card that is not the scanner's is ignored: they share their own default card, as before", (await owen.c.get(`/api/connections/${cn2}`)).json.cardId === pat.card
  && !db.raw.prepare("SELECT 1 FROM connection_shares WHERE connection_id = ? AND user_id = ?").get(cn2, pat.id));
const g = client({ ip: "10.34.0.9" });
const r3 = await g.post("/api/connect", { cardId: owen.card, name: "Guest Gail", email: "gail@example.com", acceptTerms: true, over18: true, via: "link" });
check("a guest with no card of their own still connects with a name and (F45) an email", r3.status === 200 || r3.status === 201, r3.text);

console.log("\n# The AI follow-up sees both shared cards and nothing else");
{
  const ctxOwen = await followupContext(db, owen.id, cn);
  const dOwen = followupData(ctxOwen, { talkAbout: [], offer: [], useNote: false, extra: "" });
  check("for the owner: their card is the Work card Sam shared (its headline and about)", dOwen.them.card?.headline === "SAM-WORK-HEADLINE" && dOwen.them.card?.about === "SAM-WORK-ABOUT", dOwen.them);
  check("for the owner: Sam's General card, which Sam did not share, is not there", !JSON.stringify(dOwen).includes("SAM-GENERAL"), dOwen);
  check("for the owner: their own card is the one they shared", dOwen.me.card?.headline === "OWEN-HEADLINE", dOwen.me);
  const dSam = followupData(await followupContext(db, sam.id, cn), { talkAbout: [], offer: [], useNote: false, extra: "" });
  check("for the scanner: the owner's scanned card, and their own Work card", dSam.them.card?.headline === "OWEN-HEADLINE" && dSam.me.card?.headline === "SAM-WORK-HEADLINE", dSam);
  check("the General card's What I do never reaches the owner's screens either", !JSON.stringify([seenByOwen, listRow.peer, opened.profile]).includes("SAM-GENERAL"));
  check("no links reach the AI data from either card", !/https?:|linkedin|github|instagram/i.test(JSON.stringify([dOwen, dSam])));
}

console.log("\n# The sheet (source guard)");
{
  const sheet = readFileSync(new URL("../src/components/ConnectSheet.vue", import.meta.url), "utf8");
  const back = readFileSync(new URL("../src/components/ShareBack.vue", import.meta.url), "utf8");
  check("the sheet loads the sharing-back part only for someone with a card, and sends the choice", /if \(me\.profile\) import\("\.\/ShareBack\.vue"\)/.test(sheet) && /<component :is="ShareBack" v-if="ShareBack"/.test(sheet) && /share: share\.value/.test(sheet));
  check("it offers the card and each of its links as a toggle", /What you're sharing back/.test(back) && /:aria-pressed="picked\.includes\(k\)"/.test(back) && /role="radiogroup"/.test(back));
}

summary();
