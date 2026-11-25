---
tags: [roadmap, feature, admin, analytics, privacy]
id: F70
priority: P1
phase: 12
size: M
status: In progress
needs: []
---
# F70 Platform metrics with daily snapshots and CSV export

**Priority:** P1 · **Phase:** 12 Owner requests (2026-11-25) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

> [!note] Owner decisions 2026-11-25: snapshots are taken **daily**; export is **CSV**. The owner's uncommitted rederive fixes to the Admin page were committed first (1e19eb8) so this builds on them.

## What the owner asked for (2026-11-25)
> "Add information on the admin panel to do more about analytics for the developers. So these are information such as the percentage of people that fill in their profile. Do they actively use their accounts? And every other statistic that you think would be helpful in this case, because later on when we have investors or any people that want to use our platform, or like, yeah, just investors in general, we need a metric that we can report. This should be archived now and then and could be exported so we can make a graph later on."

Answers to the questions asked the same day:
- How often to archive: **"Daily"** (one row per day, from the existing 03:17 nightly job).
- Export format: **"CSV"** (one row per snapshot, one column per metric).

## Current state
- `/admin` (`src/views/Admin.vue`, about 525 lines) loads its sections with the Bearer admin token through `call()`. It already shows two 30-day funnels: welcome steps (`GET /api/admin/onboarding`, `worker/onboarding.js` `funnel`) and tips (`GET /api/admin/stages`, `worker/stages.js` `stageFunnel`). Nothing shows platform-wide counts.
- `worker/admin.js` holds every admin route behind one middleware (token check, try limit `ADMIN_TRIES`, `admin_audit` log of every request).
- Activity: `users.last_seen_at` (migration 0014) is the only "last active" signal, one value per person. Daily or monthly active numbers for past days cannot be rebuilt from it, which is why the snapshot is needed.
- Accounts are erased after 24 months unused (`expireInactive`, `worker/purge.js`) and guests sooner, so counts from live tables fall over time. A snapshot keeps the number as it was.
- Profile completeness: `src/lib/profileScore.js` (`profileScore`, six points, no imports) is shared by Edit profile and `worker/profilenudge.js`. Use the same rule, so the admin numbers match what people see.
- Scheduled work: `worker/index.js` `scheduled` runs `purgeExpired` on `17 3 * * *` and the mail jobs hourly.
- Latest migration is `0044_host_branding.sql`. Latest decision note is D061.

## Plan
**Metrics** (one function, `worker/metrics.js` `computeMetrics(db, ts)`, returning a flat object of numbers; flat keys such as `users_total`, `profile_complete_pct`). Counts only, never ids, names, emails or anything about one person. Run the queries in one `db.batch` or a few, not one per person; profile scoring may read the six scored columns of every profile in pages of 500 and score them in the Worker with `profileScore`.

Accounts and growth
- `users_total`, `users_claimed` (is_guest = 0), `users_guest`, `users_email_confirmed`
- `signups_1d`, `signups_7d`, `signups_30d` (created_at)
- `mode_student`, `mode_career` (profiles.mode)

Profile completion (the owner's first example)
- `profiles_total`, `profile_pct` (people with a profile out of all accounts)
- `profile_score_0` to `profile_score_6` (how many profiles at each score), `profile_score_avg`
- `profile_complete_pct` (6 of 6), `profile_half_pct` (3 or more)
- `with_photo_pct`, `with_headline_pct`, `with_link_pct`, `with_card_pct`, `onboarding_done_pct` (if `onboarding_step` marks the end; check `worker/onboarding.js`)

Active use (the owner's second example)
- `active_1d`, `active_7d`, `active_30d` (last_seen_at within that time), `stickiness_pct` (active_1d / active_30d)
- `active_30d_of_claimed_pct`
- `returned_pct`: of accounts made 30 to 60 days ago, the share seen in the last 30 days. Name it plainly in the UI ("came back a month later") and say it is a rough measure built from one last-seen time.
- `app_installed_pct`, `passkey_pct`

Network
- `connections_total`, `connections_7d`, `connections_30d`, `connected_users_pct` (at least one connection), `connections_per_active` (connections_30d / active_30d)

Events and hosts
- `orgs_total`, `orgs_approved`, `host_accounts`, `events_total`, `events_30d` (started in the last 30 days), `checkins_total`, `checkins_30d`, `checkins_per_event_30d`, `feedback_responses_30d`

Revenue
- `plus_active` (plan = 'plus' and plan_until in the future, or the subscription rule the billing code uses; reuse it rather than writing a second one), `plus_pct` (of claimed accounts), `paid_orders_30d`, `paid_pence_30d` (billing_orders that were paid; check the status column), `event_credits_bought_30d`

Every percentage is 0 to 100 with one decimal, and 0 (not NaN or null) when the base is 0. If a table or column named here does not exist, leave that metric out and say so in the Log; do not invent a source.

**Archive.** Migration `0045_metrics_daily.sql`:
```
CREATE TABLE IF NOT EXISTS metrics_daily (
  day       TEXT PRIMARY KEY,     -- 'YYYY-MM-DD', UTC
  taken_at  INTEGER NOT NULL,     -- unix ms
  version   INTEGER NOT NULL,     -- METRICS_VERSION, bumped when a metric's meaning changes
  data      TEXT NOT NULL         -- JSON object of the flat metrics
);
```
- The 03:17 job calls `snapshotMetrics(env)` after `purgeExpired` (or alongside it with its own `catch`, so one failing never stops the other). It writes today's row with `INSERT OR IGNORE`, so a second run the same day changes nothing.
- An admin button "Take a snapshot now" (`POST /api/admin/metrics/snapshot`) replaces today's row (`INSERT OR REPLACE`), for the first day and for checking.
- Kept indefinitely: rows hold totals only and nothing about any one person. Not touched by `purgeExpired` or account erasure. Record this in [[Privacy and Data Retention]] and a decision note.
- JSON keeps the archive flexible: a metric added later simply appears from that day on; old rows lack it.

**Routes** (all behind the existing admin middleware, so logged and rate limited):
- `GET /api/admin/metrics` returns `{ now: <computeMetrics live>, snapshots: <count>, first: <day>, last: <day> }`.
- `GET /api/admin/metrics/export?from=YYYY-MM-DD&to=YYYY-MM-DD` returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="lanyard-metrics-<from>-to-<to>.csv"`. Header row `day,taken_at,version,` then every metric key seen in the range, sorted, so a metric missing on an older row is an empty cell. `taken_at` as ISO 8601 UTC. Dates validated (bad dates 400 with a plain message); no range means all rows. Values are numbers only, but still escape any cell that starts with `=`, `+`, `-` or `@` or holds a comma or quote (CSV injection), and test it.

**Admin page.** A "Platform metrics" section near the funnels, loaded only when "Show metrics" is pressed (like Abuse reports), so the page's first load does not add a slow query or another request against `ADMIN_TRIES`:
- grouped tiles: Accounts, Profiles, Active use, Network, Events, Revenue, each a label and a number, percentages with `%`, money as `£`. A one-line plain explanation under the group where the meaning is not obvious (active = opened the app; returned = rough).
- the profile score spread 0 to 6 as a simple bar row (CSS widths, no chart library).
- "Snapshots: N, from <first> to <last>", the "Take a snapshot now" button, two date inputs (from, to; the Design System's date picker if one is used elsewhere in Admin, else plain inputs) and "Download CSV". The download uses `fetch` with the token and a Blob link, since a plain link cannot send the Bearer header.
- Admin is not a public page, so the 50 KB budget does not apply, but keep the code in `Admin.vue` (or a component only Admin imports) and confirm the budget test still passes.

**Privacy and safety bar**
- No metric, snapshot or CSV contains a user id, name, email, card code or any free text. A test searches the snapshot row and the CSV for a seeded person's id, name and email and finds none.
- Every new route is refused without the admin token (401) and is written to `admin_audit`.
- The snapshot job is idempotent: two runs on one day leave one row with the first values.
- Account erasure (`eraseUser`) and `purgeExpired` leave `metrics_daily` untouched.

## Tasks
- [x] F70.1 Add `worker/metrics.js` (`computeMetrics`, `METRICS_VERSION`) and migration `0045_metrics_daily.sql`, with `snapshotMetrics` wired into the 03:17 job; tests for the numbers on a seeded set, zero bases, idempotence and erasure leaving rows alone. (`worker/metrics.js`, `migrations/0045_metrics_daily.sql`, `test/metrics.mjs`; the purge and the snapshot run as one 03:17 job, each with its own catch)
- [x] F70.2 Add `GET /api/admin/metrics`, `POST /api/admin/metrics/snapshot` and `GET /api/admin/metrics/export` with CSV escaping and date checks; tests for 401 without the token, the audit row, the CSV header, empty cells for missing metrics and no personal data. (`worker/metricsAdmin.js`, registered from `worker/admin.js` after the token check; `test/metrics.mjs`)
- [x] F70.3 Add the Platform metrics section to `/admin` (tiles, score spread, snapshot button, date range, Download CSV); browser check at 375 and 1280 px, light and dark. (`src/components/AdminMetrics.vue`, only Admin imports it; see the Log for what was and was not looked at)
- [ ] F70.4 (done except the four owner-modified notes: [[Data Model]], [[API Surface]], [[Privacy and Data Retention]], [[Decision Log]]; their exact lines are in the Log; D062, the Log and the Master To-Do claim are written) Vault: [[Data Model]] (metrics_daily), [[API Surface]] (three routes), [[Privacy and Data Retention]] (kept indefinitely, aggregates only), a decision note D062 and its [[Decision Log]] row, the Log here, the Master To-Do tick and Done log line.

## Acceptance checks
- [x] With 10 seeded accounts, 4 of them with a 6-of-6 profile and 2 with none, `/api/admin/metrics` reports `profiles_total` 8, `profile_complete_pct` 40.0 and `profile_score_6` 4.
- [x] An account last seen 2 days ago counts in `active_7d` and `active_30d` but not `active_1d`.
- [x] With no accounts at all, every percentage is 0 and nothing is NaN or null.
- [x] Running the 03:17 job twice on one day leaves one `metrics_daily` row whose `taken_at` is the first run's.
- [x] Pressing "Take a snapshot now" replaces today's row; the snapshot count stays the same.
- [x] `GET /api/admin/metrics/export?from=2026-11-01&to=2026-11-30` returns `text/csv`, a header starting `day,taken_at,version,`, one line per day in range, and an empty cell where an older row lacks a metric.
- [x] `from=2026-13-01` returns 400 with a plain message.
- [x] Each new route returns 401 without the token and writes an `admin_audit` row with it.
- [x] Neither the snapshot row nor the CSV contains a seeded person's id, name or email.
- [x] Erasing an account leaves every `metrics_daily` row as it was.
- [x] On `/admin`, "Show metrics" shows the grouped tiles and the 0 to 6 spread; "Download CSV" saves a file that opens in a spreadsheet with one column per metric (checked by reading the downloaded text in the browser pane).
- [x] The section reads well at 375 px and 1280 px, light and dark.
- [ ] Owner check (cannot be ticked by an agent): after deploy and `npm run db:remote`, the next morning `/admin` shows one snapshot dated that day.

## Log
- 2026-11-25 (owner decision): daily snapshots, CSV export; owner's Admin edits committed first as 1e19eb8.

- 2026-11-25 (Claude subagent): built F70.1 to F70.3; waiting only on the owner's next-morning check on production and on the four vault notes below. [[D062 Platform metrics are totals only, archived once a UTC day and exported as CSV]].
- What it is: `worker/metrics.js` (`computeMetrics`, `snapshotMetrics`, `METRICS_VERSION` 1), `worker/metricsAdmin.js` (three routes and the CSV), migration 0045 (`metrics_daily`), the 03:17 job (purge, then snapshot, one job, each with its own catch), `src/components/AdminMetrics.vue` (only Admin imports it), `test/metrics.mjs` (105 checks, wired before `test/rederive-fixes.mjs`).
- **The 53 metric keys** (none left out; every source table and column exists): users_total, users_claimed, users_guest, users_email_confirmed, signups_1d, signups_7d, signups_30d, mode_student, mode_career, profiles_total, profile_pct, profile_score_0 to profile_score_6, profile_score_avg, profile_complete_pct, profile_half_pct, with_photo_pct, with_headline_pct, with_link_pct, with_card_pct, onboarding_done_pct, active_1d, active_7d, active_30d, stickiness_pct, active_30d_of_claimed_pct, returned_pct, app_installed_pct, passkey_pct, connections_total, connections_7d, connections_30d, connected_users_pct, connections_per_active, orgs_total, orgs_approved, host_accounts, events_total, events_30d, checkins_total, checkins_30d, checkins_per_event_30d, feedback_responses_30d, plus_active, plus_pct, paid_orders_30d, paid_pence_30d, event_credits_bought_30d.
- Choices the plan left open (all in D062 and the file header): every profile percentage is out of all accounts (so 4 complete of 10 accounts is 40.0, as the acceptance check says; `profile_score_0` to `_6` count profiles, so they add up to `profiles_total`); `onboarding_done_pct` is those who finished the welcome steps (`onboarding_max` over 6) out of those who started (`onboarding_max` of 1 or more), because a NULL `onboarding_step` also means "made before F14"; `app_installed_pct` and `passkey_pct` are out of claimed accounts; `connected_users_pct` is out of all accounts; `checkins_per_event_30d` is check-ins in 30 days over the events that had one in those 30 days; `events_30d` uses `starts_at`, falling back to `created_at`; Plus uses the `planOf` rule (plan `plus`, and `plan_until` empty, 0 or in the future); `paid_orders_30d` and `paid_pence_30d` count `billing_orders` with status `paid` and `paid_at` in 30 days (a refunded or part-refunded order is out, GBP only for the pence); `event_credits_bought_30d` sums `events_granted` of `granted_by = 'polar'` credits made in 30 days (net of refunds, which set granted to used). `active_1d` reads a little low because `last_seen_at` is refreshed at most once a day (the page says so).
- How the bar is tested (`test/metrics.mjs`): only numbers (every value a finite non-negative number, plain key names; the snapshot row, the live answer and the CSV searched for seeded ids, names, emails, card codes, photo key, link and profile text: none); every route 401 without the token and with a wrong one, and one `admin_audit` row each with it; nightly idempotence through the real `scheduled` handler run twice (one row, first `taken_at` and numbers), the next day gets a row, replace keeps the count; `eraseUser`, an old account erased by `purgeExpired`, and `purgeExpired` five years on leave every row unchanged, and a source guard that the erasing code never names the table; CSV: header, sorted keys, ISO `taken_at`, inclusive range, empty cell for an older row, a crafted row with `=`, `+`, `-`, `@` keys and a text value (neutralised, quoted, not exported) and `csvCell` alone; bad dates (month 13, 30 February, words, short forms, from after to, a timestamp, an injection attempt) 400 with a plain message and the table intact; zero base: an empty database gives every value finite and every percentage 0; queries: a spy counts prepared statements (the same few for 5 people or 1040, plus one profile page per 500) and the numbers are right across pages. Metrics are asserted never negative, which is why the CSV can neutralise a leading `-` without altering any real value.
- Guards changed (a migration list each, nothing weakened): `test/people-search.mjs`, `test/card-colours.mjs`, `test/stages.mjs`, `test/event-themes.mjs`, `test/host-branding.mjs` now allow 0045 as the newest migration; `test/feedback-summary.mjs` keeps its check that the daily run is one job and only has a new name.
- Browser (local database with 74 accounts, servers on 8787 and 5173, throwaway admin token, no `.dev.vars`): signing in makes the usual 8 admin requests and none for metrics; Show metrics shows the six groups and the 0 to 6 bars; Take a snapshot now saved today's row ("Snapshots: 1, from 2026-11-25 to 2026-11-25"); Download CSV was read in the page (blob text: `lanyard-metrics-all.csv`, header `day,taken_at,version,active_1d,...`, a header and one line). Looked at 375 px (light, then dark) and 1280 px (dark, then light): no sideways scroll, tiles and bars read. Not checked: Midnight, a screen reader, a real file save in a browser (the page's own download link was clicked with the save skipped), the date pickers' calendar opening.
- Budget (B gzip, before to after; Admin is not a public page): Landing 44,327 to 44,342, PublicCard 47,676 to 47,699, Hosts 42,680 to 42,695, Privacy 50,295 to 50,313, Terms 46,890 to 46,907, Redeem 46,035 to 46,053, SignIn 47,145 to 47,164, PrivacyRequest 49,865 to 49,885 (limit 51,200). The 15 to 20 B rise on every page is the new Admin chunk's file name inside the router, not code a public page runs (they were identical after F70.1 and F70.2, which touched no front end). Admin chunk 15.50 kB gzip.
- Privacy Policy and Terms: no change made and the Terms version is not bumped. This is internal reporting of totals about the service; the owner may want one sentence in Privacy that anonymous usage totals are kept (see D062).
- Owner steps: `npm run db:remote` (0045, additive, safe before the deploy), then `npm run deploy`. The next morning open `/admin`, press Show metrics and check the archive says one snapshot dated that day, then press Download CSV and open it in a spreadsheet (the first night there is one line; graphs need a few days). Apply the vault lines below.

### Vault updates pending (owner-modified notes)
Applied by the orchestrator on 2026-11-25 to the working copies of all four notes, left uncommitted because those notes also hold the owner's own uncommitted edits; they go in with the owner's next vault commit. The lines added:

**[[Data Model]]** (a new bullet beside the other migration bullets, after the F66 one):
`- **Platform metrics archive (F70, migration 0045, [[D062 Platform metrics are totals only, archived once a UTC day and exported as CSV]]).** `metrics_daily` (`day` TEXT primary key, the UTC day it was taken; `taken_at` INTEGER ms; `version` INTEGER, `METRICS_VERSION`; `data` TEXT, a JSON object of flat numbers): totals about the service and nothing about one person (no id, name, email or text). No foreign key. Written by `snapshotMetrics` (the 03:17 job with `INSERT OR IGNORE`, so the first run of a day wins; the admin button with `INSERT OR REPLACE`). Never touched by `eraseUser`, `expireInactive` or `purgeExpired`; kept indefinitely.`

**[[API Surface]]** (after the "Admin reports and news" paragraph):
`**Admin metrics** (token, F70, 2026-11-25): `GET /admin/metrics` returns `{ now: { 53 flat numbers }, version, snapshots, first, last }` (a live read of every account as counts; the Admin page asks only when Show metrics is pressed); `POST /admin/metrics/snapshot` takes today's row again, replacing it, and returns `{ ok, day, takenAt, snapshots, first, last }`; `GET /admin/metrics/export?from=YYYY-MM-DD&to=YYYY-MM-DD` (both optional, inclusive) returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="lanyard-metrics-<from>-to-<to>.csv"` (`all` with no range), a header `day,taken_at,version,` and every metric key in the range sorted, one line a day, `taken_at` ISO 8601 UTC, an empty cell where an older row lacks a metric, a leading apostrophe on any cell starting `=`, `+`, `-` or `@`; a bad or reversed date is 400 `{ error }` in plain words. All three are refused without the token (401), count against `ADMIN_TRIES` and are written to `admin_audit`.`

**[[Privacy and Data Retention]]** (a new section after "Welcome steps (F14)"):
`## Platform metrics (F70)`
`- The admin page can count every account (accounts, profile completeness, last-seen windows, connections, events, plan and paid orders) and the 03:17 job keeps those totals once a UTC day in `metrics_daily` ([[D062 Platform metrics are totals only, archived once a UTC day and exported as CSV]]). Every figure is a number about the service: no user id, name, email, card code or text is read into it or kept, and a test searches the stored row and the CSV for a seeded person's details.`
`- **Kept indefinitely**, because no row can be traced to a person; it is not personal data. It has no foreign key and is not touched by account erasure, the 24-month inactive rule or the daily purge, so the history is the figures as they were on the day. Exported by an admin as a CSV for reporting (investors, graphs); every read, snapshot and export is in `admin_audit` (kept 12 months).`
`- Read as the admin's legitimate interest in running and reporting on the service; no Privacy Policy or Terms change was made. **Open for the owner:** one sentence in the Privacy Policy that anonymous usage totals are kept without a time limit.`

**[[Decision Log]]** (a new first row of the table):
`| [[D062 Platform metrics are totals only, archived once a UTC day and exported as CSV]] | Platform metrics (F70): `computeMetrics` returns only numbers (53 keys: accounts, profile completeness by the shared six-point score, active use from `last_seen_at`, network, events, revenue by the Plus rule and `paid` orders), read with one aggregate query per table and the profiles in pages of 500; the 03:17 job runs the purge then `snapshotMetrics` into `metrics_daily` (migration 0045, one row a UTC day, `INSERT OR IGNORE`, the admin button replaces today's); kept indefinitely and untouched by erasure and the purge; three token-guarded audited routes; CSV with neutralised formula cells and checked dates | Accepted |`

Related: [[D004 Aggregate-only host analytics]] · [[F49 Profile score and finish-your-profile emails]] · [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
