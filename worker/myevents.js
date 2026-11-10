// The attendee side of "my events" (F15): the list for the Events tab and one event's hub.
// Kept out of events.js on purpose: it returns how two people met (connections.via), which
// test/provenance.mjs guards against any host-facing file reading (D004, D022).
import { Hono } from "hono";
import { now, one, all } from "./db.js";
import { requireUser } from "./session.js";
import { blockedSet } from "./blocks.js";
import { eventStatus } from "./eventstatus.js";
import { selfieView } from "./selfie.js";

export const myEventsApp = new Hono();

// How many of my connections were made at an event. The hub's list uses the same join,
// so the figure and the list cannot disagree.
const MY_CONNECTIONS_AT = `FROM connections cn
     JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ?1 THEN cn.user_b ELSE cn.user_a END
     WHERE cn.event_id = e.id AND (cn.user_a = ?1 OR cn.user_b = ?1)`;

const eventTimes = (e) => ({ startsAt: e.starts_at || null, endsAt: e.ends_at || null, endedAt: e.ended_at || null });

// Events I've checked into (for /app/events), with where each stands for me (F15).
myEventsApp.get("/api/my/events", async (c) => {
  const me = requireUser(c);
  const t = now();
  const rows = await all(
    c.env.DB,
    `SELECT e.id, e.code, e.name, e.starts_at, e.ends_at, e.ended_at, e.venue, e.theme, e.strap_color,
            e.perks, e.directory_on, ch.created_at AS checked_in_at,
            (SELECT COUNT(*) ${MY_CONNECTIONS_AT}) AS connection_count
     FROM checkins ch JOIN events e ON e.id = ch.event_id
     WHERE ch.user_id = ?1 ORDER BY ch.created_at DESC`,
    me.id
  );
  return c.json({
    now: t,
    events: rows.map((e) => ({
      id: e.id, code: e.code, name: e.name, startsAt: e.starts_at, venue: e.venue,
      endsAt: e.ends_at || null, endedAt: e.ended_at || null,
      status: eventStatus(eventTimes(e), e.checked_in_at, t),
      theme: e.theme, strapColor: e.strap_color, perks: e.perks || [],
      directoryOn: !!e.directory_on, checkedInAt: e.checked_in_at,
      connectionCount: e.connection_count,
    })),
  });
});

// One event I've checked into: where it stands, my figures, and the people I connected with
// here (F15). Only my own connections, never anyone else's. 404 unless I checked in.
myEventsApp.get("/api/my/events/:id", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const t = now();
  const e = await one(
    db,
    `SELECT e.id, e.code, e.name, e.starts_at, e.ends_at, e.ended_at, e.venue, e.theme, e.strap_color,
            e.perks, e.directory_on, ch.created_at AS checked_in_at
     FROM checkins ch JOIN events e ON e.id = ch.event_id
     WHERE ch.user_id = ?1 AND e.id = ?2`,
    me.id, c.req.param("id")
  );
  if (!e) return c.json({ error: "You haven't checked in to this event." }, 404);

  const rows = await all(
    db,
    `SELECT cn.id AS connection_id, cn.selfie_key, cn.selfie_by, cn.consent_b, cn.created_at, cn.via,
            CASE WHEN cn.user_a = ?1 THEN cn.user_b ELSE cn.user_a END AS peer_id,
            p.name AS peer_name, p.photo_key AS peer_photo_key, p.course, p.uni, p.mode, p.company, p.role, p.headline,
            COALESCE((SELECT c2.id FROM cards c2 WHERE c2.id = cn.card_id
                      AND c2.user_id = CASE WHEN cn.user_a = ?1 THEN cn.user_b ELSE cn.user_a END),
                     (SELECT c3.id FROM cards c3 WHERE c3.user_id = p.user_id AND c3.is_default = 1)) AS card_id
     ${MY_CONNECTIONS_AT.replace("WHERE cn.event_id = e.id", "WHERE cn.event_id = ?2")}
     ORDER BY cn.created_at DESC`,
    me.id, e.id
  );

  // People here: the others who chose to appear in the room, the same people the Room tab lists.
  let roomCount = null;
  if (e.directory_on) {
    const blocked = await blockedSet(db, me.id);
    const room = await all(
      db,
      `SELECT ch.user_id FROM checkins ch
       JOIN profiles p ON p.user_id = ch.user_id
       JOIN consents cs ON cs.user_id = p.user_id AND cs.scope = ?1 AND cs.granted = 1
       WHERE ch.event_id = ?2 AND ch.user_id != ?3`,
      `event_directory:${e.id}`, e.id, me.id
    );
    roomCount = room.filter((r) => !blocked.has(r.user_id)).length;
  }

  return c.json({
    now: t,
    event: {
      id: e.id, code: e.code, name: e.name, venue: e.venue, startsAt: e.starts_at || null,
      endsAt: e.ends_at || null, endedAt: e.ended_at || null,
      theme: e.theme, strapColor: e.strap_color, perks: e.perks || [], directoryOn: !!e.directory_on,
    },
    status: eventStatus(eventTimes(e), e.checked_in_at, t),
    checkedInAt: e.checked_in_at,
    connectionCount: rows.length,
    roomCount,
    connections: rows.map((r) => ({
      id: r.connection_id,
      peer: {
        id: r.peer_id, name: r.peer_name,
        photo: r.peer_photo_key ? `/media/${r.peer_photo_key}` : null,
        course: r.course, uni: r.uni, headline: r.headline,
        mode: r.mode || "student", company: r.company || "", role: r.role || "",
      },
      selfie: selfieView(r, me.id).selfie,
      cardId: r.card_id || null,
      via: r.via || null,
      metAt: r.created_at,
    })),
  });
});
