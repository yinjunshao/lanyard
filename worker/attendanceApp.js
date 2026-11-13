// F31: a person's side of named attendance after check-in: see where they stand at an event that
// keeps a list, change their mind, and see every list they are on (Settings). The rules and the
// statements are in attendance.js; hosts reach the list through worker/hosts.js only.
//
// Everything here is the person's own: a signed-in attendee, an event they checked in to, and
// only their own row. Unticking deletes their row, so the host's very next request no longer
// shows them. A value that is missing from a change means "not ticked", never "ticked".
import { Hono } from "hono";
import { one } from "./db.js";
import { requireUser } from "./session.js";
import { choiceStatements, myLists, myStanding } from "./attendance.js";

export const attendanceApp = new Hono();

// An event this person checked in to that keeps a list, or null (the caller answers 404).
async function myEvent(db, eventId, userId) {
  const ev = await one(db, "SELECT * FROM events WHERE id = ?", eventId);
  if (!ev) return null;
  const here = await one(db, "SELECT 1 AS x FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, userId);
  return here ? ev : null;
}

attendanceApp.get("/api/e/:id/attendance", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await myEvent(db, c.req.param("id"), me.id);
  if (!ev) return c.json({ error: "You haven't checked in to this event." }, 404);
  const standing = await myStanding(db, ev, me.id);
  return c.json(standing ? { on: true, ...standing } : { on: false }, 200, { "cache-control": "no-store" });
});

// Body: { attendance, email, card }, each true or false. Whatever is missing is false.
attendanceApp.put("/api/e/:id/attendance", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await myEvent(db, c.req.param("id"), me.id);
  if (!ev || !ev.collect_attendance) return c.json({ error: "This event does not keep a list." }, 404);
  const body = await c.req.json().catch(() => ({}));
  const stmts = await choiceStatements(db, ev, me.id, body, { onlyChanges: true });
  if (stmts.length) await db.batch(stmts);
  return c.json({ ok: true, ...(await myStanding(db, ev, me.id)) }, 200, { "cache-control": "no-store" });
});

// Every list I am on, for Settings.
attendanceApp.get("/api/account/attendance", async (c) => {
  const me = requireUser(c);
  return c.json({ lists: await myLists(c.env.DB, me.id) }, 200, { "cache-control": "no-store" });
});
