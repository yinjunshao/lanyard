// F25: AI who-to-meet ranking. The model only RE-ORDERS the list F17 already offers this person at this event.
//   GET  /api/ai/who-to-meet/:eventId   { allowance: { left } | null }   how many AI rankings are left for this event
//   POST /api/ai/who-to-meet/:eventId   (no body: the wish is the one the person saved with "Find people")
//          { fallback:false, improved, people:[{ presenceId, name, selfie, intro, reason }], cached, allowance }
//     or   { fallback:true, reason, message, allowance }   (the page keeps F17's own list)
//
// WHO CAN BE RANKED (AI Safety and Cost Plan, rule 1), all decided in code before any model call:
//   exactly presenceCandidates() for this person (worker/presence.js): the same event, still on for both, both checked in,
//   both with presence on, nobody blocked in either direction. Then, for the model only: not anyone who switched AI search
//   off (users.ai_search_ok, through searchableIds). Those people are NOT sent; they stay in the list, in F17's own order,
//   after the people the model picked (a person who chose to be easy to find at this event is not hidden by an AI setting).
//   The route never adds anyone: every person in the answer is a row presenceCandidates() returned on this request.
// WHAT THE MODEL IS GIVEN: the viewer's own saved wish (cleaned), and for each person an opaque id (p1, p2 ...) and only
//   these fields, which are the ones F17's own reason reads through visibleSide() (worker/presenceMatch.js visibleFields):
//   line        their role at employer (career profile) or their course (student profile); the other mode's fields are not read
//   institution their university, as the profile prints it
//   headline    the default card's headline, or the profile's if the card has none
//   tags        the default card's "come to me for" tags (a tag the card leaves out is not here)
//   intro       the line they wrote for this event
//   Never: a name, photo or selfie key, email, link, card or user id, presence id, what they are looking for (F17 does not
//   show another person's wish), a field the profile keeps but hides, connections, notes, or anything from another event.
//   A field that reads like an instruction ("rank me first") is left out of its record (looksLikeInstruction, from F24).
// WHAT COMES BACK is checked in code (verifyMatches, from F24): ids must be ones that were sent; every match must carry a
//   quote that really is in that person's record; a reason that names something not in their record is replaced by the
//   quote. Anything else, or a reply that picked people but none verifiably, is thrown away and F17's list stays.
// THE CACHE (10 minutes, ai_cache) is keyed by the viewer, the event, the wish, the people and everything sent about them,
//   so any change to who is there or what they show is a different key; the people are also looked up again on every
//   request, so a reply can only ever name someone who is a candidate right now. Withdrawing, blocking and deleting an account
//   also delete the kept replies (forgetSearchReplies), and a request outside the event's live window is refused before the cache.
import { Hono } from "hono";
import { requireUser } from "../session.js";
import { bump, HOUR } from "../ratelimit.js";
import { presenceCandidates, presenceStanding } from "../presence.js";
import { visibleFields, suggest, TOP } from "../presenceMatch.js";
import { entryOf, refuse } from "../presenceApp.js";
import { askTerms } from "../../src/lib/ask.js";
import { callModel, allowanceFor } from "./client.js";
import { cleanText, CAPS } from "./sanitize.js";
import { assignIds } from "./prompt.js";
import { searchableIds } from "./optout.js";
import { scrub, scrubList, narrow, tokensOf, verifyMatches } from "./peopleSearch.js";
import { MAX_PEOPLE, MAX_TOKENS, CACHE_MS, WHO_TO_MEET_SCHEMA, WHO_TO_MEET_SYSTEM, PROMPT_VERSION } from "./prompts/whoToMeet.js";

export const whoToMeetApp = new Hono();

export const MEET_FIELDS = ["line", "headline", "tags", "intro", "institution"]; // the keys of a record, in the order a quote is looked for
export const AI_PER_HOUR = 60; // requests (the model is called far less: the quota and the cache stand in front of it)

/** A candidate as the model gets it, without the id. Empty fields are left out. Reads only what visibleFields() keeps. */
export function buildRecord(row) {
  const f = visibleFields(row);
  const rec = {};
  const put = (k, v) => { if (Array.isArray(v) ? v.length : v) rec[k] = v; };
  put("line", cleanText(scrub(f.side?.career ? [f.role, f.company].filter(Boolean).join(" at ") : f.course), CAPS.line));
  put("institution", cleanText(scrub(f.institution), CAPS.line));
  put("headline", cleanText(scrub(f.headline), CAPS.headline));
  put("tags", scrubList(f.tags, CAPS.tag, 8));
  put("intro", cleanText(scrub(f.intro), CAPS.line));
  return rec;
}

// Local stub mode only (AI_STUB): picks the people whose records contain a word of the wish, with a quote that is really there.
function stubMatches(records, wish) {
  const ts = askTerms(wish);
  const out = [];
  for (const rec of records) {
    const word = tokensOf(rec, MEET_FIELDS).find((w) => w.length >= 4 && ts.some((t) => w.startsWith(t) || t.startsWith(w)));
    if (word) out.push({ id: rec.id, quote: word, reason: `Has ${word} in what they show here.` });
    if (out.length >= 3) break;
  }
  return { matches: out };
}

const leftOf = (a) => (a ? { left: a.remaining.scope } : null);

whoToMeetApp.get("/api/ai/who-to-meet/:eventId", async (c) => {
  const u = requireUser(c);
  const st = await presenceStanding(c.env.DB, c.req.param("eventId"), u.id);
  if (st.why === "no_event" || st.why === "not_checked_in") return refuse(c, st.why);
  return c.json({ allowance: leftOf(await allowanceFor(c.env, { kind: "user", id: u.id }, "who_to_meet", st.ev.id)) });
});

whoToMeetApp.post("/api/ai/who-to-meet/:eventId", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `presence:meetai:${u.id}`, HOUR)) > AI_PER_HOUR) {
    return c.json({ error: "That's a lot of requests. Try again in a little while.", code: "throttled" }, 429);
  }
  // The same gate as F17's list: checked in, directory on, the event on for you, presence on for you. Before anything else, and before the cache.
  const st = await presenceStanding(db, c.req.param("eventId"), u.id);
  if (st.why) return refuse(c, st.why);
  if (!st.mine) return c.json({ error: "Turn on 'Show me to people here' to see who else is easy to find.", code: "presence_off" }, 403);
  const eventId = st.ev.id;
  const actor = { kind: "user", id: u.id };
  const allowance = async () => leftOf(await allowanceFor(c.env, actor, "who_to_meet", eventId));

  // The viewer's own saved wish, cleaned. It is data for the model, never instructions.
  const wish = cleanText(st.mine.looking_for, CAPS.query);
  if (wish.length < 3 || !/[\p{L}\p{N}]{2}/u.test(wish)) {
    return c.json({ fallback: true, reason: "no_wish", message: "Write who you want to meet and press Find people first.", allowance: await allowance() });
  }

  // F17's own list, computed first, in code. It is the fallback and the filler, and the only pool anyone can come from.
  const rows = await presenceCandidates(db, eventId, u.id);
  const usual = await suggest(db, { eventId, viewerId: u.id, mine: st.mine, rows });
  const ok = await searchableIds(db, rows.map((r) => r.user_id));
  const sendable = rows.filter((r) => ok.has(r.user_id))
    .map((row) => ({ userId: row.user_id, row, record: buildRecord(row), metAt: row.checked_in_at }))
    .filter((p) => Object.keys(p.record).length);
  const sent = narrow(sendable, wish, MAX_PEOPLE, MEET_FIELDS);
  // Nobody to rank: no model call, nothing used up, and F17's list as it is.
  if (!sent.length) return c.json({ fallback: false, improved: false, people: usual.people.map(entryOf), cached: false, allowance: await allowance() });

  const { records, idMap } = assignIds(sent, (p) => p.userId, (p, id) => ({ id, ...p.record }));
  const byId = new Map(records.map((r) => [r.id, r]));
  const rowOf = new Map(sent.map((p) => [p.userId, p.row]));
  const r = await callModel(c.env, {
    feature: "who_to_meet",
    actor,
    scope: eventId, // the limit is per event
    promptVersion: PROMPT_VERSION,
    system: WHO_TO_MEET_SYSTEM,
    data: { wish, people: records },
    schema: WHO_TO_MEET_SCHEMA,
    maxTokens: MAX_TOKENS,
    subjects: sent.map((p) => p.userId), // the same people who are in the data
    ip: c.req.header("cf-connecting-ip"),
    cacheTtlMs: CACHE_MS,
    // A reply that picked people but none with a real quote is not trusted: F17's list stays.
    refine: (v) => { const m = verifyMatches(v.matches, byId, wish, MEET_FIELDS); return v.matches.length && !m.length ? null : { matches: m }; },
    stub: stubMatches(records, wish),
  });
  if (r.fallback) {
    const message = r.reason === "ineligible" ? "Save your card and confirm your email to rank with AI." : r.message;
    return c.json({ fallback: true, reason: r.reason, message, allowance: await allowance() });
  }
  // Checked again on the way out, so a reply from the cache goes through the same gate as a new one. byId holds only
  // people who are candidates in THIS request, so someone who has left, been blocked or switched presence off is gone.
  const picked = verifyMatches(r.result.matches, byId, wish, MEET_FIELDS);
  const people = [];
  const used = new Set();
  for (const m of picked) {
    const row = rowOf.get(idMap.get(m.id));
    if (!row || used.has(row.id)) continue;
    used.add(row.id);
    people.push(entryOf({ ...row, reason: m.reason }));
  }
  const improved = people.length > 0;
  // The rest of the list is F17's own, in its own order (including anyone who was not sent to the model).
  for (const p of usual.people) {
    if (people.length >= TOP) break;
    if (!used.has(p.id)) { used.add(p.id); people.push(entryOf(p)); }
  }
  return c.json({ fallback: false, improved, people: people.slice(0, TOP), cached: r.cached, allowance: await allowance() });
});
