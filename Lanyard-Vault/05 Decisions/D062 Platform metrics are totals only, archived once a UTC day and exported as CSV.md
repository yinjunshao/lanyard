---
tags: [decision, admin, analytics, privacy]
status: Accepted
date: 2026-11-25
---
# D062 Platform metrics are totals only, archived once a UTC day and exported as CSV

**Status:** Accepted  ·  **Date:** 2026-11-25  ·  Follows [[D004 Aggregate-only host analytics]] (the same rule, applied to the whole service)

## Context
The owner asked for platform figures to report to investors and others (how many people finish their profile, whether people actually use their accounts, and more), archived now and then and exportable to graph later ([[F70 Platform metrics with daily snapshots and CSV export]]). Answers (2026-11-25): snapshots **daily**, export **CSV**. Counting everyone needs a read of every account, so the question is how to do that and let only totals out. Live tables also shrink over time (accounts are erased after 24 months unused, guests sooner) and `users.last_seen_at` holds one value per person, so a past day's active count cannot be rebuilt later: it has to be written down on the day.

## Decision
- **One function, numbers only.** `computeMetrics(db, ts)` in `worker/metrics.js` returns a flat object of finite, non-negative numbers (counts, percentages with one decimal, pence). It selects counts with one aggregate query per table, run together, and reads the six scored profile columns in pages of 500 (keyset on `user_id`) to score them with the shared `src/lib/profileScore.js` in the Worker. No id, name, email, card code or text is ever returned, so nothing built from it can name a person. A percentage is 0, never NaN or null, when its base is 0.
- **Meanings fixed in code, versioned.** Profile percentages are out of all accounts (4 complete of 10 accounts is 40.0). Plus is counted by the rule `planOf` uses (plan `plus`, no end or an end in the future). Revenue is `billing_orders` with status `paid` in the last 30 days (a refunded order is out) and credits with `granted_by = 'polar'` (bought, not starter or promo). Active is `last_seen_at`, which the app refreshes at most once a day, so one-day activity reads a little low and "came back" is rough. `METRICS_VERSION` goes up when a metric's meaning changes.
- **An archive of one row a day.** `metrics_daily` (migration 0045: `day` UTC, `taken_at`, `version`, `data` JSON of the flat numbers). The 03:17 job runs the purge, then `snapshotMetrics`, each with its own catch; it writes with `INSERT OR IGNORE`, so a second run the same day changes nothing and the first run's `taken_at` stays. The admin button replaces today's row. A metric added later appears from that day on; older rows lack it.
- **Kept indefinitely, because it is not personal data.** The rows are totals about the service and no row can be traced to a person. The table has no foreign key and nothing in `eraseUser`, `expireInactive` or `purgeExpired` touches it. A test checks rows are unchanged after erasing an account and after the purge, and that nothing in the erasing code names the table.
- **Three admin routes under the existing token check:** `GET /api/admin/metrics` (live numbers, snapshot count, first and last day), `POST /api/admin/metrics/snapshot`, `GET /api/admin/metrics/export?from=&to=` (CSV). Each is refused without the token, counts against the try limit and is written to `admin_audit`. The live read is only made when Show metrics is pressed, so signing in still makes 8 requests.
- **CSV.** `day,taken_at,version,` then every metric key seen in the range, sorted; one line a day; `taken_at` ISO 8601 UTC; an empty cell where an older row lacks a metric; real dates only (bad ones are 400 with a plain message). Every cell that would start with `=`, `+`, `-`, `@`, a tab or a return gets a leading apostrophe and a cell with a comma, quote or line break is quoted. Because metrics are never negative (asserted in a test), no real value is altered by that rule.

## Consequences
The owner can report platform figures and graph them from a CSV with one command a day and no extra service. The figures are rough where the source is rough (one last-seen time per person), and the page and the CSV say so. No Terms or Privacy Policy change is needed in the view of the build: this is internal reporting about the service, not new processing of what a person did, and no one's data leaves the Worker; the owner may still want one sentence in Privacy that aggregate usage totals are kept. The table is a new kept store, so [[Privacy and Data Retention]] lists it.

**Evidence:** `worker/metrics.js`, `worker/metricsAdmin.js`, `migrations/0045_metrics_daily.sql`, `worker/index.js` (`scheduled`), `src/components/AdminMetrics.vue`, `test/metrics.mjs`

Related: [[F70 Platform metrics with daily snapshots and CSV export]], [[D004 Aggregate-only host analytics]], [[F49 Profile score and finish-your-profile emails]] · back to [[Decision Log]]
