// Events + check-in: public join view, check-in (ticket itself), the room
// directory, attendee perks, and the event album of connection selfies.
import { Hono } from "hono";
import { newId, now, one, all, run } from "./db.js";
import { newCardCode } from "./codes.js";
import { requireUser } from "./session.js";

export const eventsApp = new Hono();

// Public event info by join code (what the QR opens).
eventsApp.get("/api/e/:code", async (c) => {
  const db = c.env.DB;
  const code = c.req.param("code").toUpperCase();
  const ev = await one(db, "SELECT * FROM events WHERE code = ?", code);
  if (!ev) return c.json({ error: "event not found" }, 404);

  const me = c.get("user");
  const checkin = me
    ? await one(db, "SELECT created_at, answers, sponsor FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id)
    : null;
  const sponsors = await all(db, "SELECT id, name, perk FROM sponsors WHERE event_id = ?", ev.id);

  return c.json({
    event: {
      id: ev.id,
      code: ev.code,
      name: ev.name,
      startsAt: ev.starts_at,
      venue: ev.venue,
      theme: ev.theme,
      strapColor: ev.strap_color,
      perks: ev.perks || [],
      directoryOn: !!ev.directory_on,
      questions: ev.checkin_questions || [],
    },
    sponsors: sponsors.map((s) => ({ id: s.id, name: s.name, perk: s.perk })),
    checkedIn: !!checkin,
    checkin: checkin ? { at: checkin.created_at, answers: checkin.answers } : null,
  });
});

// Check in. Requires a profile name; guests with no profile pass their name and
// get a stub profile they can claim later.
eventsApp.post("/api/e/:code/checkin", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const code = c.req.param("code").toUpperCase();
  const ev = await one(db, "SELECT * FROM events WHERE code = ?", code);
  if (!ev) return c.json({ error: "event not found" }, 404);

  const body = await c.req.json().catch(() => ({}));
  let profile = await one(db, "SELECT name FROM profiles WHERE user_id = ?", me.id);
  if (!profile) {
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "name required to check in" }, 400);
    await run(
      db,
      `INSERT INTO profiles (user_id, name, uni, course, headline, about, links, tags, projects, is_public, updated_at)
       VALUES (?, ?, '', '', '', '', '{}', '[]', '[]', 0, ?)`,
      me.id, name.slice(0, 80), now()
    );
  }

  // Answers to the host's custom questions — keys must match declared fields.
  const answers = {};
  const allowed = new Set((ev.checkin_questions || []).map((q) => q.key));
  for (const [k, v] of Object.entries(body.answers || {})) {
    if (allowed.has(k)) answers[k] = String(v).slice(0, 120);
  }
  // Per-sponsor opt-in: only named sponsors, never bundled.
  const sponsorIds = new Set((await all(db, "SELECT id FROM sponsors WHERE event_id = ?", ev.id)).map((s) => s.id));
  const opted = (Array.isArray(body.sponsor) ? body.sponsor : []).filter((id) => sponsorIds.has(id));

  // Separate, explicit event-directory consent.
  const directoryConsent = ev.directory_on && body.directoryConsent === true ? 1 : 0;

  // Guests checking in get a default card so they're tappable in the room and
  // can receive connections at this event.
  let card = await one(db, "SELECT id FROM cards WHERE user_id = ? AND is_default = 1", me.id);
  const stmts = [
    db.prepare(
      `INSERT INTO checkins (event_id, user_id, answers, sponsor, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(event_id, user_id) DO UPDATE SET answers = excluded.answers, sponsor = excluded.sponsor`
    ).bind(ev.id, me.id, JSON.stringify(answers), JSON.stringify(opted), now()),
  ];
  if (!card) {
    card = { id: newId() };
    const cc = await newCardCode(db);
    stmts.push(db.prepare(
      `INSERT INTO cards (id, user_id, code, code_rotates_at, name, note, visible_links, tags, theme, is_default, event_id, created_at)
       VALUES (?, ?, ?, ?, 'General', '', '[]', '[]', 'default', 1, ?, ?)`
    ).bind(card.id, me.id, cc.code, cc.rotatesAt, ev.id, now()), cc.registerStmt(card.id));
  } else {
    stmts.push(db.prepare("UPDATE cards SET event_id = ? WHERE id = ?").bind(ev.id, card.id));
  }
  if (ev.directory_on) {
    stmts.push(db.prepare(
      `INSERT INTO consents (id, user_id, scope, granted, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, scope) DO UPDATE SET granted = excluded.granted, created_at = excluded.created_at`
    ).bind(newId(), me.id, `event_directory:${ev.id}`, directoryConsent, now()));
  }
  await db.batch(stmts);

  return c.json({ ok: true, eventId: ev.id });
});

// The room: live directory of checked-in attendees. Public profiles only;
// blocked pairs are filtered out. Hosts never see who-connected-with-whom.
eventsApp.get("/api/e/:id/room", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await one(db, "SELECT * FROM events WHERE id = ?", c.req.param("id"));
  if (!ev) return c.json({ error: "event not found" }, 404);
  if (!ev.directory_on) return c.json({ event: { name: ev.name }, people: [] });

  const mine = await one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!mine) return c.json({ error: "check in to see the room" }, 403);

  const blocked = new Set(
    (await all(db, "SELECT blocked_id FROM blocks WHERE blocker_id = ?", me.id)).map((b) => b.blocked_id)
  );

  const rows = await all(
    db,
    `SELECT p.user_id, p.name, p.photo_key, p.course, p.uni, p.headline, p.tags,
            p.is_public, ch.answers, ch.created_at AS at,
            (SELECT id FROM cards WHERE user_id = p.user_id AND is_default = 1) AS card_id
     FROM checkins ch
     JOIN profiles p ON p.user_id = ch.user_id
     JOIN consents cs ON cs.user_id = p.user_id
      AND cs.scope = ? AND cs.granted = 1
     WHERE ch.event_id = ? AND p.user_id != ?
     ORDER BY ch.created_at DESC`,
    `event_directory:${ev.id}`, ev.id, me.id
  );

  return c.json({
    event: { id: ev.id, name: ev.name },
    people: rows
      .filter((r) => !blocked.has(r.user_id))
      .map((r) => ({
        id: r.user_id, cardId: r.card_id, name: r.name,
        photo: r.photo_key ? `/media/${r.photo_key}` : null,
        course: r.course, uni: r.uni, headline: r.headline,
        tags: r.tags || [],
        // Custom check-in answers (course/year/looking) surface in the room;
        // only the declared questions exist, so nothing unexpected leaks.
        answers: r.answers || {},
        public: !!r.is_public,
        checkedInAt: r.at,
      })),
  });
});

// The album: connection selfies taken at this event. Only people who checked
// in may view it; each selfie only goes to the two people on that connection.
eventsApp.get("/api/e/:id/album", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await one(db, "SELECT id FROM events WHERE id = ?", c.req.param("id"));
  if (!ev) return c.json({ error: "event not found" }, 404);
  const mine = await one(db, "SELECT 1 FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!mine) return c.json({ error: "check in to see the album" }, 403);

  const conns = await all(
    db,
    `SELECT cn.id, cn.selfie_key, cn.created_at, p.name AS peer_name
     FROM connections cn
     JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END
     WHERE cn.event_id = ? AND (cn.user_a = ? OR cn.user_b = ?) AND cn.selfie_key IS NOT NULL
     ORDER BY cn.created_at DESC`,
    me.id, ev.id, me.id, me.id
  );
  return c.json({
    photos: conns.map((x) => ({
      id: x.id, src: `/media/${x.selfie_key}`, peer: x.peer_name, at: x.created_at,
    })),
  });
});

// Events I've checked into (for /app/events).
eventsApp.get("/api/my/events", async (c) => {
  const me = requireUser(c);
  const rows = await all(
    c.env.DB,
    `SELECT e.id, e.code, e.name, e.starts_at, e.venue, e.theme, e.strap_color,
            e.perks, e.directory_on, ch.created_at AS checked_in_at
     FROM checkins ch JOIN events e ON e.id = ch.event_id
     WHERE ch.user_id = ? ORDER BY ch.created_at DESC`,
    me.id
  );
  return c.json({
    events: rows.map((e) => ({
      id: e.id, code: e.code, name: e.name, startsAt: e.starts_at, venue: e.venue,
      theme: e.theme, strapColor: e.strap_color, perks: e.perks || [],
      directoryOn: !!e.directory_on, checkedInAt: e.checked_in_at,
    })),
  });
});
