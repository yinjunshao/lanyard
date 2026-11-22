// F49: finish-your-profile emails, run hourly by the scheduler (D051 has the reasons).
// At most NUDGE_MAX emails to a person, in total and ever, and only while their profile is under 6 of 6.
//
// Email 1: the anchor is the later of (a) the end of an event they checked in to, in the last 24 hours, and
//   (b) their latest connection in the last 24 hours. It goes at the first hourly run at or after anchor + 75 min,
//   so nobody is emailed while connections are still coming in, nor while they are still at an event that has not
//   ended. Only between 08:30 and 23:00 in their own time zone (users.tz, London if unknown); an email that would
//   fall in the quiet hours waits for the first run from 08:30.
// Email 2: only if the profile is still under 6 and has not been saved since email 1 (profiles.updated_at): at the
//   first run from 19:00 on the next day in their time zone, at least 18 hours after email 1, and never more than
//   48 hours after it.
// Never to someone who switched reminders off (users.notify_reminders, the F48 switch), who has no address we may
// email, no profile, a deleted account, or whose only activity is more than 24 hours old.
//
// "Once" is a conditional write made before anything is sent (D040): each email is claimed with one UPDATE that
// re-checks the rules in the same statement, so two runs at once send it once. A claim that could not be used (no
// address now, a refused send, any error) is handed back so the next hour can try, still inside the windows.
import { all, one, run, now } from "./db.js";
import { sendBatch } from "./mail.js";
import { profileNudgeEmail, withConfirm } from "./mail-templates.js";
import { emailLink, publicOrigin } from "./unsub.js";
import { mailableAddress, releaseMail, confirmLink, hasMailableSql, validTz } from "./pending-email.js";
import { NOT_BLOCKED } from "./followupmail.js";
import { profileScore } from "../src/lib/profileScore.js";

const MIN = 60e3, HOUR = 3600e3;
export const NUDGE_MAX = 2;                  // emails to one person, in total and ever (the owner's open question: D051)
export const FIRST_AFTER_MS = 75 * MIN;      // email 1: at the first run this long after the anchor
export const ACTIVITY_MS = 24 * HOUR;        // an event end or a connection older than this is not an anchor
export const SECOND_MIN_GAP_MS = 18 * HOUR;  // email 2: at least this long after email 1 ...
export const SECOND_MAX_GAP_MS = 48 * HOUR;  // ... and never later than this
const ASSUMED_LENGTH_MS = 4 * HOUR;          // events with no end time (as in eventmail.js)
const SEND_FROM = 8 * 60 + 30;               // local minutes: nothing before 08:30 ...
const QUIET_FROM = 23 * 60;                  // ... or from 23:00
const EVENING = 19 * 60;                     // email 2 goes from 19:00
const PER_RUN = 300;                         // emails per run (both kinds); the next hour carries on
const ROWS = 1500;                           // people looked at per kind per run
const DEFAULT_TZ = "Europe/London";

const endOf = `COALESCE(e.ended_at, e.ends_at, e.starts_at + ${ASSUMED_LENGTH_MS})`;

/** The date (as yyyymmdd) and the minutes since midnight at `ts` in a time zone; London if the zone is unknown. */
export function localTime(ts, tz) {
  const zone = validTz(tz) || DEFAULT_TZ;
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(ts)) p[x.type] = Number(x.value);
  return { day: p.year * 10000 + p.month * 100 + p.day, minutes: (p.hour % 24) * 60 + p.minute };
}
/** Whether an email may go at `ts` for this person: from 08:30 until 23:00 their time. */
export const mayEmailNow = (ts, tz) => { const { minutes } = localTime(ts, tz); return minutes >= SEND_FROM && minutes < QUIET_FROM; };
/** Whether email 2 is allowed at `ts` given when email 1 went: a later local day, from 19:00 until 23:00, 18 to 48 hours on. */
export function secondIsDue(ts, firstAt, tz) {
  const n = localTime(ts, tz), f = localTime(firstAt, tz);
  const gap = ts - firstAt;
  return n.day > f.day && n.minutes >= EVENING && n.minutes < QUIET_FROM && gap >= SECOND_MIN_GAP_MS && gap <= SECOND_MAX_GAP_MS;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

const PROFILE_COLS = "p.name, p.photo_key, p.mode, p.uni, p.course, p.company, p.role, p.headline, p.links, p.updated_at";
const SWITCHED_ON = (u) => `${u}.notify_reminders = 1 AND ${hasMailableSql(u)}`;

/** Email 1: people whose anchor is old enough, not too old, with no email yet. One row per person. */
async function firstCandidates(db, ts) {
  return all(db,
    `WITH hits(user_id, t) AS (
       SELECT c.user_id, ${endOf} FROM checkins c JOIN events e ON e.id = c.event_id
        WHERE ${endOf} <= ?1 AND ${endOf} > ?2
       UNION ALL SELECT user_a, created_at FROM connections WHERE created_at > ?2 AND created_at <= ?1
       UNION ALL SELECT user_b, created_at FROM connections WHERE created_at > ?2 AND created_at <= ?1
     ), anchors AS (
       SELECT user_id, MAX(t) AS anchor FROM hits GROUP BY user_id HAVING MAX(t) <= ?3
     )
     SELECT u.id, u.tz, a.anchor, ${PROFILE_COLS}
       FROM anchors a JOIN users u ON u.id = a.user_id JOIN profiles p ON p.user_id = u.id
      WHERE u.profile_nudges = 0 AND ${SWITCHED_ON("u")}
        AND NOT EXISTS (SELECT 1 FROM checkins k JOIN events e ON e.id = k.event_id
                         WHERE k.user_id = u.id AND ${endOf} > ?1 AND COALESCE(e.starts_at, k.created_at) <= ?1)
      ORDER BY a.anchor, u.id LIMIT ?4`,
    ts, ts - ACTIVITY_MS, ts - FIRST_AFTER_MS, ROWS);
}

/** Email 2: people who had email 1 between 18 and 48 hours ago and have not saved their profile since. */
async function secondCandidates(db, ts) {
  return all(db,
    `SELECT u.id, u.tz, u.profile_nudge_at AS first_at, ${PROFILE_COLS}
       FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.profile_nudges = 1 AND u.profile_nudge_at <= ? AND u.profile_nudge_at >= ?
        AND p.updated_at <= u.profile_nudge_at AND ${SWITCHED_ON("u")}
      ORDER BY u.profile_nudge_at, u.id LIMIT ?`,
    ts - SECOND_MIN_GAP_MS, ts - SECOND_MAX_GAP_MS, ROWS);
}

/** Claims email 1 for sending. True only for the one caller whose write changed the row. */
async function claimFirst(db, id, ts) {
  const row = await one(db,
    `UPDATE users SET profile_nudges = 1, profile_nudge_at = ?1
      WHERE id = ?2 AND profile_nudges = 0 AND profile_nudges < ?3 AND notify_reminders = 1
        AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = users.id)
        AND NOT EXISTS (SELECT 1 FROM connections c2 WHERE (c2.user_a = users.id OR c2.user_b = users.id) AND c2.created_at > ?4)
      RETURNING id`, ts, id, NUDGE_MAX, ts - FIRST_AFTER_MS);
  return !!row;
}
/** Claims email 2: still the second, the profile not saved since email 1, in the time window. */
async function claimSecond(db, id, firstAt, ts) {
  const row = await one(db,
    `UPDATE users SET profile_nudges = 2, profile_nudge_at = ?1
      WHERE id = ?2 AND profile_nudges = 1 AND profile_nudges < ?3 AND profile_nudge_at = ?4 AND notify_reminders = 1
        AND profile_nudge_at <= ?5 AND profile_nudge_at >= ?6
        AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.user_id = users.id AND pr.updated_at <= users.profile_nudge_at)
      RETURNING id`, ts, id, NUDGE_MAX, firstAt, ts - SECOND_MIN_GAP_MS, ts - SECOND_MAX_GAP_MS);
  return !!row;
}
/** Hands a claim back (nothing was sent). Only if it is still the claim this run made. */
async function unclaim(db, id, kind, ts, firstAt) {
  await run(db, "UPDATE users SET profile_nudges = ?, profile_nudge_at = ? WHERE id = ? AND profile_nudges = ? AND profile_nudge_at = ?",
    kind === 1 ? 0 : 1, kind === 1 ? null : firstAt, id, kind, ts);
}

/** Up to two first names of people they met since `since` (not blocked either way). Nothing else about anyone. */
async function metNames(db, id, since, ts) {
  const rows = await all(db,
    `SELECT p.name FROM connections cn
       JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ?1 THEN cn.user_b ELSE cn.user_a END
      WHERE (cn.user_a = ?1 OR cn.user_b = ?1) AND cn.created_at > ?2 AND cn.created_at <= ?3 AND ${NOT_BLOCKED("cn")}
      ORDER BY cn.created_at DESC, cn.id LIMIT 8`, id, since, ts);
  const seen = new Set(), out = [];
  for (const r of rows) {
    const n = firstName(r.name);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase()); out.push(n);
    if (out.length === 2) break;
  }
  return out;
}

export async function sendProfileNudges(env, ts = now()) {
  const db = env.DB;
  const origin = publicOrigin(env);
  const out = { first: 0, second: 0 };
  const jobs = [];

  for (const kind of [1, 2]) {
    const rows = kind === 1 ? await firstCandidates(db, ts) : await secondCandidates(db, ts);
    for (const row of rows) {
      if (jobs.length >= PER_RUN) break;
      const scored = profileScore(row);
      if (scored.score >= scored.max) continue;                                  // finished: nothing, ever
      if (kind === 1 ? !mayEmailNow(ts, row.tz) : !secondIsDue(ts, row.first_at, row.tz)) continue;
      let claimed = false, addr = null;
      try {
        claimed = kind === 1 ? await claimFirst(db, row.id, ts) : await claimSecond(db, row.id, row.first_at, ts);
        if (!claimed) continue;                                                  // someone else has it, or a rule no longer holds
        // Only now that there is something to send: for an unconfirmed address this call is itself a claim.
        addr = await mailableAddress(db, row.id);
        if (!addr) { await unclaim(db, row.id, kind, ts, row.first_at); continue; }
        const names = await metNames(db, row.id, (kind === 1 ? ts : row.first_at) - ACTIVITY_MS, ts);
        const message = profileNudgeEmail({
          second: kind === 2, names, score: scored.score, max: scored.max, missing: scored.missing.map((m) => m.label),
          url: `${origin}/app/profile`, stopUrl: await emailLink(env, origin, row.id, "reminders"),
        });
        let finalMsg = message;
        if (addr.pending) {
          const url = await confirmLink(db, origin, row.id, addr.to);
          if (!url) { await releaseMail(db, row.id, addr.to); await unclaim(db, row.id, kind, ts, row.first_at); continue; } // the address changed meanwhile
          finalMsg = withConfirm(message, url);
        }
        jobs.push({ id: row.id, kind, firstAt: row.first_at, to: addr.to, pending: addr.pending, msg: { to: addr.to, ...finalMsg } });
      } catch (e) {
        // Whatever went wrong, nothing was sent for this person: hand back what was claimed.
        console.error("finish-your-profile emails: could not prepare one");
        if (addr?.pending) await releaseMail(db, row.id, addr.to).catch(() => {});
        if (claimed) await unclaim(db, row.id, kind, ts, row.first_at).catch(() => {});
      }
    }
  }

  for (let i = 0; i < jobs.length; i += 100) {
    const chunk = jobs.slice(i, i + 100);
    try {
      await sendBatch(env, "accounts", chunk.map((j) => j.msg));
      for (const j of chunk) j.kind === 1 ? out.first++ : out.second++;
    } catch (e) {
      console.error("finish-your-profile emails: a batch could not be sent");
      for (const j of chunk) {
        if (j.pending) await releaseMail(db, j.id, j.to).catch(() => {});
        await unclaim(db, j.id, j.kind, ts, j.firstAt).catch(() => {});
      }
    }
  }
  return out;
}
