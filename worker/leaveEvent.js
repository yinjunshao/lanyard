// Leaving an event (attendee side). Its own file: it has to reach presence and drops, which the
// guards keep out of myevents.js and every host-facing file.
import { Hono } from "hono";
import { now, one, all } from "./db.js";
import { requireUser } from "./session.js";
import { removePresence } from "./presence.js";
import { logConsentStmt } from "./legal.js";

export const leaveEventApp = new Hono();

// Leave an event: the person is taken off it and out of what its organisers see. The check-in,
// presence (and its selfie), the organisers' named list, choices and consents for this event,
// drop handouts and mail log all go, and their connections made here stop counting towards the
// event's figures (the connections themselves stay: they belong to the other person too).
// Feedback was anonymous and kept with no link to anyone, so it cannot be picked out and stays
// (feedback_done stays too, so leaving and checking in again cannot answer twice).
leaveEventApp.delete("/api/my/events/:id", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await one(db, "SELECT e.id FROM checkins ch JOIN events e ON e.id = ch.event_id WHERE ch.user_id = ? AND e.id = ?", me.id, c.req.param("id"));
  if (!ev) return c.json({ error: "You haven't checked in to this event." }, 404);

  // Presence first: it deletes a stored selfie, and if that fails nothing else has gone yet.
  await removePresence(c.env, ev.id, me.id, { why: "left_event" });

  // Every consent tied to this event: event_<kind>:<event id>, and event_sponsor:<sponsor id> for its sponsors.
  const MINE = `user_id = ?1 AND granted = 1 AND (scope LIKE 'event!_%:' || ?2 ESCAPE '!'
    OR scope IN (SELECT 'event_sponsor:' || id FROM sponsors WHERE event_id = ?2))`;
  const scopes = await all(db, `SELECT scope FROM consents WHERE ${MINE}`, me.id, ev.id);
  const drops = "SELECT id FROM drops WHERE event_id = ?2";
  await db.batch([
    // An item that was only theirs was shown to them, so it is withdrawn, never handed to someone else.
    db.prepare(`UPDATE drop_items SET cipher = '' WHERE id IN (SELECT item_id FROM drop_gives WHERE user_id = ?1 AND exclusive = 1 AND drop_id IN (${drops}))`).bind(me.id, ev.id),
    db.prepare(`DELETE FROM drop_gives WHERE user_id = ?1 AND drop_id IN (${drops})`).bind(me.id, ev.id),
    db.prepare(`DELETE FROM voucher_uses WHERE user_id = ?1 AND drop_id IN (${drops})`).bind(me.id, ev.id),
    db.prepare("DELETE FROM voucher_codes WHERE event_id = ? AND user_id = ?").bind(ev.id, me.id),
    db.prepare("DELETE FROM event_attendees WHERE event_id = ? AND user_id = ?").bind(ev.id, me.id),
    db.prepare("DELETE FROM event_mail_log WHERE event_id = ? AND user_id = ?").bind(ev.id, me.id),
    db.prepare("UPDATE connections SET event_id = NULL WHERE event_id = ?1 AND (user_a = ?2 OR user_b = ?2)").bind(ev.id, me.id),
    db.prepare(`UPDATE consents SET granted = 0, created_at = ?3 WHERE ${MINE}`).bind(me.id, ev.id, now()),
    ...scopes.map((s) => logConsentStmt(db, me.id, s.scope, "withdrawn", "left_event")),
    db.prepare("DELETE FROM checkins WHERE event_id = ? AND user_id = ?").bind(ev.id, me.id),
  ]);
  return c.json({ ok: true });
});
