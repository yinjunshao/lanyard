---
tags: [technical, privacy, gdpr]
---
# Privacy and Data Retention

Not legal advice; a checklist from ICO guidance to be reviewed by a lawyer or UCL legal clinic before the first paid event.

## Roles
- Lanyard is **controller** for profiles and connections.
- Current Terms make Lanyard the sole controller of check-ins; hosts get aggregates only. If named exports or sponsor lead lists are added, roles change and a host DPA / sponsor agreement is needed. See [[UK GDPR Audit 2026-11-01]].
- Register with the ICO and pay the data protection fee (**TODO**).

## Lawful basis
| Data | Basis |
| --- | --- |
| Account and profile | Contract |
| Shared selfie | Consent from both people, deletable by either |
| Event check-in | Consent / legitimate interest |
| Details shared with a sponsor | Consent, separate per sponsor, never pre-ticked |
| Marketing email | Consent, separate unticked box |
| Aggregate stats | No personal data |

## Profile fields (F11)
Mode (student or career), company and role are part of the profile, like university and course. They are shown on a card, in the people list and in an event room only as the person's chosen mode shows them, they are in the data download (`/api/account/export` returns the whole profile row), and deleting the account deletes the profile row and so these fields. The Privacy Policy data table lists them. Hosts do not see them: event reports still count only courses and tags in aggregate.

Institution (F12): a profile and a society's organisation record may hold an institution id from the public list, beside the university text. It is in the data download (the profile row, and the host export's organisations) and goes with the profile row on account deletion. The list itself holds no personal data.

## How you met (F13)
A connection records how the first scan happened (QR code, typed code or shared link) in `connections.via`, beside the time it was made and the event if both people checked in. It is personal data about two people, so:
- it is shown only to those two people (the people list, the connection page), never to a host: event reports, the live view, the CSV, the webhook, event email and the admin pages do not read it ([[D004 Aggregate-only host analytics]]; `test/provenance.mjs` checks the code and the host responses);
- it is in each person's data download (`connections[].via`, with `metAt` and the event id);
- it lives on the connection row, so it goes when either person removes the connection or when either account is deleted. Selfie expiry does not touch it, and the 6 year consent-record rule does not apply to it;
- it has no retention of its own: it is kept as long as the connection is;
- connections made before F13 have none and show only "Connected"; a connection whose event has been deleted or reset keeps its method and loses the event name;
- the card address carries `?s=q`, `?s=c` or `?s=l` only to say how it was opened. The page reads it once and removes it from the address bar, and the server stores only the three allowed values. The Privacy Policy data table lists it.

## Events tab and event hub (F15)
Nothing new is stored. The hub shows a person only their own connections at that event (the same name, subtitle fields, photo, how you met and time they already see on People) and, when the host has the room on, how many other people chose to be in it (a number, never names). It does not show who anyone else connected with, and the data export and account deletion are unchanged because no new row exists. Hosts get no new field: `worker/myevents.js` is attendee-only and `test/provenance.mjs` still treats `worker/events.js` as host-facing code that must never read `via`. When an event has been deleted (the F10 host reset) its connections stay in People without the event name and its hub is a plain 404.

## Welcome steps (F14)
- A person's place in the welcome steps (`profiles.onboarding_step`, `onboarding_max`) is product state, not analytics: it lets the steps resume on any device. It is on the profile row, so it is in the data download and goes when the account is deleted. It is NULL after the steps are finished.
- The funnel is a table of daily counts per step (`onboarding_stats`: day, step, reached, completed). It has no user id, session, address or time of day, so it holds no personal data. Rows over 400 days old are deleted by the daily purge. No cookie and no third-party analytics are used. The admin page shows it (`GET /api/admin/onboarding`); hosts never see it. Step 1 counts people who have saved a name, so a visitor who opens the page and leaves is not counted.
- Terms, the 18+ confirmation and consent recording are unchanged: step 1 holds the same tick (`consents`, `consent_log`, Terms version `2026-10-26`); see the table in [[F14 Onboarding revamp]].

## Retention (implemented in `worker/purge.js`)
- Selfies: 12 months. Feedback text: 12 months.
- Inactive guests: 30 days. Expired codes and sessions: daily purge.
- Consent records: 6 years.
- Welcome-step counts: 400 days (no personal data).
- Cron: daily 03:17 and hourly :47.
- User can export and delete their own data; delete removes R2 objects too.
- Host accounts (F10) are separate: a host can download their host account data on the host portal (`/api/host/account/export`). Expired host sessions, sign-in codes and invites are purged daily. Deleting a host account is by request for now (no self-serve button). Invoice records are kept 6 years even when the organisation is deleted (the organisation's name stays on the row).

## Rules of the product
- Face images are never used for recognition and never sold.
- Hosts and sponsors never see selfies or who connected with whom.
- 18+ only; no Discovery mode for under-18. See [[D012 18 plus only]].
- No special-category questions in check-in forms (allowed list).
- Choose a UK/EU storage region for R2 and name the provider in the privacy policy.
- Breach plan: ICO within 72 hours of a serious breach (**TODO**: one-page plan).
- The Data (Use and Access) Act 2025 is changing UK law: have the lawyer check current rules.

## Terms and privacy versions
Terms version in app: `2026-10-26`. Privacy policy operator details were updated 2026-10-27 (git).

Audit with gaps and fixes: [[UK GDPR Audit 2026-11-01]]

Related: [[Security]], [[D005 Shared selfie needs both consents]], [[D011 Retention limits]]
