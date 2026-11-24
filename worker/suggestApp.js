// F60: the routes for "Who to meet" for everyone checked in (D054). The rules are in suggest.js, the order without AI
// in suggestMatch.js. Everything needs a signed-in person checked in to the event.
//   GET  /api/e/:id/suggest                  your own choice here: { available, why, suggest, intention, notice }
//   PUT  /api/e/:id/suggest                  { suggest?, intention? } change it (the hub and Settings)
//   POST /api/e/:id/who-to-meet              up to five people: { people: [entry], ai, mode }
//   POST /api/e/:id/who-to-meet/:sid/report  { reason?, block? } report or block someone in the list
//   GET  /api/account/suggest                every event where you have a choice, for Settings
// An entry is exactly { id, name, headline, tags, intention, reason } and `photo` only for someone with Be easy to find
// on (F17). `id` is opaque (event_suggest.id), never a user id; there is no card, link or contact detail.
//
// Kept out of events.js, myevents.js and hosts.js on purpose: no host-facing file reads this per person (D004).
import { Hono } from "hono";
import { newId, now, one, run } from "./db.js";
import { requireUser } from "./session.js";
import { bump, HOUR, DAY } from "./ratelimit.js";
import { deleteImage } from "./media.js";
import { displayName } from "./presence.js";
import { visibleFields } from "./presenceMatch.js";
import { changeSuggest, mySuggestChoices, readChoice, suggestCandidates, suggestStanding } from "./suggest.js";
import { meRow, rankSuggest } from "./suggestMatch.js";
import { forgetSearchReplies } from "./ai/optout.js";
import { SUGGEST_NOTICE, SUGGEST_VERSION } from "../src/lib/suggest.js";

export const suggestApp = new Hono();

export const PUT_LIMIT = 30;   // changes an hour (as F17)
export const LIST_LIMIT = 120; // lists an hour (as F17)
export const TAGS_SHOWN = 3;

const WHY = {
  no_event: [404, "That event isn't here.", "no_event"],
  not_checked_in: [403, "Check in to this event to use this.", "not_checked_in"],
  suggest_off: [403, "The organiser has switched suggestions off for this event.", "suggest_off"],
  not_ongoing: [403, "Suggestions show only while the event is on.", "not_ongoing"],
  suggest_me_off: [403, "Tick Suggest me to see who to meet. People who are not suggested don't see suggestions either.", "suggest_me_off"],
};
export const refuse = (c, why) => c.json({ error: WHY[why][1], code: WHY[why][2] }, WHY[why][0]);

/** One person in someone's list. Exactly these keys; `photo` only when they turned on Be easy to find. */
export function entryOf(row) {
  const f = visibleFields(row);
  const e = { id: row.id, name: displayName(row.name), headline: f.headline, tags: f.tags.slice(0, TAGS_SHOWN), intention: row.intention || "", reason: row.reason || "" };
  if (row.photo_key) e.photo = `/media/${row.photo_key}`;
  return e;
}

const own = (st) => ({
  available: !st.why,
  why: st.why,
  suggest: st.mine ? !!st.mine.suggest : null, // null: never shown the notice here
  intention: st.mine?.intention || "",
  notice: { words: SUGGEST_NOTICE, version: SUGGEST_VERSION },
});

/** The order without AI, from rows gathered on this request. */
export async function usualOrder(db, viewerId, mine, rows) {
  const [profile, card] = await Promise.all([
    one(db, "SELECT * FROM profiles WHERE user_id = ?", viewerId),
    one(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", viewerId),
  ]);
  const { mode, ranked } = rankSuggest({ me: meRow(profile, card), intention: mine?.intention || "", rows });
  return { mode, people: ranked.map((r) => ({ ...r.row, reason: r.reason })) };
}

// Your own choice. Anyone checked in may read it, even after the event (so the hub and Settings can show it).
suggestApp.get("/api/e/:id/suggest", async (c) => {
  const me = requireUser(c);
  const st = await suggestStanding(c.env.DB, c.req.param("id"), me.id);
  if (st.why === "no_event" || st.why === "not_checked_in") return refuse(c, st.why);
  return c.json(own(st));
});

// Change it. Unticking is always allowed, also after the event and with the host's switch off.
suggestApp.put("/api/e/:id/suggest", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `suggest:put:${me.id}`, HOUR)) > PUT_LIMIT) {
    return c.json({ error: "That's a lot of changes. Try again in a little while.", code: "throttled" }, 429);
  }
  const st = await suggestStanding(db, c.req.param("id"), me.id);
  if (st.why === "no_event" || st.why === "not_checked_in") return refuse(c, st.why);
  const b = await c.req.json().catch(() => ({}));
  const choice = readChoice(b);
  if (choice.error) return c.json({ error: choice.error, code: "bad_suggest" }, 400);
  const ref = b.from === "settings" ? "settings" : "hub";
  const r = await changeSuggest(c.env, st.ev, me.id, choice, ref);
  if (r?.error) return c.json({ error: r.error, code: "bad_suggest" }, 400);
  return c.json(own(await suggestStanding(db, st.ev.id, me.id)));
});

// Who to meet: up to five people checked in here, for someone who is checked in and suggested too, while the event is
// on and the host's switch is on. A POST, because it may start an AI ranking (F60.3) and so must pass the same-origin check.
suggestApp.post("/api/e/:id/who-to-meet", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `suggest:list:${me.id}`, HOUR)) > LIST_LIMIT) {
    return c.json({ error: "That's a lot of refreshes. Try again in a little while.", code: "throttled" }, 429);
  }
  const st = await suggestStanding(db, c.req.param("id"), me.id);
  if (st.why) return refuse(c, st.why);
  if (!st.mine?.suggest) return refuse(c, "suggest_me_off");
  const rows = await suggestCandidates(db, st.ev, me.id);
  const usual = await usualOrder(db, me.id, st.mine, rows);
  const out = { people: usual.people, ai: false };
  return c.json({ mode: out.ai ? "ai" : usual.mode, ai: !!out.ai, people: out.people.map(entryOf) });
});

// Report or block someone in your list. Blocking is two-way and removes any connection between you, as elsewhere.
suggestApp.post("/api/e/:id/who-to-meet/:sid/report", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const st = await suggestStanding(db, c.req.param("id"), me.id);
  if (st.why) return refuse(c, st.why);
  if (!st.mine?.suggest) return refuse(c, "suggest_me_off");
  const seen = (await suggestCandidates(db, st.ev, me.id)).find((p) => p.id === c.req.param("sid"));
  if (!seen) return c.json({ error: "We couldn't find that person. Reload the page and try again." }, 404);
  const b = await c.req.json().catch(() => ({}));
  if ((await bump(db, `day:report:${me.id}`, DAY)) > 20) return c.json({ error: "You've sent a lot of reports today. Email us if it's urgent." }, 429);
  const reason = String(b.reason || "").slice(0, 500);
  if (!b.block && !reason.trim()) return c.json({ error: "Tell us what happened, in a sentence or two." }, 400);
  if (reason.trim()) {
    await run(db, "INSERT INTO reports (id, reporter_id, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", newId(), me.id, seen.user_id, reason, now());
  }
  if (b.block) {
    await run(db, "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", me.id, seen.user_id, now());
    const cn = await one(db, "SELECT id, selfie_key FROM connections WHERE (user_a = ?1 AND user_b = ?2) OR (user_a = ?2 AND user_b = ?1)", me.id, seen.user_id);
    if (cn) {
      if (cn.selfie_key) await deleteImage(c.env, cn.selfie_key).catch(() => {});
      await run(db, "DELETE FROM connections WHERE id = ?", cn.id);
    }
    await forgetSearchReplies(db); // no kept AI reply can name them
  }
  return c.json({ ok: true, blocked: !!b.block });
});

// Settings, Privacy and data: every event where you have a choice (rows go 48 hours after each event ends).
suggestApp.get("/api/account/suggest", async (c) => {
  const me = requireUser(c);
  return c.json({ events: await mySuggestChoices(c.env.DB, me.id) });
});
