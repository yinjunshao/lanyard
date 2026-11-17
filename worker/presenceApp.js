// F17: the routes for event presence ("Be easy to find") and who to meet. The rules are in
// presence.js. Everything here needs a signed-in person who has checked in to the event, and
// everything except withdrawing needs the event to be on and its directory to be on.
//
// Kept out of events.js and hosts.js on purpose: no host-facing file may read presence per
// person (D004). test/presence.mjs guards that.
import { Hono } from "hono";
import { newId, now, one, run } from "./db.js";
import { requireUser } from "./session.js";
import { recordConsentStmt, logConsentStmt } from "./legal.js";
import { putImage, deleteImage } from "./media.js";
import { bump, HOUR, DAY } from "./ratelimit.js";
import {
  INTRO_MAX, LOOKING_MAX, cleanLine, displayName, presenceCandidates, presenceScope, presenceStanding, removePresence,
} from "./presence.js";
import { suggest } from "./presenceMatch.js";
import { forgetSearchReplies } from "./ai/optout.js";

export const presenceApp = new Hono();

const SELFIE_MAX_BYTES = 600 * 1024; // the app sends a small, re-encoded photo; a face photo needs no more
export const PUT_LIMIT = 30; // changes per hour
export const PHOTO_LIMIT = 10; // selfies per day
export const SUGGEST_LIMIT = 120; // lists per hour

const WHY = {
  no_event: [404, "That event isn't here.", "no_event"],
  not_checked_in: [403, "Check in to this event to use this.", "not_checked_in"],
  directory_off: [403, "The organiser hasn't turned this on for this event.", "directory_off"],
  not_ongoing: [403, "This is only available while the event is on.", "not_ongoing"],
};
export const refuse = (c, why) => c.json({ error: WHY[why][1], code: WHY[why][2] }, WHY[why][0]);

// One person in the list: a photo, a name, their line and a reason, and nothing else. F25 shapes its list the same way.
export const entryOf = (p) => ({
  presenceId: p.id, name: displayName(p.name), selfie: p.selfie_key ? `/media/${p.selfie_key}` : null,
  intro: p.intro, reason: p.reason,
});

// What you see about your own presence. The same shape from every route that returns it.
const own = (st) => ({
  available: !st.why,
  why: st.why,
  on: !!st.mine,
  intro: st.mine?.intro || "",
  lookingFor: st.mine?.looking_for || "",
  selfie: st.mine?.selfie_key ? `/media/${st.mine.selfie_key}` : null,
});

// Your own state at this event. Anyone checked in may ask, even after it ends (so the hub can say so).
presenceApp.get("/api/e/:id/presence", async (c) => {
  const me = requireUser(c);
  const st = await presenceStanding(c.env.DB, c.req.param("id"), me.id);
  if (st.why === "no_event" || st.why === "not_checked_in") return refuse(c, st.why);
  return c.json(own(st));
});

// Turn it on, or change what you show. The first time needs `consent: true`, and so does every
// selfie (consent to the face photo is its own act). Fields that are left out stay as they were.
presenceApp.put("/api/e/:id/presence", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `presence:put:${me.id}`, HOUR)) > PUT_LIMIT) {
    return c.json({ error: "That's a lot of changes. Try again in a little while.", code: "throttled" }, 429);
  }
  const st = await presenceStanding(db, c.req.param("id"), me.id);
  if (st.why) return refuse(c, st.why);
  const ev = st.ev;
  const b = await c.req.json().catch(() => ({}));

  const intro = b.intro === undefined ? undefined : cleanLine(b.intro, INTRO_MAX);
  const lookingFor = b.lookingFor === undefined ? undefined : cleanLine(b.lookingFor, LOOKING_MAX);
  if (intro === null) return c.json({ error: `Keep your line to ${INTRO_MAX} characters.` }, 400);
  if (lookingFor === null) return c.json({ error: `Keep it to ${LOOKING_MAX} characters.` }, 400);
  if (!st.mine && b.consent !== true) {
    return c.json({ error: "Tick the box to say you're happy to be shown to the others here.", code: "consent_required" }, 400);
  }
  const sentSelfie = typeof b.selfieDataUrl === "string";
  if (sentSelfie && b.consent !== true) {
    return c.json({ error: "Tick the box to say you're happy for your photo to be shown to the others here.", code: "consent_required" }, 400);
  }
  if (b.selfieDataUrl !== undefined && b.selfieDataUrl !== null && !sentSelfie) return c.json({ error: "That isn't a photo." }, 400);

  let newKey = null;
  if (sentSelfie) {
    if ((await bump(db, `day:presence:photo:${me.id}`, DAY)) > PHOTO_LIMIT) {
      return c.json({ error: "That's a lot of photos today. Try again tomorrow.", code: "throttled" }, 429);
    }
    // The same checks as every upload (real image bytes, a size ceiling), with metadata removed.
    newKey = await putImage(c.env, b.selfieDataUrl, "presence", { strip: true, maxBytes: SELFIE_MAX_BYTES });
  }

  const ts = now();
  const scope = presenceScope(ev.id);
  const oldKey = st.mine?.selfie_key || null;
  const dropSelfie = b.selfieDataUrl === null && !!oldKey;
  try {
    if (!st.mine) {
      const first = !(await one(db, "SELECT 1 AS x FROM consents WHERE user_id = ? AND scope = ?", me.id, scope));
      const stmts = [
        db.prepare(
          `INSERT INTO event_presence (id, event_id, user_id, selfie_key, intro, looking_for, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(newId() + newId(), ev.id, me.id, newKey, intro || "", lookingFor || "", ts, ts),
        recordConsentStmt(db, me.id, scope),
        logConsentStmt(db, me.id, scope, "granted", ev.id),
      ];
      if (newKey) stmts.push(logConsentStmt(db, me.id, scope, "granted", "photo"));
      // The one figure a host sees: how many people ever turned it on here. A counter, not a list.
      if (first) stmts.push(db.prepare("UPDATE events SET presence_used = presence_used + 1 WHERE id = ?").bind(ev.id));
      await db.batch(stmts);
    } else {
      const sets = ["updated_at = ?"], vals = [ts];
      if (intro !== undefined) { sets.push("intro = ?"); vals.push(intro); }
      if (lookingFor !== undefined) { sets.push("looking_for = ?"); vals.push(lookingFor); }
      if (newKey || dropSelfie) { sets.push("selfie_key = ?"); vals.push(newKey); }
      const stmts = [db.prepare(`UPDATE event_presence SET ${sets.join(", ")} WHERE event_id = ? AND user_id = ?`).bind(...vals, ev.id, me.id)];
      if (newKey) stmts.push(logConsentStmt(db, me.id, scope, "granted", "photo"));
      if (dropSelfie) stmts.push(logConsentStmt(db, me.id, scope, "withdrawn", "photo"));
      await db.batch(stmts);
    }
  } catch (e) {
    if (newKey) await deleteImage(c.env, newKey).catch(() => {}); // nothing points at it: do not leave a face photo behind
    throw e;
  }
  if (oldKey && (newKey || dropSelfie)) await deleteImage(c.env, oldKey); // the old photo goes at once
  return c.json(own(await presenceStanding(db, ev.id, me.id)));
});

// Turn it off: the row, the selfie and the consent go now. Always allowed, even after the event.
presenceApp.delete("/api/e/:id/presence", async (c) => {
  const me = requireUser(c);
  const ev = await one(c.env.DB, "SELECT id FROM events WHERE id = ?", c.req.param("id"));
  if (!ev) return refuse(c, "no_event");
  const removed = await removePresence(c.env, ev.id, me.id);
  return c.json({ ok: true, removed });
});

// People to meet: only for someone checked in, at an event that is on, with presence on themselves
// (so you have to be findable to find others). Each entry is a photo, a name, their line and a
// reason, and nothing else: no card, no links, no ids, no contact details.
presenceApp.get("/api/e/:id/suggestions", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `presence:sug:${me.id}`, HOUR)) > SUGGEST_LIMIT) {
    return c.json({ error: "That's a lot of refreshes. Try again in a little while.", code: "throttled" }, 429);
  }
  const st = await presenceStanding(db, c.req.param("id"), me.id);
  if (st.why) return refuse(c, st.why);
  if (!st.mine) return c.json({ error: "Turn on 'Show me to people here' to see who else is easy to find.", code: "presence_off" }, 403);
  const { people, mode, topics } = await suggest(db, { eventId: st.ev.id, viewerId: me.id, mine: st.mine });
  return c.json({
    mode, topics,
    people: people.map(entryOf),
  });
});

// Report or block someone from the list. They need not be a connection: this works on the
// presence entry. Blocking is two-way and removes any connection between you, as elsewhere.
presenceApp.post("/api/e/:id/presence/:presenceId/report", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const st = await presenceStanding(db, c.req.param("id"), me.id);
  if (st.why) return refuse(c, st.why);
  if (!st.mine) return c.json({ error: "Turn on 'Show me to people here' first.", code: "presence_off" }, 403);
  const seen = (await presenceCandidates(db, st.ev.id, me.id)).find((p) => p.id === c.req.param("presenceId"));
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
    await forgetSearchReplies(db); // F25: no kept who-to-meet reply can name them
  }
  return c.json({ ok: true, blocked: !!b.block });
});
