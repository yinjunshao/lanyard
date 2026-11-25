// Events + check-in: public join view, check-in (ticket itself), the room
// directory, attendee perks, and the event album of connection selfies.
import { Hono } from "hono";
import { newId, now, one, all, run } from "./db.js";
import { newCardCode, giveBack, MISS_WINDOW_MS } from "./codes.js";
import { requireUser, HttpError } from "./session.js";
import { bump } from "./ratelimit.js";
import { termsScope, hasConsent, recordConsentStmt, logConsentStmt, logNoticeStmt } from "./legal.js";
import { blockedSet } from "./blocks.js";
import { eventInfo, feedbackOpensAt } from "./feedback.js";
import { checkinCapFor } from "./plans.js";
import { inkIn } from "../src/lib/eventlook.js";
import { noticeFor, choiceStatements } from "./attendance.js";
import { recordCheckin } from "./eventConnections.js";
import { readChoice, checkinSuggestStatements } from "./suggest.js";

export const eventsApp = new Hono();

// Event join codes are short, so wrong ones are limited per IP (F35.4): without this a script could
// find live events by guessing and check in from anywhere. A right code hands its place back, so a
// venue sharing one connection only ever counts its typos.
const EVENT_CODE_MISSES = 30;
async function eventByCode(c) {
  const db = c.env.DB;
  const key = [`code:ev:${c.req.header("cf-connecting-ip") || "local"}`];
  if ((await bump(db, key[0], MISS_WINDOW_MS)) > EVENT_CODE_MISSES) {
    throw new HttpError(429, "Too many wrong event codes. Wait a few minutes and try again.", "throttled");
  }
  const ev = await one(db, "SELECT * FROM events WHERE code = ?", c.req.param("code").toUpperCase());
  if (ev) await giveBack(db, key);
  return ev;
}

// Public event info by join code (what the QR opens).
eventsApp.get("/api/e/:code", async (c) => {
  const db = c.env.DB;
  const ev = await eventByCode(c);
  if (!ev) return c.json({ error: "We couldn't find an event with that code. Check it with the organiser and try again." }, 404);

  const me = c.get("user");
  const checkin = me
    ? await one(db, "SELECT created_at, answers, sponsor FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id)
    : null;
  const sponsors = await all(db, "SELECT id, name, perk FROM sponsors WHERE event_id = ?", ev.id);
  // F31: what this event collects, for the notice on the page. Only when the host switched it on.
  const collects = await noticeFor(db, ev);

  return c.json({
    event: {
      id: ev.id,
      code: ev.code,
      name: ev.name,
      startsAt: ev.starts_at,
      venue: ev.venue,
      theme: ev.theme,
      strapColor: ev.strap_color,
      strapInk: inkIn(ev), // F65 (D060): the words on the strap, only when the host set a colour or a text colour
      perks: ev.perks || [],
      directoryOn: !!ev.directory_on,
      questions: ev.checkin_questions || [],
      endsAt: ev.ends_at || null,
      ended: !!ev.ended_at,
      info: eventInfo(ev.info),
      feedbackOn: !!ev.feedback_on,
      ...(collects ? { collects } : {}),
      // F60: present only when the host switched suggestions off, so every other event answers as before.
      ...(ev.suggest_on ? {} : { suggestOn: false }),
    },
    sponsors: sponsors.map((s) => ({ id: s.id, name: s.name, perk: s.perk })),
    checkedIn: !!checkin,
    checkin: checkin ? { at: checkin.created_at, answers: checkin.answers } : null,
    feedbackOpensAt: checkin && ev.feedback_on ? feedbackOpensAt(ev, checkin.created_at) : null,
  });
});

// Check in. Requires a profile name; guests with no profile pass their name and
// get a stub profile they can claim later.
eventsApp.post("/api/e/:code/checkin", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await eventByCode(c);
  if (!ev) return c.json({ error: "We couldn't find an event with that code. Check it with the organiser and try again." }, 404);

  // Student societies are held to a hard check-in limit per event. People who
  // are already checked in can still update their details.
  if (ev.org_id) {
    const owner = await one(db, "SELECT org_type FROM orgs WHERE id = ?", ev.org_id);
    const cap = owner?.org_type === "society" ? checkinCapFor("society") : null;
    if (cap) {
      const already = await one(db, "SELECT 1 AS x FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
      const n = (await one(db, "SELECT COUNT(*) AS n FROM checkins WHERE event_id = ?", ev.id))?.n || 0;
      if (!already && n >= cap) {
        return c.json({ error: `This event is full (${cap} people have checked in). Ask the organisers.`, code: "event_full" }, 403);
      }
    }
  }

  const body = await c.req.json().catch(() => ({}));
  // Checking in is often someone's first action: it needs the Terms / Privacy
  // Policy and the 18+ confirmation, just like making a card or connecting.
  const agreed = await hasConsent(db, me.id, termsScope());
  if (!agreed && (body.acceptTerms !== true || body.over18 !== true)) {
    return c.json({ error: "Please confirm you're 18 or over and agree to the Terms and Privacy Policy.", code: "terms_required" }, 400);
  }
  // F60: what they hope to get from the event and the Suggest me tick, for an event with suggestions on. Only a real
  // true or false for the tick counts as having seen the notice; without one nothing is recorded (D054).
  const suggestChoice = ev.suggest_on && typeof body.suggest === "boolean" ? readChoice(body) : null;
  if (suggestChoice?.error) return c.json({ error: suggestChoice.error, code: "bad_suggest" }, 400);

  let profile = await one(db, "SELECT name FROM profiles WHERE user_id = ?", me.id);
  if (!profile) {
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "Add your name to check in." }, 400);
    await run(
      db,
      `INSERT INTO profiles (user_id, name, uni, course, headline, about, links, tags, projects, is_public, updated_at)
       VALUES (?, ?, '', '', '', '', '{}', '[]', '[]', 1, ?)`,
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
  if (!agreed) {
    stmts.push(recordConsentStmt(db, me.id, termsScope()), logNoticeStmt(db, me.id, termsScope(), "checkin")); // F51: by pressing Check in under the line
    stmts.push(db.prepare("UPDATE users SET over_18 = 1, age_confirmed_at = COALESCE(age_confirmed_at, ?) WHERE id = ?").bind(now(), me.id));
  }
  if (ev.directory_on) {
    stmts.push(db.prepare(
      `INSERT INTO consents (id, user_id, scope, granted, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, scope) DO UPDATE SET granted = excluded.granted, created_at = excluded.created_at`
    ).bind(newId(), me.id, `event_directory:${ev.id}`, directoryConsent, now()));
  }
  // F31: the person's choices at the notice. Only for an event that collects, and only when the
  // request carries them: a request with no choices changes nothing and puts nobody on the list.
  if (ev.collect_attendance && body.collect && typeof body.collect === "object") {
    stmts.push(...await choiceStatements(db, ev, me.id, body.collect));
  }
  if (suggestChoice) stmts.push(...checkinSuggestStatements(db, ev, me.id, suggestChoice));
  await db.batch(stmts);
  // Event analytics: scans made in this event's window before this check-in now count for it.
  await recordCheckin(db, ev.id, me.id).catch(() => console.error("event_connections: could not record a check-in"));

  return c.json({ ok: true, eventId: ev.id });
});

// The room: live directory of checked-in attendees. Public profiles only;
// blocked pairs are filtered out. Hosts never see who-connected-with-whom.
eventsApp.get("/api/e/:id/room", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await one(db, "SELECT * FROM events WHERE id = ?", c.req.param("id"));
  if (!ev) return c.json({ error: "We couldn't find that event. Reload the page and try again." }, 404);
  if (!ev.directory_on) return c.json({ event: { name: ev.name }, people: [] });

  const mine = await one(db, "SELECT created_at FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!mine) return c.json({ error: "Check in to this event to see who else is here." }, 403);

  const blocked = await blockedSet(db, me.id); // both directions

  const rows = await all(
    db,
    `SELECT p.user_id, p.name, p.photo_key, p.course, p.uni, p.mode, p.company, p.role, p.headline, p.tags,
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
        mode: r.mode || "student", company: r.company || "", role: r.role || "",
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
  if (!ev) return c.json({ error: "We couldn't find that event. Reload the page and try again." }, 404);
  const mine = await one(db, "SELECT 1 FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!mine) return c.json({ error: "Check in to this event to see its album." }, 403);

  const conns = await all(
    db,
    `SELECT cn.id, cn.selfie_key, cn.created_at, p.name AS peer_name
     FROM connections cn
     JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END
     WHERE cn.event_id = ? AND (cn.user_a = ? OR cn.user_b = ?) AND cn.selfie_key IS NOT NULL
       AND (cn.consent_b = 1 OR cn.selfie_by = ?)
     ORDER BY cn.created_at DESC`,
    me.id, ev.id, me.id, me.id, me.id
  );
  return c.json({
    photos: conns.map((x) => ({
      id: x.id, src: `/media/${x.selfie_key}`, peer: x.peer_name, at: x.created_at,
    })),
  });
});

// Your choices at an event (directory, named sponsors), changeable any time:
// withdrawing is as easy as giving. Every change is written to the consent history.
eventsApp.get("/api/e/:id/choices", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const ev = await one(db, "SELECT id, directory_on FROM events WHERE id = ?", c.req.param("id"));
  const mine = ev && await one(db, "SELECT sponsor FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!mine) return c.json({ error: "You haven't checked in to this event." }, 404);
  const dir = await one(db, "SELECT granted FROM consents WHERE user_id = ? AND scope = ?", me.id, `event_directory:${ev.id}`);
  const sponsors = await all(db, "SELECT id, name FROM sponsors WHERE event_id = ?", ev.id);
  const chosen = new Set(Array.isArray(mine.sponsor) ? mine.sponsor : []);
  return c.json({
    directoryOn: !!ev.directory_on,
    directory: !!dir?.granted,
    sponsors: sponsors.map((s) => ({ id: s.id, name: s.name, optedIn: chosen.has(s.id) })),
  });
});

eventsApp.put("/api/e/:id/choices", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  const ev = await one(db, "SELECT id, directory_on FROM events WHERE id = ?", c.req.param("id"));
  const mine = ev && await one(db, "SELECT sponsor FROM checkins WHERE event_id = ? AND user_id = ?", ev.id, me.id);
  if (!mine) return c.json({ error: "You haven't checked in to this event." }, 404);
  const valid = new Set((await all(db, "SELECT id FROM sponsors WHERE event_id = ?", ev.id)).map((s) => s.id));
  const before = new Set(Array.isArray(mine.sponsor) ? mine.sponsor : []);
  const after = new Set((Array.isArray(b.sponsors) ? b.sponsors : []).filter((id) => valid.has(id)));
  const stmts = [db.prepare("UPDATE checkins SET sponsor = ? WHERE event_id = ? AND user_id = ?").bind(JSON.stringify([...after]), ev.id, me.id)];
  for (const id of valid) {
    if (before.has(id) !== after.has(id)) stmts.push(logConsentStmt(db, me.id, `event_sponsor:${id}`, after.has(id) ? "granted" : "withdrawn", ev.id));
  }
  if (ev.directory_on && typeof b.directory === "boolean") {
    const was = await one(db, "SELECT granted FROM consents WHERE user_id = ? AND scope = ?", me.id, `event_directory:${ev.id}`);
    stmts.push(db.prepare(
      `INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, scope) DO UPDATE SET granted = excluded.granted, created_at = excluded.created_at`
    ).bind(newId(), me.id, `event_directory:${ev.id}`, b.directory ? 1 : 0, now()));
    if (!!was?.granted !== b.directory) stmts.push(logConsentStmt(db, me.id, `event_directory:${ev.id}`, b.directory ? "granted" : "withdrawn", ev.id));
  }
  await db.batch(stmts);
  return c.json({ ok: true });
});
