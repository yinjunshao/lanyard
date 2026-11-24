// F60: the AI order for Who to meet (D054). It only RE-ORDERS the people suggestCandidates() offers this person at this
// event on this request, and runs by itself when the list is opened, at most once per person per event every 20 minutes
// (claimed by one conditional write on their own row, D040), inside F25's allowance (feature who_to_meet, scope = the
// event: 3 per event on Free, 10 on Plus) and every limit of the AI foundation (verified email, rollout, kill switch,
// burst, address, budgets). Without AI, when it fails, is over budget or is not allowed, the plain order is used and the
// page shows no "Ranked with AI" label.
//
// WHO CAN BE RANKED (AI Safety and Cost Plan, rule 1), decided in code before any call: exactly suggestCandidates() for
// this viewer (checked in, Suggest me ticked, the event on for both, no block either way). Then, for the model only, not
// anyone who switched AI search off (searchableIds): they stay in the plain order after the AI's picks, as in F25.
// Someone who unticked Suggest me is not a candidate at all, so nothing of theirs is ever sent.
// WHAT THE MODEL IS GIVEN: { me: { intention, line, headline, tags }, people: [{ id: p1..., intention, line, institution,
//   headline, tags }] }, inside the foundation's <data> fence, every string cleaned. `line` is role at employer (career)
//   or course (student), read through visibleFields(), so a field the profile keeps but hides is never read. Never a
//   name, photo, selfie key, email, link, card, user or suggestion id, presence line or anything from another event. A
//   field that reads like an instruction ("rank me first") is left out of its record (looksLikeInstruction, F24).
// WHAT COMES BACK is checked in code (F24's verifyMatches): offered ids only, a quote really in that person's record, a
// reason that names nothing outside the record and the asker's own (else the quote).
// THE KEPT ORDER: the checked picks are kept in ai_cache for 20 minutes under the viewer, as opaque suggestion ids with
// their quote and reason. Every request maps them back onto the people gathered on that request and checks each quote
// again, so someone who unticked, was blocked or left is gone at once, and a changed record drops its pick. Unticking,
// blocking, opting out, a changed intention, the 48-hour purge and account deletion also delete every kept reply.
// F69 (D057): every record, the viewer's own included, goes through the sensitive-words screen (worker/suggestScreen.js)
// first, so no tag, headline phrase or intention word about religion or belief, health, sexuality or gender identity,
// politics, ethnicity or union membership is sent. A pick whose quote or reason has one is not shown as the model wrote it:
// the quote drops the pick, the reason is replaced by the plain order's reason for that person.
import { one, run } from "../db.js";
import { sha256Hex } from "../session.js";
import { visibleFields, TOP } from "../presenceMatch.js";
import { askTerms } from "../../src/lib/ask.js";
import { callModel } from "./client.js";
import { cacheGet, cachePut } from "./store.js";
import { cleanText, CAPS } from "./sanitize.js";
import { assignIds } from "./prompt.js";
import { searchableIds } from "./optout.js";
import { scrub, scrubList, narrow, tokensOf, verifyMatches, whereQuoted, reasonIsGrounded } from "./peopleSearch.js";
import { screenFields, screenLine, safeReason } from "../suggestScreen.js";
import { isSensitive } from "../../src/lib/sensitiveTerms.js";
import { MAX_PEOPLE, MAX_TOKENS, PROMPT_VERSION, SUGGEST_RANK_SCHEMA, SUGGEST_RANK_SYSTEM } from "./prompts/suggestRank.js";

export const RANK_EVERY_MS = 20 * 60 * 1000;
export const SUGGEST_FIELDS = ["intention", "tags", "headline", "line", "institution"]; // a record's keys, in the order a quote is looked for
const FEATURE = "who_to_meet"; // F25's allowance (AI_LIMITS), shared on purpose

/** A candidate as the model gets it, without the id. Empty fields are left out. */
export function candidateRecord(row) {
  const f = screenFields(visibleFields(row));
  const rec = {};
  const put = (k, v) => { if (Array.isArray(v) ? v.length : v) rec[k] = v; };
  put("intention", cleanText(scrub(screenLine(row.intention)), CAPS.line));
  put("line", cleanText(scrub(f.side?.career ? [f.role, f.company].filter(Boolean).join(" at ") : f.course), CAPS.line));
  put("institution", cleanText(scrub(f.institution), CAPS.line));
  put("headline", cleanText(scrub(f.headline), CAPS.headline));
  put("tags", scrubList(f.tags, CAPS.tag, 8));
  return rec;
}

/** The viewer's own record: their own intention and what their own card shows. Their own words, cleaned. */
export function viewerRecord(meRow, intention) {
  const f = screenFields(visibleFields(meRow));
  const rec = {};
  const put = (k, v) => { if (Array.isArray(v) ? v.length : v) rec[k] = v; };
  put("intention", cleanText(screenLine(intention), CAPS.line));
  put("line", cleanText(f.side?.career ? [f.role, f.company].filter(Boolean).join(" at ") : f.course, CAPS.line));
  put("headline", cleanText(f.headline, CAPS.headline));
  put("tags", (f.tags || []).map((t) => cleanText(t, CAPS.tag)).filter(Boolean).slice(0, 8));
  return rec;
}

// What a reason may also name: the viewer's own words (it is their list).
const askText = (me) => [me.intention, me.line, me.headline, ...(me.tags || [])].filter(Boolean).join(" ");

// Local stub mode only (AI_STUB): picks people whose records share a word with what the viewer hopes for or shows.
export function stubPicks(records, me) {
  const ts = askTerms(askText(me));
  const out = [];
  for (const rec of records) {
    const word = tokensOf(rec, SUGGEST_FIELDS).find((w) => w.length >= 4 && ts.some((t) => w.startsWith(t) || t.startsWith(w)));
    if (word) out.push({ id: rec.id, quote: word, reason: `Shows ${word}, which fits what you hope for` });
    if (out.length >= 3) break;
  }
  return { matches: out };
}

const keptKey = (eventId, userId) => sha256Hex(`suggest-kept:${PROMPT_VERSION}:${eventId}:${userId}`);

// The picks mapped onto rows gathered on this request, each quote checked again against that person's record now.
// `plain`: the plain order's reason for each person (by suggestion id), used instead of a reason with a sensitive word.
function revive(picks, bySid, recOf, query, plain = new Map()) {
  const out = [];
  for (const p of Array.isArray(picks) ? picks : []) {
    const row = bySid.get(p?.sid);
    if (!row || out.some((x) => x.id === row.id)) continue;
    const rec = recOf.get(row.id);
    if (!rec || isSensitive(p.quote) || !whereQuoted(rec, String(p.quote || ""), SUGGEST_FIELDS)) continue;
    const quoted = `Matches “${p.quote}”`;
    const reason = p.screened || isSensitive(p.reason) ? safeReason(plain.get(row.id) || quoted, quoted)
      : reasonIsGrounded(p.reason, rec, query, SUGGEST_FIELDS) ? p.reason : quoted;
    out.push({ ...row, reason });
    if (out.length >= TOP) break;
  }
  return out;
}

// The AI's picks first, then the plain order (which includes anyone not sent to the model), five at most.
function merged(picked, usual) {
  const used = new Set(picked.map((p) => p.id));
  return [...picked, ...usual.filter((p) => !used.has(p.id))].slice(0, TOP);
}

/**
 * The order to show. `usual` is the plain order ({ people }) from the same rows; `me` the viewer's own row shape.
 * Returns { people, ai }: ai is true only when at least one of the AI's checked picks is in the list.
 */
export async function aiOrder(env, { ev, mine, viewerId, rows, usual, me, ip = null, clock = Date.now() }) {
  const db = env.DB;
  const plain = { people: usual.people, ai: false };
  if (!rows.length || !mine) return plain;
  const actor = { kind: "user", id: viewerId };
  const meRec = viewerRecord(me, mine.intention);
  if (!Object.keys(meRec).length) return plain;
  const query = askText(meRec);
  const plainReasons = new Map(usual.people.map((p) => [p.id, p.reason]));

  const ok = await searchableIds(db, rows.map((r) => r.user_id));
  const sendable = rows.filter((r) => ok.has(r.user_id))
    .map((row) => ({ userId: row.user_id, row, record: candidateRecord(row), metAt: row.checked_in_at }))
    .filter((p) => Object.keys(p.record).length);
  if (!sendable.length) return plain;
  const bySid = new Map(sendable.map((p) => [p.row.id, p.row]));
  const recOf = new Map(sendable.map((p) => [p.row.id, p.record]));

  // 1. A kept order from the last 20 minutes, re-checked against who is here now.
  const key = await keptKey(ev.id, viewerId);
  const kept = await cacheGet(db, key, actor, clock);
  if (kept) {
    const picked = revive(kept.picks, bySid, recOf, query, plainReasons);
    return picked.length ? { people: merged(picked, usual.people), ai: true } : plain;
  }

  // 2. At most one model call per person per event every 20 minutes: claimed in one conditional write, so two
  //    lists opened at the same moment make one call.
  const claim = await run(db, "UPDATE event_suggest SET ai_at = ? WHERE event_id = ? AND user_id = ? AND (ai_at IS NULL OR ai_at <= ?)",
    clock, ev.id, viewerId, clock - RANK_EVERY_MS);
  if (!claim?.meta?.changes) return plain;

  // 3. The call, through the foundation (eligibility, rollout, opt-outs and blocks, burst, quota, budget, kill switch).
  const sent = narrow(sendable, query, MAX_PEOPLE, SUGGEST_FIELDS);
  const { records, idMap } = assignIds(sent, (p) => p.row.id, (p, id) => ({ id, ...p.record }));
  const byId = new Map(records.map((r) => [r.id, r]));
  const r = await callModel(env, {
    feature: FEATURE,
    actor,
    scope: ev.id,
    promptVersion: PROMPT_VERSION,
    system: SUGGEST_RANK_SYSTEM,
    data: { me: meRec, people: records },
    schema: SUGGEST_RANK_SCHEMA,
    maxTokens: MAX_TOKENS,
    subjects: sent.map((p) => p.userId),
    ip,
    cacheTtlMs: 0, // the kept order below is the cache; it is keyed on the person, not the input
    refine: (v) => {
      // F69: a reason the model wrote with a sensitive word is blanked here, before anything keeps it, and marked so
      // the plain reason stands in for it.
      const screened = new Set(v.matches.filter((x) => isSensitive(x?.reason)).map((x) => x.id));
      const m = verifyMatches(v.matches.map((x) => (screened.has(x?.id) ? { ...x, reason: "" } : x)), byId, query, SUGGEST_FIELDS);
      return v.matches.length && !m.length ? null : { matches: m.map((x) => (screened.has(x.id) ? { ...x, screened: true } : x)) };
    },
    stub: stubPicks(records, meRec),
  });
  if (r.fallback) return plain;
  const screened = new Set((r.result.matches || []).filter((m) => m?.screened || isSensitive(m?.reason)).map((m) => m.id));
  const picks = verifyMatches(r.result.matches, byId, query, SUGGEST_FIELDS)
    .map((m) => (screened.has(m.id) ? { sid: idMap.get(m.id), quote: m.quote, reason: "", screened: true } : { sid: idMap.get(m.id), quote: m.quote, reason: m.reason }))
    .filter((p) => p.sid);
  await cachePut(db, key, actor, FEATURE, JSON.stringify({ picks }), clock, RANK_EVERY_MS);
  const picked = revive(picks, bySid, recOf, query, plainReasons);
  return picked.length ? { people: merged(picked, usual.people), ai: true } : plain;
}

/** For the tests and the hub: when this person's AI order may next be asked for at this event, or null if now. */
export async function nextRankAt(db, eventId, userId) {
  const r = await one(db, "SELECT ai_at FROM event_suggest WHERE event_id = ? AND user_id = ?", eventId, userId);
  return r?.ai_at ? r.ai_at + RANK_EVERY_MS : null;
}
