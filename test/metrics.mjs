// F70 (D062): platform metrics, the daily snapshot and the CSV export. The real Worker on in-memory SQLite.
// The bar: only totals leave the function (no id, name, email or card code in a number, a snapshot row or the CSV);
// every admin route needs the token and is audited; the nightly snapshot is idempotent; erasing accounts and the
// daily purge leave the archive alone; percentages are 0 (not NaN) on an empty base; reads are batched, not per person.
// Run: node test/metrics.mjs
import { readFileSync } from "node:fs";
import { makeEnv, makeDb, check, summary, migrationFiles, readMigration } from "./harness.mjs";
import { computeMetrics, snapshotMetrics, METRICS_VERSION, PAGE } from "../worker/metrics.js";
import { eraseUser, purgeExpired } from "../worker/purge.js";
import worker from "../worker/index.js";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const DAY = 86400e3;
const T = Date.UTC(2026, 10, 25, 3, 17); // the moment the numbers are worked out for

const hex = (n) => (0x2000000000 + n).toString(16).slice(-10);
let seq = 0;
const newId = () => hex(++seq);

// A throwaway Worker environment with a seeding helper that writes straight to the database.
async function world() {
  const W = await makeEnv({ ADMIN_TOKEN: "test-admin-token-f70" });
  const sql = (s, ...p) => W.env.DB.raw.prepare(s).run(...p);
  const user = ({ guest = 0, created = T - 100 * DAY, seen = null, email = null, verified = 0, passkey = 0, installed = null, plan = "free", until = null } = {}) => {
    const id = newId();
    sql("INSERT INTO users (id, created_at, is_guest, recovery_email, email_verified, has_passkey, app_installed_at, last_seen_at, plan, plan_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, created, guest, email, verified, passkey, installed, seen, plan, until);
    return id;
  };
  const FULL = { photo_key: "p/x.jpg", uni: "Test University", course: "Maths", headline: "Builds things", links: JSON.stringify({ site: "https://example.com" }) };
  const profile = (id, name, o = {}) => {
    const f = { name, photo_key: null, uni: null, course: null, headline: null, links: "{}", mode: "student", company: "", role: "", onboarding_step: null, onboarding_max: 0, ...o };
    sql("INSERT INTO profiles (user_id, name, photo_key, uni, course, headline, links, mode, company, role, onboarding_step, onboarding_max, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, f.name, f.photo_key, f.uni, f.course, f.headline, f.links, f.mode, f.company, f.role, f.onboarding_step, f.onboarding_max, T);
  };
  let cardN = 0;
  const card = (uid) => sql("INSERT INTO cards (id, user_id, code, name, created_at) VALUES (?, ?, ?, 'Card', ?)", newId(), uid, "C" + (++cardN), T);
  const connect = (a, b, at = T - DAY) => sql("INSERT INTO connections (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)", newId(), a, b, at);
  return { ...W, sql, user, profile, card, connect, FULL };
}

/* ------------------- the numbers on a seeded set (acceptance) ------------------- */
console.log("\n# Ten accounts: four complete profiles, two without a profile");
const SEEDED = { names: ["Zara Whitlock", "Quentin Aldous", "Mabel Orrery"], emails: ["zara.whitlock@example.com", "quentin.aldous@example.org"] };
let W = await world();
const ids = [];
for (let i = 0; i < 4; i++) { // complete: 6 of 6
  const id = W.user({ created: T - 40 * DAY, seen: T - 2 * DAY, email: i === 0 ? SEEDED.emails[0] : null, verified: i === 0 ? 1 : 0, passkey: i < 2 ? 1 : 0, installed: i === 0 ? T - DAY : null });
  W.profile(id, i === 0 ? SEEDED.names[0] : `Complete ${i}`, { ...W.FULL, onboarding_max: 7 });
  W.card(id); ids.push(id);
}
for (let i = 0; i < 4; i++) { // partial: scores 1, 2, 3 and 5
  const id = W.user({ created: T - 5 * DAY, seen: i === 0 ? T - 3600e3 : null, email: i === 1 ? SEEDED.emails[1] : null });
  const fields = [{}, { photo_key: "p/y.jpg" }, { photo_key: "p/y.jpg", uni: "Test University" }, { photo_key: "p/y.jpg", uni: "Test University", course: "Law", headline: "Hi" }][i];
  W.profile(id, i === 1 ? SEEDED.names[1] : `Partial ${i}`, { ...fields, onboarding_max: i === 0 ? 3 : 0 });
  ids.push(id);
}
const bare = [W.user({ guest: 1, created: T - 2 * DAY }), W.user({ guest: 1, created: T - 3 * 3600e3 })]; // no profile at all
let M = await computeMetrics(W.env.DB, T);
check("10 accounts, 8 with a profile", M.users_total === 10 && M.profiles_total === 8 && M.profile_pct === 80, [M.users_total, M.profiles_total]);
check("profile_score_6 is 4 and profile_complete_pct is 40.0", M.profile_score_6 === 4 && M.profile_complete_pct === 40, [M.profile_score_6, M.profile_complete_pct]);
check("the spread adds up to the profiles", [0, 1, 2, 3, 4, 5, 6].reduce((n, i) => n + M[`profile_score_${i}`], 0) === M.profiles_total && M.profile_score_1 === 1 && M.profile_score_2 === 1 && M.profile_score_3 === 1 && M.profile_score_5 === 1, M);
check("profile_half_pct is 3 or more of 6 out of all accounts (four complete, one at 3, one at 5)", M.profile_half_pct === 60, M.profile_half_pct);
check("profile_score_avg is the mean over profiles (4x6 + 1 + 2 + 3 + 5 over 8)", M.profile_score_avg === 4.37 || M.profile_score_avg === 4.38, M.profile_score_avg);
check("photo, headline, link and card shares are out of all accounts", M.with_photo_pct === 70 && M.with_headline_pct === 50 && M.with_link_pct === 40 && M.with_card_pct === 40, [M.with_photo_pct, M.with_headline_pct, M.with_link_pct, M.with_card_pct]);
check("accounts: 8 claimed, 2 guests, one confirmed email", M.users_claimed === 8 && M.users_guest === 2 && M.users_email_confirmed === 1, M);
check("signups: 1 in the last day, 6 in 7 days and 6 in 30 days (the four complete ones were made 40 days ago)", M.signups_1d === 1 && M.signups_7d === 6 && M.signups_30d === 6, [M.signups_1d, M.signups_7d, M.signups_30d]);
check("modes: every profile is student", M.mode_student === 8 && M.mode_career === 0);
check("onboarding_done_pct is those who finished out of those who started (4 finished, 1 at step 3)", M.onboarding_done_pct === 80, M.onboarding_done_pct);
check("app installed and passkey are out of claimed accounts", M.app_installed_pct === 12.5 && M.passkey_pct === 25, [M.app_installed_pct, M.passkey_pct]);

console.log("\n# Active use: last seen 2 days ago counts in 7 and 30 days, not in 1 day");
check("four seen 2 days ago and one seen an hour ago", M.active_1d === 1 && M.active_7d === 5 && M.active_30d === 5, [M.active_1d, M.active_7d, M.active_30d]);
check("stickiness is active_1d / active_30d", M.stickiness_pct === 20, M.stickiness_pct);
check("30-day activity of claimed accounts is out of the claimed ones", M.active_30d_of_claimed_pct === 62.5, M.active_30d_of_claimed_pct);
check("an account never seen is in no window", (await computeMetrics(W.env.DB, T)).active_30d === 5 && M.active_30d < M.users_total);
// returned: accounts made 30 to 60 days ago, seen in the last 30 days
{
  const w = await world();
  for (let i = 0; i < 4; i++) w.user({ created: T - 45 * DAY, seen: i < 3 ? T - 10 * DAY : T - 40 * DAY }); // 3 of 4 came back
  w.user({ created: T - 20 * DAY, seen: T - DAY }); w.user({ created: T - 90 * DAY, seen: T - DAY }); // outside the cohort
  const m = await computeMetrics(w.env.DB, T);
  check("returned_pct: of accounts made 30 to 60 days ago, the share seen in the last 30 days", m.returned_pct === 75, m.returned_pct);
}

console.log("\n# Network, events and hosts");
{
  const w = await world();
  const [a, b, c, d] = [w.user({ seen: T - DAY }), w.user({ seen: T - DAY }), w.user({ seen: T - 20 * DAY }), w.user()];
  w.connect(a, b, T - 2 * DAY); w.connect(a, c, T - 10 * DAY); w.connect(b, c, T - 100 * DAY);
  const org = newId();
  w.sql("INSERT INTO orgs (id, name, verification_status, created_at) VALUES (?, 'Org One', 'approved', ?)", org, T);
  w.sql("INSERT INTO orgs (id, name, verification_status, created_at) VALUES (?, 'Org Two', 'pending', ?)", newId(), T);
  w.sql("INSERT INTO host_accounts (id, email, created_at) VALUES (?, 'h1@example.com', ?)", newId(), T);
  w.sql("INSERT INTO host_accounts (id, email, created_at, deleted_at) VALUES (?, 'h2@example.com', ?, ?)", newId(), T, T);
  const ev = (n, startsAt) => { const id = newId(); w.sql("INSERT INTO events (id, org_id, code, name, starts_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, org, "E" + n + "AB", "Event " + n, startsAt, T - 200 * DAY); return id; };
  const e1 = ev(1, T - 5 * DAY), e2 = ev(2, T - 400 * DAY), e3 = ev(3, null);
  w.sql("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)", e1, a, T - 5 * DAY);
  w.sql("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)", e1, b, T - 5 * DAY);
  w.sql("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)", e1, c, T - 4 * DAY);
  w.sql("INSERT INTO checkins (event_id, user_id, created_at) VALUES (?, ?, ?)", e2, a, T - 300 * DAY);
  w.sql("INSERT INTO feedback_responses (id, event_id, answers, day) VALUES (?, ?, '{}', ?)", newId(), e1, Math.floor((T - 3 * DAY) / DAY) * DAY);
  w.sql("INSERT INTO feedback_responses (id, event_id, answers, day) VALUES (?, ?, '{}', ?)", newId(), e1, Math.floor((T - 90 * DAY) / DAY) * DAY);
  const m = await computeMetrics(w.env.DB, T);
  check("connections: 3 in all, 1 in 7 days, 2 in 30 days", m.connections_total === 3 && m.connections_7d === 1 && m.connections_30d === 2, m);
  check("three of four accounts are connected", m.connected_users_pct === 75, m.connected_users_pct);
  check("connections per active is connections_30d / active_30d (2 / 3)", m.active_30d === 3 && m.connections_per_active === 0.67, [m.active_30d, m.connections_per_active]);
  check("organisations and host accounts (a deleted host account is not counted)", m.orgs_total === 2 && m.orgs_approved === 1 && m.host_accounts === 1, m);
  check("events: 3 in all, 1 in the last 30 days (a missing start falls back to when it was made, which was long ago)", m.events_total === 3 && m.events_30d === 1, [m.events_total, m.events_30d]);
  check("check-ins: 4 in all, 3 in 30 days, over the 1 event that had any", m.checkins_total === 4 && m.checkins_30d === 3 && m.checkins_per_event_30d === 3, m);
  check("feedback responses in the last 30 days", m.feedback_responses_30d === 1, m.feedback_responses_30d);
}

console.log("\n# Revenue: the same Plus rule as the app, paid orders only, bought credits only");
{
  const w = await world();
  w.user({ plan: "plus", until: null }); w.user({ plan: "plus", until: T + DAY }); w.user({ plan: "plus", until: T - DAY }); w.user({ plan: "plus", until: 0 });
  w.user({ plan: "free", until: T + DAY }); w.user({ guest: 1, plan: "free" });
  const org = newId();
  w.sql("INSERT INTO orgs (id, name, created_at) VALUES (?, 'Pay Org', ?)", org, T);
  const order = (status, pence, paidAt, cur = "gbp") => w.sql(
    "INSERT INTO billing_orders (id, provider, product, kind, amount_pence, currency, org_id, status, paid_at, created_at) VALUES (?, 'polar', 'p', 'credits', ?, ?, ?, ?, ?, ?)",
    newId(), pence, cur, org, status, paidAt, T - 40 * DAY);
  order("paid", 1500, T - 2 * DAY); order("paid", 2500, T - 10 * DAY); order("paid", 9900, T - 60 * DAY); // the last is outside 30 days
  order("refunded", 7000, T - 3 * DAY); order("open", 4000, null); order("failed", 4000, null); order("part_refunded", 3000, T - 3 * DAY);
  const credit = (by, n, at) => w.sql("INSERT INTO credits (id, org_id, events_granted, events_used, reason, granted_by, created_at) VALUES (?, ?, ?, 0, 'r', ?, ?)", newId(), org, n, by, at);
  credit("polar", 5, T - DAY); credit("polar", 3, T - 90 * DAY); credit("promo", 10, T - DAY); credit(null, 1, T - DAY);
  const m = await computeMetrics(w.env.DB, T);
  check("Plus is plan 'plus' with no end, an end in the future or 0 (three of the four), and not one that ended", m.plus_active === 3, m.plus_active);
  check("plus_pct is out of claimed accounts (3 of 5)", m.plus_pct === 60, m.plus_pct);
  check("paid orders are status 'paid' inside 30 days (refunded, open, failed and old ones are out)", m.paid_orders_30d === 2 && m.paid_pence_30d === 4000, [m.paid_orders_30d, m.paid_pence_30d]);
  check("event credits bought are 'polar' credits made in 30 days (not promo, not starter, not old)", m.event_credits_bought_30d === 5, m.event_credits_bought_30d);
  const src = read("worker/metrics.js");
  check("the Plus rule in the query matches planOf in worker/plans.js", /plan_until IS NULL OR plan_until = 0 OR plan_until > /.test(src) && /!userRow\.plan_until \|\| userRow\.plan_until > now\(\)/.test(read("worker/plans.js")));
}

/* ------------------- zero bases ------------------- */
console.log("\n# No accounts at all: every percentage is 0, nothing is NaN or null");
{
  const w = await world();
  const m = await computeMetrics(w.env.DB, T);
  const vals = Object.values(m);
  check("every value is a finite number", vals.every((v) => typeof v === "number" && Number.isFinite(v)), vals.filter((v) => !Number.isFinite(v)));
  check("every percentage is 0", Object.entries(m).filter(([k]) => k.endsWith("_pct")).every(([, v]) => v === 0) && Object.keys(m).filter((k) => k.endsWith("_pct")).length >= 14);
  check("every ratio is 0", m.connections_per_active === 0 && m.checkins_per_event_30d === 0 && m.profile_score_avg === 0);
  check("an empty database has the same metrics as a full one (same keys)", Object.keys(m).join() === Object.keys(M).join());
  check("a test with only guests and no profile does not divide by zero either", await (async () => { const g = await world(); g.user({ guest: 1 }); const x = await computeMetrics(g.env.DB, T); return x.users_claimed === 0 && x.plus_pct === 0 && x.passkey_pct === 0 && x.profile_complete_pct === 0 && x.onboarding_done_pct === 0; })());
}

/* ------------------- only totals ------------------- */
console.log("\n# Only numbers leave: no id, name, email or code in the metrics, the row or any text");
{
  const m = await computeMetrics(W.env.DB, T);
  check("every value is a number and none is negative (the CSV relies on this)", Object.values(m).every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0));
  check("every key is a plain metric name", Object.keys(m).every((k) => /^[a-z0-9_]+$/.test(k)));
  const snap = await snapshotMetrics(W.env, T);
  const row = W.q1("SELECT * FROM metrics_daily WHERE day = ?", snap.day);
  const text = JSON.stringify(row) + row.data;
  const seeded = [...SEEDED.names, ...SEEDED.emails, ...ids, ...bare, "p/x.jpg", "https://example.com", ...W.q("SELECT code FROM cards").map((c) => c.code)];
  check("the snapshot row has none of the seeded ids, names, emails, photo keys, links or card codes", seeded.length > 15 && seeded.every((s) => !text.includes(s)), seeded.filter((s) => text.includes(s)));
  check("the row is day, taken_at, version and a JSON object of numbers", row.day === "2026-11-25" && row.taken_at === T && row.version === METRICS_VERSION && Object.values(JSON.parse(row.data)).every((v) => typeof v === "number"));
}

/* ------------------- batched reads ------------------- */
console.log("\n# Queries are batched, and profiles are read in pages, not one per person");
{
  async function countQueries(n) {
    const w = await world();
    for (let i = 0; i < n; i++) { const id = w.user({ seen: T - DAY }); w.profile(id, "P" + i, i % 2 ? w.FULL : {}); }
    const real = w.env.DB.prepare;
    const seen = [];
    w.env.DB.prepare = (s) => { seen.push(s); return real(s); };
    const m = await computeMetrics(w.env.DB, T);
    w.env.DB.prepare = real;
    return { m, seen };
  }
  const small = await countQueries(5), big = await countQueries(PAGE * 2 + 40);
  const pages = (r) => r.seen.filter((s) => /FROM profiles WHERE user_id >/.test(s)).length;
  check("5 people take 1 page, 1040 take 3", pages(small) === 1 && pages(big) === 3, [pages(small), pages(big)]);
  check("the other queries are the same few however many people there are", small.seen.length - pages(small) === big.seen.length - pages(big) && small.seen.length - pages(small) <= 14, [small.seen.length, big.seen.length]);
  check("the numbers are right across pages (half of 1040 have a complete profile)", big.m.profile_score_6 === (PAGE * 2 + 40) / 2 && big.m.profiles_total === PAGE * 2 + 40, [big.m.profile_score_6, big.m.profiles_total]);
  check("a page holds at most 500 profiles", PAGE === 500 && /LIMIT \$\{PAGE\}/.test(read("worker/metrics.js")));
}

/* ------------------- the snapshot ------------------- */
console.log("\n# The nightly snapshot: one row a day, the first run's, and not touched by the purge or by erasing accounts");
{
  const w = await world();
  const a = w.user({ seen: T - DAY }); w.profile(a, "Keep Me", w.FULL);
  const run = async () => { const waits = []; await worker.scheduled({ cron: "17 3 * * *" }, w.env, { waitUntil: (p) => waits.push(p) }); await Promise.all(waits); return waits.length; };
  const jobs = await run();
  const first = w.q("SELECT * FROM metrics_daily");
  await new Promise((r) => setTimeout(r, 15));
  const b = w.user({ seen: Date.now() }); w.profile(b, "Joined Later", w.FULL); // the numbers have moved on since the first run
  await run();
  const second = w.q("SELECT * FROM metrics_daily");
  check("the 03:17 job still runs as one job", jobs === 1, jobs);
  check("one run writes one row for today (UTC)", first.length === 1 && first[0].day === new Date().toISOString().slice(0, 10) && first[0].version === METRICS_VERSION, first);
  check("a second run the same day leaves one row, with the first run's taken_at and numbers", second.length === 1 && second[0].taken_at === first[0].taken_at && second[0].data === first[0].data, second);
  check("snapshotMetrics says the second was not written", (await snapshotMetrics(w.env)).written === false);
  const noon = Date.parse(first[0].day + "T12:00:00Z");
  const nextDay = await snapshotMetrics(w.env, noon + DAY);
  check("the next day gets its own row", nextDay.written === true && w.q("SELECT COUNT(*) n FROM metrics_daily")[0].n === 2);
  const replaced = await snapshotMetrics(w.env, noon, { replace: true });
  check("replace takes today's row again with new numbers and the same count of rows", replaced.written === true && w.q("SELECT COUNT(*) n FROM metrics_daily")[0].n === 2 && JSON.parse(w.q1("SELECT data FROM metrics_daily WHERE day = ?", first[0].day).data).users_total === 2);

  console.log("\n# Erasing an account and the daily purge leave metrics_daily as it was");
  const before = JSON.stringify(w.q("SELECT * FROM metrics_daily ORDER BY day"));
  await eraseUser(w.env, a);
  check("the account is gone", w.q("SELECT 1 FROM users WHERE id = ?", a).length === 0);
  check("eraseUser leaves every metrics_daily row as it was", JSON.stringify(w.q("SELECT * FROM metrics_daily ORDER BY day")) === before);
  // An old, never-seen account is erased by the purge as well.
  const old = w.user({ seen: T - 800 * DAY, verified: 0 }); w.profile(old, "Long Gone", w.FULL);
  await purgeExpired(w.env, Date.now());
  check("the purge erased that old account", w.q("SELECT 1 FROM users WHERE id = ?", old).length === 0);
  check("purgeExpired leaves every metrics_daily row as it was, even far in the future", JSON.stringify(w.q("SELECT * FROM metrics_daily ORDER BY day")) === before
    && (await purgeExpired(w.env, Date.now() + 5 * 365 * DAY), JSON.stringify(w.q("SELECT * FROM metrics_daily ORDER BY day")) === before));
  const purgeSrc = read("worker/purge.js") + read("worker/hosts.js");
  check("nothing in the erasing or purging code names the archive", !/metrics_daily/.test(purgeSrc));
  check("the archive has no foreign key to any account", !/REFERENCES/i.test(read("migrations/0045_metrics_daily.sql")));
}

/* ------------------- the admin routes and the CSV ------------------- */
console.log("\n# Every new route is refused without the token and audited with it");
{
  const w = await world();
  const people = [];
  for (let i = 0; i < 3; i++) { const id = w.user({ seen: Date.now() - DAY, email: `person${i}@example.org` }); w.profile(id, ["Ada Lovelace", "Grace Hopper", "Alan Turing"][i], w.FULL); w.card(id); people.push(id); }
  const admin = w.client({ ip: "198.51.100.70" });
  const AUTH = { authorization: "Bearer test-admin-token-f70" };
  const routes = [["GET", "/api/admin/metrics"], ["POST", "/api/admin/metrics/snapshot"], ["GET", "/api/admin/metrics/export"], ["GET", "/api/admin/metrics/export?from=2026-11-01&to=2026-11-30"]];
  for (const [method, path] of routes) {
    const anon = await admin.req(method, path, method === "POST" ? {} : undefined);
    const wrong = await admin.req(method, path, method === "POST" ? {} : undefined, { authorization: "Bearer nope" });
    check(`${method} ${path.split("?")[0]} without the token is 401, and with a wrong one`, anon.status === 401 && wrong.status === 401 && !/users_total/.test(anon.text + wrong.text), [anon.status, wrong.status]);
  }
  check("a refused call writes no snapshot", w.q("SELECT COUNT(*) n FROM metrics_daily")[0].n === 0);
  const audit = () => w.q("SELECT action FROM admin_audit").map((r) => r.action);
  const before = audit().length;
  const live = await admin.get("/api/admin/metrics", AUTH);
  const snap = await admin.post("/api/admin/metrics/snapshot", {}, AUTH);
  const exp = await admin.get("/api/admin/metrics/export?from=2020-01-01&to=2030-01-01", AUTH);
  check("with the token all three answer 200", live.status === 200 && snap.status === 200 && exp.status === 200, [live.status, snap.status, exp.status]);
  const rows = audit().slice(before);
  check("each of the three wrote an admin_audit row", rows.includes("GET /api/admin/metrics") && rows.includes("POST /api/admin/metrics/snapshot") && rows.includes("GET /api/admin/metrics/export") && rows.length === 3, rows);
  check("the live answer is the numbers, the version and the archive size", live.json.now.users_total === 3 && live.json.version === METRICS_VERSION && live.json.snapshots === 0 && live.json.first === null && live.json.last === null, live.json);

  console.log("\n# The button replaces today's row; the count stays");
  const day = new Date().toISOString().slice(0, 10);
  check("the first press writes today's row", snap.json.ok && snap.json.day === day && snap.json.snapshots === 1 && snap.json.first === day && snap.json.last === day, snap.json);
  const taken1 = w.q1("SELECT taken_at FROM metrics_daily").taken_at;
  w.user({ seen: Date.now() });
  await new Promise((r) => setTimeout(r, 10));
  const again = await admin.post("/api/admin/metrics/snapshot", {}, AUTH);
  const row = w.q1("SELECT * FROM metrics_daily");
  check("a second press replaces it: still one row, later taken_at, new numbers", again.json.snapshots === 1 && row.taken_at > taken1 && JSON.parse(row.data).users_total === 4, [again.json, row.taken_at, taken1]);

  console.log("\n# The CSV");
  const ex2 = (await admin.get("/api/admin/metrics/export?from=2020-01-01&to=2030-01-01", AUTH)).text.trim().split("\r\n");
  check("it is text/csv with a download name from the range, nosniff", exp.headers.get("content-type") === "text/csv; charset=utf-8" && exp.headers.get("content-disposition") === 'attachment; filename="lanyard-metrics-2020-01-01-to-2030-01-01.csv"' && exp.headers.get("x-content-type-options") === "nosniff", [exp.headers.get("content-type"), exp.headers.get("content-disposition")]);
  check("the header starts day,taken_at,version, then every metric sorted", ex2[0].startsWith("day,taken_at,version,") && (() => { const k = ex2[0].split(",").slice(3); return k.length === Object.keys(live.json.now).length && k.join() === [...k].sort().join(); })(), ex2[0].slice(0, 80));
  check("one row, so a header and one line", ex2.length === 2 && ex2[1].startsWith(day + ","), ex2.length);
  check("taken_at is ISO 8601 UTC", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(ex2[1].split(",")[1]));
  check("no range means all rows, named all", (await admin.get("/api/admin/metrics/export", AUTH)).headers.get("content-disposition").includes("lanyard-metrics-all.csv"));

  // Rows over several days; an older row lacks a metric a newer one has.
  w.sql("DELETE FROM metrics_daily");
  const put = (d, data, version = 1) => w.sql("INSERT INTO metrics_daily (day, taken_at, version, data) VALUES (?, ?, ?, ?)", d, Date.parse(d + "T03:17:00Z"), version, JSON.stringify(data));
  put("2026-10-31", { users_total: 5 }); put("2026-11-01", { users_total: 6, active_7d: 3 }); put("2026-11-15", { users_total: 8, active_7d: 4, plus_pct: 12.5 }); put("2026-11-30", { users_total: 9, active_7d: 5, plus_pct: 11.1 }); put("2026-12-01", { users_total: 10 });
  const nl = (await admin.get("/api/admin/metrics/export?from=2026-11-01&to=2026-11-30", AUTH)).text.trim().split("\r\n");
  check("from and to are inclusive: a line for each of the three days in range", nl.length === 4 && nl[1].startsWith("2026-11-01,") && nl[3].startsWith("2026-11-30,"), nl);
  check("the header is day,taken_at,version,active_7d,plus_pct,users_total", nl[0] === "day,taken_at,version,active_7d,plus_pct,users_total", nl[0]);
  check("a row from before a metric existed has an empty cell for it", nl[1] === "2026-11-01,2026-11-01T03:17:00.000Z,1,3,,6" && nl[2] === "2026-11-15,2026-11-15T03:17:00.000Z,1,4,12.5,8", nl.slice(1, 3));
  const only = (await admin.get("/api/admin/metrics/export?from=2026-11-15", AUTH)).text.trim().split("\r\n");
  const upto = (await admin.get("/api/admin/metrics/export?to=2026-10-31", AUTH)).text.trim().split("\r\n");
  check("a start alone and an end alone work", only.length === 4 && upto.length === 2 && upto[1].startsWith("2026-10-31,"), [only.length, upto.length]);
  check("an empty range is just the header", (await admin.get("/api/admin/metrics/export?from=2027-01-01&to=2027-01-02", AUTH)).text === "day,taken_at,version\r\n");

  console.log("\n# Bad dates are a 400 with a plain message");
  for (const q of ["from=2026-13-01", "to=2026-02-30", "from=yesterday", "from=2026-1-1", "from=2026-11-30&to=2026-11-01", "from=2026-11-01T00:00:00Z", "to=%27%3B%20DROP%20TABLE%20metrics_daily"]) {
    const r = await admin.get("/api/admin/metrics/export?" + q, AUTH);
    check(`?${q} is 400 and says why in plain words`, r.status === 400 && typeof r.json?.error === "string" && /day|date/i.test(r.json.error) && !/Error:|SQL/.test(r.json.error), [r.status, r.text.slice(0, 80)]);
  }
  check("the table is intact after those", w.q("SELECT COUNT(*) n FROM metrics_daily")[0].n === 5);

  console.log("\n# CSV injection: a cell that starts a formula is neutralised, commas and quotes are quoted");
  w.sql("DELETE FROM metrics_daily");
  w.sql("INSERT INTO metrics_daily (day, taken_at, version, data) VALUES ('2026-11-02', ?, 1, ?)", T,
    JSON.stringify({ "=1+1": 1, "+cmd": 2, "-2+3": 3, "@SUM(A1)": 4, "a,b": 5, 'say "hi"': 6, ok: 7, text_value: '=HYPERLINK("http://evil")', line: "a\nb" }));
  const bad = (await admin.get("/api/admin/metrics/export", AUTH)).text;
  const [h, v] = bad.trim().split("\r\n");
  check("header cells starting = + - @ get a leading apostrophe", ["'=1+1", "'+cmd", "'-2+3", "'@SUM(A1)"].every((c) => h.split(",").includes(c)), h);
  check("a comma or a quote makes a quoted cell, quotes doubled", h.includes('"a,b"') && h.includes('"say ""hi"""'), h);
  check("a text value (only a crafted row has one) is not exported: an empty cell, so it cannot start a formula", !bad.includes("HYPERLINK") && !bad.includes("evil"), v);
  check("no cell in the file starts with = + - or @", !bad.split("\r\n").some((l) => l.split(",").some((c) => /^[=+\-@]/.test(c))), bad);
  check("the export never changes a stored value", JSON.parse(w.q1("SELECT data FROM metrics_daily").data)["=1+1"] === 1);
  const { csvCell } = await import("../worker/metricsAdmin.js");
  check("csvCell alone: formulas, tab, quotes, line breaks, numbers, empty", csvCell("=a") === "'=a" && csvCell("+a") === "'+a" && csvCell("-a") === "'-a" && csvCell("@a") === "'@a" && csvCell("\t1") === "'\t1" && csvCell('x"y') === '"x""y"' && csvCell("a\nb") === '"a\nb"' && csvCell(12.5) === "12.5" && csvCell(0) === "0" && csvCell(null) === "" && csvCell("") === "");
  check("a plain number is never altered because metrics are never negative (asserted above on a full set of metrics)", csvCell(40) === "40" && csvCell(0.5) === "0.5");

  console.log("\n# No person in the live answer, the snapshot row or the CSV");
  w.sql("DELETE FROM metrics_daily");
  const s2 = await admin.post("/api/admin/metrics/snapshot", {}, AUTH);
  const l2 = await admin.get("/api/admin/metrics", AUTH);
  const c2 = await admin.get("/api/admin/metrics/export", AUTH);
  const everything = JSON.stringify(s2.json) + l2.text + c2.text + JSON.stringify(w.q("SELECT * FROM metrics_daily"));
  const who = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Lovelace", "Hopper", "Turing", "person0@example.org", "person1@example.org", "person2@example.org", "example.org", ...people, ...w.q("SELECT code FROM cards").map((c) => c.code), "p/x.jpg", "Test University", "Builds things", "https://example.com"];
  check("none of the seeded ids, names, emails, card codes or text is in any of them", who.length > 12 && who.every((x) => !everything.includes(x)), who.filter((x) => everything.includes(x)));
  check("every value in the live answer and every CSV data cell is a plain non-negative number", Object.values(l2.json.now).every((n) => typeof n === "number" && n >= 0) && c2.text.trim().split("\r\n")[1].split(",").slice(3).every((c) => c === "" || /^\d+(\.\d+)?$/.test(c)));
  const src = read("worker/metricsAdmin.js").replace(/\/\/.*$/gm, "");
  check("the routes file never selects a person column (source guard)", !/recovery_email|pending_email|photo_key|user_id|FROM users|FROM profiles|FROM cards/i.test(src));
}

console.log("\n# The migration is additive and safe to run before the new code");
{
  const sql = read("migrations/0045_metrics_daily.sql");
  const code = sql.replace(/--.*$/gm, "");
  check("it is the next number and only creates one table with IF NOT EXISTS", migrationFiles().at(-1) === "0045_metrics_daily.sql" && /CREATE TABLE IF NOT EXISTS metrics_daily/.test(code) && !/\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i.test(code));
  const db = makeDb({ before: "0045" });
  db.exec(readMigration("0045_metrics_daily.sql")); db.exec(readMigration("0045_metrics_daily.sql"));
  check("it applies twice without error on a database made by 0001 to 0044", db.raw.prepare("SELECT COUNT(*) n FROM metrics_daily").get().n === 0);
}

summary();
