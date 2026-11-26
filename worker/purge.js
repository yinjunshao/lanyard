// Retention + erasure helpers (UK GDPR storage limitation / right to erasure).
import { all, one, run } from "./db.js";
import { deleteImage } from "./media.js";
import { sendMail } from "./mail.js";
import { inactiveEmail } from "./mail-templates.js";
import { publicOrigin } from "./unsub.js";
import { eraseUserPresence, purgePresence } from "./presence.js";
import { purgeAttendees } from "./attendance.js";
import { purgeSuggest } from "./suggest.js";
import { purgeDrops } from "./dropsKeep.js";
import { eraseAi, purgeAi } from "./ai/data.js";
import { forgetSearchReplies } from "./ai/optout.js";
import { purgeSummaries } from "./ai/feedbackSummary.js";
import { purgePending } from "./pending-email.js";
import { purgeStageStats } from "./stages.js";
import { drainMediaDeletes } from "./branding.js";
import { purgePremade } from "./premade.js";
import { purgeSuggestions } from "./suggestedEdits.js";

const DAY = 86400_000;
export const SELFIE_MAX_AGE = 365 * DAY;
export const GUEST_MAX_AGE = 30 * DAY;
export const CONSENT_KEEP = 6 * 365 * DAY;       // consent_log: proof of what was agreed
export const PENDING_SELFIE_MAX_AGE = 7 * DAY;    // a shared selfie nobody accepted
export const REPORT_KEEP = 365 * DAY;             // abuse reports about other people
export const AUDIT_KEEP = 365 * DAY;              // admin audit log
export const REQUEST_KEEP = 3 * 365 * DAY;        // privacy requests and complaints, after closing
export const FUNNEL_KEEP = 400 * DAY;             // daily welcome-step counts (no personal data)
export const INACTIVE_AFTER = 730 * DAY;          // 24 months unused
export const INACTIVE_WARNING = 30 * DAY;         // warned this long before deletion

const tryDel = (env, key) => (key ? deleteImage(env, key).catch(() => {}) : null);

function projectKeys(json) {
  try { return (JSON.parse(json || "[]") || []).map((p) => p?.image_key).filter(Boolean); } catch { return []; }
}

/** Delete everything a user owns, including R2 objects, then the user row. */
export async function eraseUser(env, userId) {
  const db = env.DB;
  const conns = await all(db, "SELECT selfie_key FROM connections WHERE user_a = ? OR user_b = ?", userId, userId);
  for (const c of conns) await tryDel(env, c.selfie_key);
  const msgs = await all(db,
    `SELECT m.photo_key FROM messages m JOIN connections c ON c.id = m.connection_id
     WHERE m.photo_key IS NOT NULL AND (c.user_a = ? OR c.user_b = ?)`, userId, userId);
  for (const m of msgs) await tryDel(env, m.photo_key);
  await eraseUserPresence(env, userId); // F17 event-presence selfies (the rows go with the user)
  await forgetSearchReplies(db); // F24: kept search results that could name this person
  await eraseAi(db, "user", userId); // F21 usage counts and any cached reply (no foreign key, so removed here)
  const prof = await one(db, "SELECT photo_key, projects FROM profiles WHERE user_id = ?", userId);
  if (prof) {
    await tryDel(env, prof.photo_key);
    for (const k of projectKeys(prof.projects)) await tryDel(env, k);
  }
  // F75: a suggested photo waiting for this person (the suggestion row goes with the user, by cascade).
  const sug = await one(db, "SELECT photo_key FROM profile_suggestions WHERE user_id = ?", userId).catch(() => null);
  await tryDel(env, sug?.photo_key);
  // Host accounts are separate (F10): organisations, events and invoices are not
  // the attendee's and are not touched here.
  // The consent history stays (it has no foreign key); record that the account went.
  await run(db, "INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES (?, ?, 'account', 'withdrawn', 'erased', ?)",
    lowerHex(), userId, Date.now());
  await run(db, "DELETE FROM users WHERE id = ?", userId); // cascades the rest
}

const lowerHex = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Scheduled clean-up. Safe to run repeatedly. */
export async function purgeExpired(env, ts = Date.now()) {
  const db = env.DB;
  const out = {};

  // Shared selfies older than 12 months.
  const old = await all(db,
    "SELECT id, selfie_key FROM connections WHERE selfie_key IS NOT NULL AND created_at < ?", ts - SELFIE_MAX_AGE);
  for (const c of old) {
    await tryDel(env, c.selfie_key);
    await run(db, "UPDATE connections SET selfie_key = NULL WHERE id = ?", c.id);
  }
  out.selfies = old.length;

  // Shared selfies the second person never accepted.
  const pending = await all(db,
    "SELECT id, selfie_key FROM connections WHERE selfie_key IS NOT NULL AND consent_b = 0 AND selfie_at IS NOT NULL AND selfie_at < ?",
    ts - PENDING_SELFIE_MAX_AGE);
  for (const c of pending) {
    await tryDel(env, c.selfie_key);
    await run(db, "UPDATE connections SET selfie_key = NULL, selfie_by = NULL, selfie_at = NULL, consent_a = 0 WHERE id = ?", c.id);
  }
  out.pendingSelfies = pending.length;

  // F17: presence rows and their selfies, 48 hours after the event ends.
  out.presence = await purgePresence(env, ts);
  out.suggest = await purgeSuggest(env, ts); // F60: intentions and Suggest me choices, 48 hours after the event ends

  // F31: a host's list of who checked in, 12 months after the event ends.
  out.attendees = await purgeAttendees(db, ts);

  // F32: given items, unused lists and voucher uses, 30 days after the event ends.
  out.drops = await purgeDrops(db, ts);

  // F21: cached AI replies after 7 days, usage counts after 13 months, rows for accounts that are gone.
  Object.assign(out, await purgeAi(db, ts));

  // F45: an email typed when connecting or making a card and never confirmed, 30 days after it was typed.
  out.pendingEmails = await purgePending(db, ts);

  // F74: profiles the admin made that nobody claimed, 30 days after they were made, with their photos.
  out.premade = await purgePremade(env, ts);

  // F75: details suggested for a card and not answered, 30 days after they were made, with their photos.
  out.suggestions = await purgeSuggestions(env, ts);

  // F66: logos the database stopped pointing at (replaced, removed, or their organisation deleted) and not yet deleted from R2.
  out.mediaDeletes = await drainMediaDeletes(env);

  await run(db, "DELETE FROM reports WHERE created_at < ?", ts - REPORT_KEEP);
  await run(db, "DELETE FROM consent_log WHERE at < ?", ts - CONSENT_KEEP);
  await run(db, "DELETE FROM admin_audit WHERE at < ?", ts - AUDIT_KEEP);
  await run(db, "DELETE FROM privacy_requests WHERE status = 'closed' AND closed_at < ?", ts - REQUEST_KEEP);
  await run(db, "DELETE FROM event_mail_log WHERE sent_at < ?", ts - 365 * DAY);
  await run(db, "DELETE FROM onboarding_stats WHERE day < ?", new Date(ts - FUNNEL_KEEP).toISOString().slice(0, 10));
  await purgeStageStats(db, ts); // F59: the daily tip counts, as long as the welcome-step counts
  Object.assign(out, await expireInactive(env, ts));

  await run(db, "DELETE FROM sessions WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM login_codes WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM email_codes WHERE expires_at < ?", ts); // otherwise cleared only when that address asks again
  await run(db, "DELETE FROM host_sessions WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM host_login_codes WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM host_org_invites WHERE expires_at < ?", ts);
  await run(db, "DELETE FROM rate_limits WHERE window_start < ?", ts - 2 * DAY);
  await run(db, "DELETE FROM webauthn_challenges WHERE expires_at < ?", ts);

  // Feedback: free-text answers are removed after 12 months; the anonymous
  // ratings and choices stay for the host's year-on-year comparison.
  const oldText = await all(db,
    "SELECT id, event_id, answers FROM feedback_responses WHERE day < ? AND answers LIKE '%\"text\":{\"%' LIMIT 500", ts - SELFIE_MAX_AGE);
  for (const r of oldText) {
    const a = typeof r.answers === "string" ? JSON.parse(r.answers) : r.answers;
    await run(db, "UPDATE feedback_responses SET answers = ? WHERE id = ?", JSON.stringify({ closed: a?.closed || {}, text: {} }), r.id);
  }
  out.feedbackText = oldText.length;
  // F23: an AI summary of that feedback quotes the written answers, so it is removed with them.
  out.feedbackSummaries = await purgeSummaries(db, oldText.map((r) => r.event_id), ts, SELFIE_MAX_AGE);
  await run(db, "DELETE FROM card_notes WHERE redeemed_at IS NULL AND created_at < ?", ts - DAY);

  // Guests who never made a profile and have no live session.
  const stale = await all(db,
    `SELECT u.id FROM users u
      WHERE u.is_guest = 1 AND u.created_at < ?
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?)
      LIMIT 500`, ts - GUEST_MAX_AGE, ts);
  for (const u of stale) await run(db, "DELETE FROM users WHERE id = ?", u.id);
  out.guests = stale.length;
  return out;
}

// Accounts nobody has used for 24 months. Anyone with a verified email gets a
// warning 30 days before deletion; signing in at all resets the clock.
export async function expireInactive(env, ts = Date.now()) {
  const db = env.DB;
  const out = { inactiveWarned: 0, inactiveDeleted: 0 };
  const origin = publicOrigin(env);
  const warn = await all(db,
    `SELECT id, recovery_email AS email FROM users
      WHERE is_guest = 0 AND last_seen_at < ? AND inactive_warned_at IS NULL AND email_verified = 1 LIMIT 200`,
    ts - INACTIVE_AFTER + INACTIVE_WARNING);
  for (const u of warn) {
    try {
      await sendMail(env, "accounts", { to: u.email, ...inactiveEmail({ origin, days: Math.round(INACTIVE_WARNING / DAY) }) });
      await run(db, "UPDATE users SET inactive_warned_at = ? WHERE id = ?", ts, u.id);
      out.inactiveWarned += 1;
    } catch (e) { console.error(e); }
  }
  // Warned and still silent a month later, or never reachable by email. A guest who has a profile (one who
  // connected from a card makes a stub one) is not covered by the guest rule in purgeExpired, so it is covered
  // here: it has no confirmed email, so it goes at 24 months unused without a warning, like a claimed account with none.
  const gone = await all(db,
    `SELECT id FROM users WHERE last_seen_at < ?
       AND (is_guest = 0 OR EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = users.id))
       AND ((inactive_warned_at IS NOT NULL AND inactive_warned_at < ?) OR email_verified = 0) LIMIT 100`,
    ts - INACTIVE_AFTER, ts - INACTIVE_WARNING);
  for (const u of gone) { await eraseUser(env, u.id); out.inactiveDeleted += 1; }
  return out;
}
