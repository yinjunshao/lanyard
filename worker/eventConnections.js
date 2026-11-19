// Event analytics: which events a connection counts for (table event_connections, migration 0033).
//
// The rule: a connection counts for an event when BOTH people checked in to that event and the connection was made
// during the event's time window. The window runs from two hours before the start to two hours after the end. The end
// is when the host ended it, else the planned end, else 18 hours after the start. With no start time, the first of
// the two check-ins stands in for it. Scanning someone you already know at a new event counts for that event too.
//
// Two moments record a row, so the order of scanning and checking in does not matter:
//   recordConnection  every time two people connect (or connect again)
//   recordCheckin     when someone checks in: their connections made earlier in this event's window with people
//                     already checked in (a scan at the door before the check-in form)
// Leaving an event removes that person's rows for it (worker/leaveEvent.js). Organisers only ever see counts.
import { run } from "./db.js";

export const GRACE_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_LENGTH_MS = 18 * 60 * 60 * 1000;

// SQL for "ts is inside event e's window", with a and b the two people's check-ins.
const IN_WINDOW = (ts) => `${ts} >= COALESCE(e.starts_at, MIN(a.created_at, b.created_at)) - ${GRACE_MS}
  AND ${ts} <= COALESCE(e.ended_at, e.ends_at, COALESCE(e.starts_at, MAX(a.created_at, b.created_at)) + ${DEFAULT_LENGTH_MS}) + ${GRACE_MS}`;

/** Records connection `connId` (between meId and peerId, made or made again at `ts`) for every event it counts for. */
export function recordConnection(db, connId, meId, peerId, ts) {
  return run(db,
    `INSERT OR IGNORE INTO event_connections (event_id, connection_id, created_at)
     SELECT a.event_id, ?1, ?4
       FROM checkins a
       JOIN checkins b ON b.event_id = a.event_id AND b.user_id = ?3
       JOIN events e ON e.id = a.event_id
      WHERE a.user_id = ?2 AND ${IN_WINDOW("?4")}`,
    connId, meId, peerId, ts);
}

/** After `userId` checks in to `eventId`: their connections made in its window with people already checked in. */
export function recordCheckin(db, eventId, userId) {
  return run(db,
    `INSERT OR IGNORE INTO event_connections (event_id, connection_id, created_at)
     SELECT ?1, cn.id, cn.created_at
       FROM connections cn
       JOIN checkins a ON a.event_id = ?1 AND a.user_id = ?2
       JOIN checkins b ON b.event_id = ?1 AND b.user_id = CASE WHEN cn.user_a = ?2 THEN cn.user_b ELSE cn.user_a END
       JOIN events e ON e.id = ?1
      WHERE (cn.user_a = ?2 OR cn.user_b = ?2) AND ${IN_WINDOW("cn.created_at")}`,
    eventId, userId);
}
