// F48: follow-up reminder emails, run hourly by the scheduler.
// A reminder someone set on a connection (notes.remind_at, in ms) is emailed once, when it is due:
//   - due now, and not more than 48 hours overdue (so the first run after a deploy does not mail old ones);
//   - not followed up, the connection still there, nobody blocked either way;
//   - the person has the reminder switch on (users.notify_reminders) and an address we may email
//     (a confirmed one, or an unconfirmed one that has had fewer than two emails: mailableAddress).
// One email per person per run names everyone who is due. The email holds first names and the event name,
// never the private note, a tag, an email address or the other person's links.
//
// "Once" is a conditional write, made before anything is sent (D040): the job claims each reminder with one
// UPDATE that sets reminder_mailed_for to the remind_at it read and re-checks every rule above in the same
// statement, so two runs at the same moment cannot both claim it. A reminder moved to another time differs
// from reminder_mailed_for and is mailed again then; the same time set again is not. A claim that could not be
// used (no address now, or the send failed) is handed back so the next hour can try, still inside the 48 hours.
import { all, one, run, now } from "./db.js";
import { sendBatch } from "./mail.js";
import { followupReminderEmail } from "./mail-templates.js";
import { emailLink, publicOrigin } from "./unsub.js";
import { mailableAddress, releaseMail, confirmLink, hasMailableSql } from "./pending-email.js";
import { withConfirm } from "./mail-templates.js";

const HOUR = 3600e3;
export const OVERDUE_MS = 48 * HOUR;  // older than this when the job runs: never mailed
const PER_RUN = 300;                  // people emailed per run; the next hour carries on
const ROWS = 1500;                    // reminders looked at per run

// Nobody has blocked the other, in either direction. `cn` is the connection's table alias.
const NOT_BLOCKED = (cn) => `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ${cn}.user_a AND b.blocked_id = ${cn}.user_b) OR (b.blocker_id = ${cn}.user_b AND b.blocked_id = ${cn}.user_a))`;

/** Claims one reminder for sending. True only for the one caller whose write changed the row. */
async function claim(db, userId, connectionId, remindAt, ts) {
  const row = await one(db,
    `UPDATE notes SET reminder_mailed_for = remind_at
      WHERE user_id = ? AND connection_id = ? AND remind_at = ?
        AND remind_at <= ? AND remind_at >= ?
        AND followed_up_at IS NULL AND reminder_mailed_for IS NOT remind_at
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = notes.user_id AND u.notify_reminders = 1)
        AND EXISTS (SELECT 1 FROM connections cn WHERE cn.id = notes.connection_id AND ${NOT_BLOCKED("cn")})
      RETURNING connection_id`,
    userId, connectionId, remindAt, ts, ts - OVERDUE_MS);
  return !!row;
}

/** Hands a claim back (nothing was sent) so a later run can mail it. Only if the reminder is still that time. */
async function unclaim(db, userId, connectionId, remindAt) {
  await run(db, "UPDATE notes SET reminder_mailed_for = NULL WHERE user_id = ? AND connection_id = ? AND remind_at = ? AND reminder_mailed_for = ?",
    userId, connectionId, remindAt, remindAt);
}

const giveBack = async (db, userId, rows) => { for (const r of rows) await unclaim(db, userId, r.connection_id, r.remind_at); };
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

export async function sendFollowupEmails(env, ts = now()) {
  const db = env.DB;
  const origin = publicOrigin(env);
  const out = { emails: 0, reminders: 0 };

  const rows = await all(db,
    `SELECT n.user_id, n.connection_id, n.remind_at, p.name AS peer_name, ev.name AS event_name
       FROM notes n
       JOIN users u ON u.id = n.user_id
       JOIN connections cn ON cn.id = n.connection_id
       JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = n.user_id THEN cn.user_b ELSE cn.user_a END
       LEFT JOIN events ev ON ev.id = cn.event_id
      WHERE n.remind_at <= ? AND n.remind_at >= ? AND n.followed_up_at IS NULL
        AND n.reminder_mailed_for IS NOT n.remind_at
        AND u.notify_reminders = 1
        AND ${hasMailableSql("u")}
        AND ${NOT_BLOCKED("cn")}
      ORDER BY n.user_id, n.remind_at, n.connection_id
      LIMIT ?`, ts, ts - OVERDUE_MS, ROWS);

  // Group by person. When the row limit cut the last person's list short, leave them to the next hour so
  // nobody gets two emails from one pass.
  const byUser = new Map();
  for (const r of rows) (byUser.get(r.user_id) || byUser.set(r.user_id, []).get(r.user_id)).push(r);
  if (rows.length >= ROWS && byUser.size > 1) byUser.delete(rows[rows.length - 1].user_id);

  const jobs = [];
  for (const [userId, list] of byUser) {
    if (jobs.length >= PER_RUN) break;
    const mine = [];
    let addr = null;
    try {
      for (const r of list) if (await claim(db, userId, r.connection_id, r.remind_at, ts)) mine.push(r);
      if (!mine.length) continue;                       // someone else has them, or a rule no longer holds
      // Only now that there is something to send: for an unconfirmed address this call is itself a claim.
      addr = await mailableAddress(db, userId);
      if (!addr) { await giveBack(db, userId, mine); continue; }
      const message = followupReminderEmail({
        people: mine.map((r) => ({ first: firstName(r.peer_name), event: r.event_name || "", url: `${origin}/app/people/${r.connection_id}` })),
        total: mine.length,
        listUrl: `${origin}/app/people`,
        stopUrl: await emailLink(env, origin, userId, "reminders"),
      });
      let finalMsg = message;
      if (addr.pending) {
        const url = await confirmLink(db, origin, userId, addr.to);
        if (!url) { await releaseMail(db, userId, addr.to); await giveBack(db, userId, mine); continue; } // the address changed meanwhile
        finalMsg = withConfirm(message, url);
      }
      jobs.push({ userId, to: addr.to, pending: addr.pending, mine, msg: { to: addr.to, ...finalMsg } });
    } catch (e) {
      // Whatever went wrong, nothing was sent for this person: hand back what was claimed.
      console.error("follow-up reminder emails: could not prepare one");
      if (addr?.pending) await releaseMail(db, userId, addr.to).catch(() => {});
      await giveBack(db, userId, mine).catch(() => {});
    }
  }

  for (let i = 0; i < jobs.length; i += 100) {
    const chunk = jobs.slice(i, i + 100);
    try {
      await sendBatch(env, "accounts", chunk.map((j) => j.msg));
      out.emails += chunk.length;
      out.reminders += chunk.reduce((n, j) => n + j.mine.length, 0);
    } catch (e) {
      console.error("follow-up reminder emails: a batch could not be sent");
      for (const j of chunk) {
        if (j.pending) await releaseMail(db, j.userId, j.to).catch(() => {});
        await giveBack(db, j.userId, j.mine).catch(() => {});
      }
    }
  }
  return out;
}
