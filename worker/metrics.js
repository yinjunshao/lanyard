// F70 (D062): platform metrics for the admin page, and a daily snapshot of them.
//
// The one rule: only totals leave this file. `computeMetrics` reads every account (counts, and the six scored profile
// columns in pages) and returns a flat object of numbers: no id, name, email, card code or text, so nothing that
// reaches the admin page, the snapshot row or the CSV can name a person. Every value is a finite number, never negative.
//
// Meaning of the numbers (METRICS_VERSION goes up when one changes):
//  - "accounts" are every row in `users`, guests included; "claimed" accounts are is_guest = 0.
//  - Profile percentages are out of all accounts, so 4 complete profiles out of 10 accounts is 40.0.
//  - Active use is `users.last_seen_at`, which the app refreshes at most once a day, so it is a day-level figure:
//    active_1d under-counts a little, and "returned" is rough (one last-seen time per person).
//  - Money is what billing_orders say was paid (status 'paid', so a refunded order is out) and what was bought.
// A percentage is 0 to 100 with one decimal, and 0 when its base is 0.
import { now, one, all } from "./db.js";
import { profileScore } from "../src/lib/profileScore.js";
import { LAST_STEP } from "./onboarding.js";

// 2 (F74, D063): profiles the admin made that are waiting to be claimed are not people yet. They are left out of every
// count of accounts, profiles and cards, and counted on their own as premade_waiting.
export const METRICS_VERSION = 2;
export const PAGE = 500; // profiles read at a time
const DAY = 86400_000;

const pct = (n, of) => (of > 0 ? Math.round((n / of) * 1000) / 10 : 0);
const ratio = (n, of) => (of > 0 ? Math.round((n / of) * 100) / 100 : 0);
// A value that is not a finite number, or is negative, is 0: the CSV relies on metrics never being negative.
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const S = (cond) => `COALESCE(SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END), 0)`;

export const dayOf = (t = now()) => new Date(t).toISOString().slice(0, 10);

/** The same Plus rule as `planOf` (worker/plans.js): plan 'plus' and not ended (no end date, or one in the future). */
// F74: not an unclaimed admin-made account (an account row, then a user_id column).
const REAL = "NOT (admin_made = 1 AND is_guest = 1)";
const REAL_ID = (col) => `${col} NOT IN (SELECT id FROM users WHERE admin_made = 1 AND is_guest = 1)`;

const PLUS_SQL = "plan = 'plus' AND (plan_until IS NULL OR plan_until = 0 OR plan_until > ?1)";

export async function computeMetrics(db, ts = now()) {
  const d1 = ts - DAY, d7 = ts - 7 * DAY, d30 = ts - 30 * DAY, d60 = ts - 60 * DAY;
  const day30 = Math.floor(d30 / DAY) * DAY; // feedback keeps only the UTC day
  // One query for each table, run together: nothing here runs once per person.
  const [u, p, cards, conn, connected, org, hostAcc, ev, ci, fb, orders, credits, premade] = await Promise.all([
    one(db, `SELECT COUNT(*) AS total, ${S("is_guest = 0")} AS claimed, ${S("is_guest = 1")} AS guests,
        ${S("email_verified = 1")} AS confirmed,
        ${S("created_at >= ?2")} AS s1, ${S("created_at >= ?3")} AS s7, ${S("created_at >= ?4")} AS s30,
        ${S("last_seen_at >= ?2")} AS a1, ${S("last_seen_at >= ?3")} AS a7, ${S("last_seen_at >= ?4")} AS a30,
        ${S("is_guest = 0 AND last_seen_at >= ?4")} AS a30c,
        ${S("created_at >= ?5 AND created_at < ?4")} AS cohort, ${S("created_at >= ?5 AND created_at < ?4 AND last_seen_at >= ?4")} AS back,
        ${S("is_guest = 0 AND app_installed_at IS NOT NULL")} AS installed, ${S("is_guest = 0 AND has_passkey = 1")} AS passkey,
        ${S(PLUS_SQL)} AS plus
      FROM users WHERE ${REAL}`, ts, d1, d7, d30, d60),
    one(db, `SELECT COUNT(*) AS total, ${S("mode = 'career'")} AS career, ${S("mode != 'career'")} AS student,
        ${S("onboarding_max >= 1")} AS started, ${S(`onboarding_max > ${LAST_STEP}`)} AS done FROM profiles WHERE ${REAL_ID("user_id")}`),
    one(db, `SELECT COUNT(DISTINCT user_id) AS n FROM cards WHERE ${REAL_ID("user_id")}`),
    one(db, `SELECT COUNT(*) AS total, ${S("created_at >= ?1")} AS c7, ${S("created_at >= ?2")} AS c30 FROM connections`, d7, d30),
    one(db, "SELECT COUNT(*) AS n FROM (SELECT user_a AS u FROM connections UNION SELECT user_b FROM connections)"),
    one(db, `SELECT COUNT(*) AS total, ${S("verification_status = 'approved'")} AS approved FROM orgs`),
    one(db, "SELECT COUNT(*) AS n FROM host_accounts WHERE deleted_at IS NULL"),
    one(db, `SELECT COUNT(*) AS total, ${S("COALESCE(starts_at, created_at) >= ?1 AND COALESCE(starts_at, created_at) <= ?2")} AS e30 FROM events`, d30, ts),
    one(db, `SELECT COUNT(*) AS total, ${S("created_at >= ?1")} AS c30,
        COUNT(DISTINCT CASE WHEN created_at >= ?1 THEN event_id END) AS ev30 FROM checkins`, d30),
    one(db, "SELECT COUNT(*) AS n FROM feedback_responses WHERE day >= ?", day30),
    one(db, `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN currency = 'gbp' THEN amount_pence ELSE 0 END), 0) AS pence
        FROM billing_orders WHERE status = 'paid' AND paid_at >= ?`, d30),
    one(db, "SELECT COALESCE(SUM(events_granted), 0) AS n FROM credits WHERE granted_by = 'polar' AND created_at >= ?", d30),
    one(db, "SELECT COUNT(*) AS n FROM users WHERE admin_made = 1 AND is_guest = 1"),
  ]);

  // Profile completeness: the same six points as Edit profile and the emails (src/lib/profileScore.js), read in pages.
  const spread = [0, 0, 0, 0, 0, 0, 0];
  let withPhoto = 0, withHeadline = 0, withLink = 0, scoreSum = 0, last = "";
  for (;;) {
    const rows = await all(db,
      `SELECT user_id, name, photo_key, uni, course, company, role, headline, links, mode
         FROM profiles WHERE user_id > ? AND ${REAL_ID("user_id")} ORDER BY user_id LIMIT ${PAGE}`, last);
    for (const r of rows) {
      const s = profileScore(r);
      spread[Math.min(Math.max(s.score, 0), 6)] += 1;
      scoreSum += s.score;
      const ok = (k) => s.items.find((i) => i.key === k)?.ok;
      if (ok("photo")) withPhoto += 1;
      if (ok("headline")) withHeadline += 1;
      if (ok("links")) withLink += 1;
    }
    if (rows.length < PAGE) break;
    last = rows[rows.length - 1].user_id;
  }

  const users = u.total, claimed = u.claimed;
  const profiles = p.total;
  const m = {
    // Accounts and growth
    users_total: users, users_claimed: claimed, users_guest: u.guests, users_email_confirmed: u.confirmed,
    signups_1d: u.s1, signups_7d: u.s7, signups_30d: u.s30,
    mode_student: p.student, mode_career: p.career,
    // Profile completion
    profiles_total: profiles, profile_pct: pct(profiles, users),
    ...Object.fromEntries(spread.map((n, i) => [`profile_score_${i}`, n])),
    profile_score_avg: ratio(scoreSum, profiles),
    profile_complete_pct: pct(spread[6], users), profile_half_pct: pct(spread[3] + spread[4] + spread[5] + spread[6], users),
    with_photo_pct: pct(withPhoto, users), with_headline_pct: pct(withHeadline, users), with_link_pct: pct(withLink, users),
    with_card_pct: pct(cards.n, users), onboarding_done_pct: pct(p.done, p.started),
    // Active use
    active_1d: u.a1, active_7d: u.a7, active_30d: u.a30, stickiness_pct: pct(u.a1, u.a30),
    active_30d_of_claimed_pct: pct(u.a30c, claimed), returned_pct: pct(u.back, u.cohort),
    app_installed_pct: pct(u.installed, claimed), passkey_pct: pct(u.passkey, claimed),
    // Network
    connections_total: conn.total, connections_7d: conn.c7, connections_30d: conn.c30,
    connected_users_pct: pct(connected.n, users), connections_per_active: ratio(conn.c30, u.a30),
    // Events and hosts
    orgs_total: org.total, orgs_approved: org.approved, host_accounts: hostAcc.n,
    events_total: ev.total, events_30d: ev.e30, checkins_total: ci.total, checkins_30d: ci.c30,
    checkins_per_event_30d: ratio(ci.c30, ci.ev30), feedback_responses_30d: fb.n,
    // Revenue
    plus_active: u.plus, plus_pct: pct(u.plus, claimed), paid_orders_30d: orders.n, paid_pence_30d: orders.pence,
    event_credits_bought_30d: credits.n,
    // F74: profiles the admin made that nobody has claimed yet (they are in none of the counts above)
    premade_waiting: premade.n,
  };
  for (const k of Object.keys(m)) m[k] = num(m[k]);
  return m;
}

/**
 * Keep today's totals. The nightly job calls it with the default: one row a UTC day, the first run's (a second run
 * the same day changes nothing). The admin button passes { replace: true } to take it again.
 * Returns { day, written, takenAt }.
 */
export async function snapshotMetrics(env, ts = now(), { replace = false } = {}) {
  const db = env.DB;
  const day = dayOf(ts);
  if (!replace) {
    const have = await one(db, "SELECT taken_at FROM metrics_daily WHERE day = ?", day);
    if (have) return { day, written: false, takenAt: have.taken_at };
  }
  const data = JSON.stringify(await computeMetrics(db, ts));
  const res = await db.prepare(`INSERT OR ${replace ? "REPLACE" : "IGNORE"} INTO metrics_daily (day, taken_at, version, data) VALUES (?, ?, ?, ?)`)
    .bind(day, ts, METRICS_VERSION, data).run();
  return { day, written: Number(res.meta?.changes || 0) > 0, takenAt: ts };
}
