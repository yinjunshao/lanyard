// Post-event emails, run hourly by the scheduler. About a day after an event
// ends (and for up to a week after, in case a run was missed):
//   - attendees who checked in, have a verified email, haven't answered the
//     feedback form and haven't switched reminders off get ONE reminder;
//   - the event's owner gets a recap.
// event_mail_log guarantees each email is sent at most once per person per event.
import { all, one, run, now } from "./db.js";
import { sendBatch, sendMail } from "./mail.js";
import { feedbackReminderEmail, hostSummaryEmail } from "./mail-templates.js";
import { emailLink, publicOrigin } from "./unsub.js";

const HOUR = 3600e3;
const WAIT_MS = 24 * HOUR;          // how long after the end
const WINDOW_MS = 7 * 24 * HOUR;    // give up after this long
const ASSUMED_LENGTH_MS = 4 * HOUR; // events with no end time
const PER_RUN = 300;                // recipients per run; the next hour carries on

const endOf = `COALESCE(e.ended_at, e.ends_at, e.starts_at + ${ASSUMED_LENGTH_MS})`;

export async function sendEventEmails(env, ts = now()) {
  const db = env.DB;
  const origin = publicOrigin(env);
  const out = { reminders: 0, summaries: 0 };

  const events = await all(db,
    `SELECT e.id, e.name, e.org_id, e.feedback_on FROM events e
      WHERE e.org_id IS NOT NULL AND e.starts_at IS NOT NULL
        AND ${endOf} <= ? AND ${endOf} >= ?`, ts - WAIT_MS, ts - WINDOW_MS);

  let budget = PER_RUN;
  for (const ev of events) {
    if (ev.feedback_on && budget > 0) {
      const people = await all(db,
        `SELECT u.id, u.recovery_email AS email FROM checkins c JOIN users u ON u.id = c.user_id
          WHERE c.event_id = ? AND u.email_verified = 1 AND u.notify_events = 1
            AND NOT EXISTS (SELECT 1 FROM feedback_done f WHERE f.event_id = c.event_id AND f.user_id = c.user_id)
            AND NOT EXISTS (SELECT 1 FROM event_mail_log m WHERE m.event_id = c.event_id AND m.user_id = c.user_id AND m.kind = 'feedback')
          LIMIT ?`, ev.id, budget);
      if (people.length) {
        const msgs = [];
        for (const p of people) {
          msgs.push({
            to: p.email,
            ...feedbackReminderEmail({
              eventName: ev.name,
              url: `${origin}/app/feedback/${ev.id}`,
              stopUrl: await emailLink(env, origin, p.id, "events"),
            }),
          });
        }
        await sendBatch(env, "accounts", msgs);
        for (let i = 0; i < people.length; i += 50) {
          await db.batch(people.slice(i, i + 50).map((p) =>
            db.prepare("INSERT OR IGNORE INTO event_mail_log (event_id, user_id, kind, sent_at) VALUES (?, ?, 'feedback', ?)").bind(ev.id, p.id, ts)));
        }
        out.reminders += people.length;
        budget -= people.length;
      }
    }

    // The recap goes out once per event.
    const owner = await one(db,
      `SELECT m.user_id, hp.email FROM org_members m JOIN host_profiles hp ON hp.user_id = m.user_id
        WHERE m.org_id = ? AND m.role = 'owner' LIMIT 1`, ev.org_id);
    if (!owner?.email) continue;
    const already = await one(db, "SELECT 1 AS x FROM event_mail_log WHERE event_id = ? AND user_id = ? AND kind = 'host_summary'", ev.id, owner.user_id);
    if (already) continue;
    const n = async (sql) => (await one(db, sql, ev.id))?.n || 0;
    await sendMail(env, "decisions", {
      to: owner.email,
      ...hostSummaryEmail({
        eventName: ev.name,
        checkins: await n("SELECT COUNT(*) AS n FROM checkins WHERE event_id = ?"),
        connections: await n("SELECT COUNT(*) AS n FROM connections WHERE event_id = ?"),
        responses: await n("SELECT COUNT(*) AS n FROM feedback_responses WHERE event_id = ?"),
        nudged: await n("SELECT COUNT(*) AS n FROM event_mail_log WHERE event_id = ? AND kind = 'feedback'"),
        url: `${origin}/host/events/${ev.id}`,
      }),
    });
    await run(db, "INSERT OR IGNORE INTO event_mail_log (event_id, user_id, kind, sent_at) VALUES (?, ?, 'host_summary', ?)", ev.id, owner.user_id, ts);
    out.summaries += 1;
  }
  return out;
}
