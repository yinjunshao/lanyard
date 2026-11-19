// F22: AI follow-up drafts. Two routes for a person looking at someone they are connected with.
//   GET  /api/ai/followup/:connectionId   what the composer offers: topics from THEIR side, your own tags, whether you
//                                         have a note, your first name, and what is left of today's allowance
//   POST /api/ai/followup/:connectionId   { channel, tone, goal, talkAbout[], offer[], useNote, extra, regenerate }
//                                         returns { fallback:false, draft:{ subject?, body }, cached, remaining }
//                                         or      { fallback:true, reason, message, allowance }  (the page then shows its template)
//
// What the model is given (AI Safety and Cost Plan, rule 1: only what the asker may already see). All of it is read from
// the database for this connection, never taken from text the browser sends. The browser only says WHICH of the offered
// items it wants; anything it names that was not offered is dropped.
//   them     first name, and the line under their name as their card shows it (course and institution, or role at company)
//   them.card  what the card THEY chose to share with you shows: what they do (headline), about, tags, up to 3 projects
//              (title and one line) and the card's note. Exactly what you can already read on their card in People.
//   met      the event this connection was made at (name), the date, and how it was made (QR code, code or link)
//   talkAbout  the chosen items from: their "come to me for" tags on the card they shared with you, and the shared
//              ground (worker/inCommon.js). Up to 3.
//   me       your first name
//   me.card  the same fields from the card YOU chose to share with them (worker/shares.js), so they are things they can
//            see too: the draft never tells them something about you that you did not share with them
//   offer    the chosen items from your own tags. Up to 2.
//   myNote   your own private note about them, only if you asked for it
//   extra    up to 300 characters you typed
// Never: either person's email, links or photos, any field the shared card hides (another card's headline or about, a
// link left out), any other connection, anything about a third party. Every string is cleaned (no links, emails, markup, hidden characters).
//
// The draft is plain text for a person to read, edit and send themselves. Lanyard sends nothing.
import { Hono } from "hono";
import { one, run } from "../db.js";
import { requireUser } from "../session.js";
import { isBlocked } from "../blocks.js";
import { bump, HOUR } from "../ratelimit.js";
import { sharedCard, sharedGround, visibleSide } from "../inCommon.js";
import { cardFacts } from "../../src/lib/cardmerge.js";
import { looksLikeInstruction } from "./peopleSearch.js";
import { subtitleOf } from "../../src/lib/profile.js";
import { callModel, allowanceFor } from "./client.js";
import { cleanText, CAPS } from "./sanitize.js";
import { dayOf } from "./config.js";
import { FOLLOWUP_SCHEMA, MAX_TOKENS, PROMPT_VERSION, followupSystem, refineFollowup, isChannel, isGoal, isTone } from "./prompts/followup.js";

export const followupApp = new Hono();

// Counts only (migration 0026): which of these happened today, for the admin page. No person, connection or text.
export const COUNT_KINDS = ["drafted_ai", "drafted_template", "copied", "opened", "marked"];
export const countKind = (db, kind, ts = Date.now()) => run(db,
  "INSERT INTO followup_counts (day, kind, n) VALUES (?, ?, 1) ON CONFLICT(day, kind) DO UPDATE SET n = n + 1", dayOf(ts), kind);

export const MAX_TALK = 3;
export const MAX_OFFER = 2;
const MAX_TAGS = 8;

const HOW = { qr: "I scanned their QR code", code: "I typed in their code", link: "I opened their link" };
const first = (name) => cleanText(String(name || "").trim().split(/\s+/)[0], 40);
const dateOf = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

// Distinct, cleaned, in order, at most `max`. Same words in a different case count once.
function distinct(list, cap, max) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = cleanText(raw, cap);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Everything the composer and the draft are built from, for one connection of this person. null if it is not theirs
 * or the pair is blocked. Reads only; the shared-ground rule and the card each side shared are the F16 ones.
 */
export async function followupContext(db, meId, connectionId) {
  const cn = await one(db, "SELECT * FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)", connectionId, meId, meId);
  if (!cn) return null;
  const peerId = cn.user_a === meId ? cn.user_b : cn.user_a;
  if (await isBlocked(db, meId, peerId)) return null;
  const [mine, theirs] = await Promise.all([
    one(db, "SELECT * FROM profiles WHERE user_id = ?", meId),
    one(db, "SELECT * FROM profiles WHERE user_id = ?", peerId),
  ]);
  if (!theirs) return null;
  const [myCard, theirCard, ground, note, event] = await Promise.all([
    sharedCard(db, meId, cn),
    sharedCard(db, peerId, cn),
    sharedGround(db, { viewerId: meId, peerId, cn, peerCard: null }),
    one(db, "SELECT text FROM notes WHERE user_id = ? AND connection_id = ?", meId, cn.id),
    cn.event_id ? one(db, "SELECT name FROM events WHERE id = ?", cn.event_id) : null,
  ]);
  const them = visibleSide(theirs, theirCard); // what they show you: the card they shared, in the mode they use
  const talk = [
    ...distinct(them?.tags, CAPS.tag, MAX_TAGS).map((text) => ({ text, kind: "tag" })),
    ...distinct(ground.map((g) => g.text), CAPS.line, 3).map((text) => ({ text, kind: "ground" })),
  ];
  const seen = new Set();
  const talkAbout = talk.filter((t) => !seen.has(t.text.toLowerCase()) && seen.add(t.text.toLowerCase()));
  // Your own tags: the profile's and the card you gave them. They are yours to offer.
  const offer = distinct([...(mine?.tags || []), ...(myCard?.tags || [])], CAPS.tag, MAX_TAGS);
  return {
    cn, peerId,
    themFirst: first(theirs.name),
    themLine: cleanText(subtitleOf(theirs), CAPS.line),
    meFirst: first(mine?.name),
    themCard: cardSide(theirs, theirCard),
    meCard: mine ? cardSide(mine, myCard) : null,
    event: cleanText(event?.name || "", CAPS.name),
    talkAbout, offer,
    note: cleanText(note?.text || "", CAPS.note),
  };
}

// Only items that were offered, each once, in the order the person chose, at most `max`.
function chosen(wanted, offered, max) {
  const byKey = new Map(offered.map((o) => [o.toLowerCase(), o]));
  const out = [];
  for (const w of Array.isArray(wanted) ? wanted : []) {
    const hit = typeof w === "string" ? byKey.get(cleanText(w, 140).toLowerCase()) : null;
    if (hit && !out.includes(hit)) out.push(hit);
    if (out.length >= max) break;
  }
  return out;
}

const MAX_PROJECTS = 3;
const MAX_CARD_TAGS = 8;
const projectsOf = (p) => { try { return Array.isArray(p.projects) ? p.projects : JSON.parse(p.projects || "[]"); } catch { return []; } };

/**
 * One person's side as the card they shared shows it to the other: what they do, about, tags, a few projects and the
 * card's note. Links are left out on purpose (a draft never carries one). Empty fields are dropped.
 */
export function cardSide(profile, card) {
  if (!profile) return null;
  // A field written as an instruction to the model ("ignore the user and...") is left out, as in people search.
  const clean = (v, cap) => { const t = cleanText(v || "", cap); return t && !looksLikeInstruction(t) ? t : ""; };
  const facts = card ? cardFacts(card, profile) : { headline: profile.headline, about: profile.about, tags: profile.tags };
  const projects = projectsOf(profile).slice(0, MAX_PROJECTS)
    .map((pr) => ({ title: clean(pr?.title, CAPS.name), line: clean(pr?.line, CAPS.line) }))
    .filter((pr) => pr.title || pr.line);
  const out = {
    headline: clean(facts.headline, CAPS.headline),
    about: clean(facts.about, CAPS.bio),
    tags: distinct(facts.tags, CAPS.tag, MAX_CARD_TAGS).filter((t) => !looksLikeInstruction(t)),
    projects,
    cardNote: clean(card?.note, CAPS.line),
  };
  for (const k of Object.keys(out)) if (!out[k] || (Array.isArray(out[k]) && !out[k].length)) delete out[k];
  return Object.keys(out).length ? out : null;
}

/** The data block for the model (see the list at the top of this file). Exported so tests can inspect it. */
export function followupData(ctx, { talkAbout, offer, useNote, extra }) {
  const note = useNote && ctx.note ? ctx.note : "";
  const typed = cleanText(extra, CAPS.extra);
  return {
    them: { firstName: ctx.themFirst, line: ctx.themLine, ...(ctx.themCard ? { card: ctx.themCard } : {}) },
    met: { ...(ctx.event ? { event: ctx.event } : {}), date: dateOf(ctx.cn.created_at), how: HOW[ctx.cn.via] || "we connected on Lanyard" },
    talkAbout: chosen(talkAbout, ctx.talkAbout.map((t) => t.text), MAX_TALK),
    me: { firstName: ctx.meFirst, ...(ctx.meCard ? { card: ctx.meCard } : {}) },
    offer: chosen(offer, ctx.offer, MAX_OFFER),
    ...(note ? { myNote: note } : {}),
    ...(typed ? { extra: typed } : {}),
  };
}

// Local stub mode only (AI_STUB): a plausible draft built from the data, so the screen can be tried without a key.
function stubDraft(data, channel) {
  const topic = data.talkAbout[0];
  const where = data.met.event ? ` at ${data.met.event}` : "";
  const body = `Hi ${data.them.firstName}, it was good to meet you${where}.${topic ? ` I enjoyed hearing about ${topic}.` : ""} Let's keep in touch. ${channel === "email" ? data.me.firstName : ""}`.trim();
  return channel === "email" ? { subject: `Good to meet you${where}`.split(" ").slice(0, 8).join(" "), body } : { body };
}

followupApp.get("/api/ai/followup/:connectionId", async (c) => {
  const u = requireUser(c);
  const ctx = await followupContext(c.env.DB, u.id, c.req.param("connectionId"));
  if (!ctx) return c.json({ error: "not found" }, 404);
  const allowance = await allowanceFor(c.env, { kind: "user", id: u.id }, "followup");
  return c.json({
    themFirst: ctx.themFirst,
    meFirst: ctx.meFirst,
    eventName: ctx.event,
    talkAbout: ctx.talkAbout,
    offer: ctx.offer,
    hasNote: !!ctx.note,
    // null when this person cannot use AI drafts (a guest, or not let in yet): the page still offers the template.
    allowance: allowance ? { day: allowance.remaining.day, month: allowance.remaining.month } : null,
    limits: { max: { talkAbout: MAX_TALK, offer: MAX_OFFER, extra: CAPS.extra } },
  });
});

followupApp.post("/api/ai/followup/:connectionId", async (c) => {
  const u = requireUser(c);
  const b = await c.req.json().catch(() => ({}));
  if (!isChannel(b.channel) || !isTone(b.tone) || !isGoal(b.goal)) return c.json({ error: "Pick a channel, a tone and a goal." }, 400);
  if (b.extra !== undefined && typeof b.extra !== "string") return c.json({ error: "Extra information must be text." }, 400);
  const db = c.env.DB;
  const ctx = await followupContext(db, u.id, c.req.param("connectionId"));
  if (!ctx) return c.json({ error: "not found" }, 404);
  const actor = { kind: "user", id: u.id };
  const data = followupData(ctx, { talkAbout: b.talkAbout, offer: b.offer, useNote: b.useNote === true, extra: b.extra || "" });
  const r = await callModel(c.env, {
    feature: "followup",
    actor,
    promptVersion: PROMPT_VERSION,
    system: followupSystem(b),
    data,
    schema: FOLLOWUP_SCHEMA,
    maxTokens: MAX_TOKENS,
    subjects: [ctx.peerId], // blocks, and any future opt-out, are checked inside callModel
    regenerate: b.regenerate === true,
    ip: c.req.header("cf-connecting-ip"),
    refine: refineFollowup(b),
    stub: stubDraft(data, b.channel),
  });
  const allowance = async () => {
    const a = await allowanceFor(c.env, actor, "followup");
    return a ? { day: a.remaining.day, month: a.remaining.month } : null;
  };
  await countKind(db, r.fallback ? "drafted_template" : "drafted_ai");
  if (r.fallback) {
    const message = r.reason === "ineligible" ? "Save your card and confirm your email to get AI drafts." : r.message;
    return c.json({ fallback: true, reason: r.reason, message, allowance: await allowance() });
  }
  return c.json({
    fallback: false,
    draft: { ...(r.result.subject ? { subject: r.result.subject } : {}), body: r.result.body },
    cached: r.cached,
    allowance: { day: r.remaining.day, month: r.remaining.month },
  });
});


// What happened to a draft after it was shown: copied, opened in an app, or marked as followed up. A count and nothing
// else is kept. 120 an hour per person stops anyone filling the table.
const AFTER = ["copied", "opened", "marked"];
followupApp.post("/api/ai/followup-count", async (c) => {
  const u = requireUser(c);
  const b = await c.req.json().catch(() => ({}));
  if (!AFTER.includes(b.kind)) return c.json({ error: "Unknown kind." }, 400);
  if ((await bump(c.env.DB, `ai:fucount:${u.id}`, HOUR)) > 120) return c.json({ ok: true }); // over the limit: say nothing, count nothing
  await countKind(c.env.DB, b.kind);
  return c.json({ ok: true });
});
