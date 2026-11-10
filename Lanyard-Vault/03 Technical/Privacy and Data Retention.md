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

## Retention (implemented in `worker/purge.js`)
- Selfies: 12 months. Feedback text: 12 months.
- Inactive guests: 30 days. Expired codes and sessions: daily purge.
- Consent records: 6 years.
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
