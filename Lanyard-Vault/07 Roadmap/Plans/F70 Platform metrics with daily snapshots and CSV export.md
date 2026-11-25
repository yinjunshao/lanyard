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
- [ ] F70.3 Add the Platform metrics section to `/admin` (tiles, score spread, snapshot button, date range, Download CSV); browser check at 375 and 1280 px, light and dark.
- [ ] F70.4 Vault: [[Data Model]] (metrics_daily), [[API Surface]] (three routes), [[Privacy and Data Retention]] (kept indefinitely, aggregates only), a decision note D062 and its [[Decision Log]] row, the Log here, the Master To-Do tick and Done log line.

## Acceptance checks
- [ ] With 10 seeded accounts, 4 of them with a 6-of-6 profile and 2 with none, `/api/admin/metrics` reports `profiles_total` 8, `profile_complete_pct` 40.0 and `profile_score_6` 4.
- [ ] An account last seen 2 days ago counts in `active_7d` and `active_30d` but not `active_1d`.
- [ ] With no accounts at all, every percentage is 0 and nothing is NaN or null.
- [ ] Running the 03:17 job twice on one day leaves one `metrics_daily` row whose `taken_at` is the first run's.
- [ ] Pressing "Take a snapshot now" replaces today's row; the snapshot count stays the same.
- [ ] `GET /api/admin/metrics/export?from=2026-11-01&to=2026-11-30` returns `text/csv`, a header starting `day,taken_at,version,`, one line per day in range, and an empty cell where an older row lacks a metric.
- [ ] `from=2026-13-01` returns 400 with a plain message.
- [ ] Each new route returns 401 without the token and writes an `admin_audit` row with it.
- [ ] Neither the snapshot row nor the CSV contains a seeded person's id, name or email.
- [ ] Erasing an account leaves every `metrics_daily` row as it was.
- [ ] On `/admin`, "Show metrics" shows the grouped tiles and the 0 to 6 spread; "Download CSV" saves a file that opens in a spreadsheet with one column per metric (checked by reading the downloaded text in the browser pane).
- [ ] The section reads well at 375 px and 1280 px, light and dark.
- [ ] Owner check (cannot be ticked by an agent): after deploy and `npm run db:remote`, the next morning `/admin` shows one snapshot dated that day.

## Log
- 2026-11-25 (owner decision): daily snapshots, CSV export; owner's Admin edits committed first as 1e19eb8.

Related: [[D004 Aggregate-only host analytics]] · [[F49 Profile score and finish-your-profile emails]] · [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
