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
| Event presence: face photo, line and wish (F17) | Consent, separate per event, off by default, withdrawable at once |
| Details shared with a sponsor | Consent, separate per sponsor, never pre-ticked |
| Marketing email | Consent, separate unticked box |
| AI features: what you type and what you can already see about the people involved, sent to the model when you tap (F21) | Contract for your own drafts; legitimate interests for being found by AI search (opt-out in Settings); hosts: legitimate interests |
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

## Shared ground (F16)
- "In common" on a person's card page ("Both into robotics", "Same course", "Both at <company>", "Both at <event>", "Both at <institution>") is worked out when the page is opened, from fields each of you already shows the other, and is **not stored**. It is not in your data export and there is nothing to delete; deleting your account removes the fields it reads.
- It uses only what each person shows: the fields of the mode they chose (a kept course on a career profile, or a kept company on a student profile, is never used), and the "come to me for" tags of the card they shared. So it cannot tell the other person something you keep hidden.
- Event facts are limited to past events you were already able to know the other attended: the event you connected at, or one whose attendee directory they joined. Hosts never see it. Blocked people, signed-out viewers and your own card get nothing. Mutual connections are not counted.

## Event presence and who to meet (F17)
- **What:** at an event that is on, a person may choose "Show me to people here": a face photo (optional), a line of up to 80 characters and a wish of up to 120 ("I want to meet someone who..."). It is per event, off by default and never pre-ticked. It is stored in `event_presence` (one row per person per event) with the photo in R2 under `presence/`. The consent is recorded as scope `event_presence:<eventId>` in `consents` and `consent_log` (granted, withdrawn, and `photo` lines when a selfie is added or deleted).
- **Who sees it:** only people checked in to the same event, while it is Ongoing, with the host's directory on, who have turned it on themselves (so you cannot look without being findable). Not signed-out visitors, not people at other events, not anyone once the event has ended, not a blocked person (both ways). An entry is the photo, first name and last initial, the line, and one reason ("Into robotics"); no card link, no user id, no contact details. Reasons use only what each person shows (F16's `visibleSide`, [[D026 Shared ground is worked out from what each person shows, and never stored]]).
- **The photo is private media:** served only by `/media/presence/...` to the owner or someone allowed to see that person, `private, no-store`, never from a public URL. The Worker checks the bytes are a real WebP, JPEG or PNG (as for all uploads), caps it at 600 KB, and removes EXIF, XMP and text chunks before storing. It is never used for recognition.
- **Retention:** deleted when the person turns it off or withdraws (row, R2 object and consent, at once); otherwise by the daily purge 48 hours after the event ends (owner decision 2026-11-10), by the same end rule as the event status. Also deleted with the account, and by the host reset script (which deletes the R2 objects first). The consent record stays 6 years like the others.
- **Data download:** `eventPresence` lists a person's own rows (event, photo link, line, wish, times).
- **Hosts:** see only how many people ever turned it on at an event (`events.presence_used`), and only from 3 up ([[D004 Aggregate-only host analytics]]). No host-facing file reads `event_presence`.
- **Risks and the DPIA:** see the F17 DPIA in [[UK GDPR Audit 2026-11-01]]. Decision: [[D027 Event presence is opt-in, private and deleted 48 hours after the event]].
- **Owner decision still open:** a face-photo feature probably warrants a new Terms and Privacy version so everyone re-accepts. It has not been bumped.

## AI features (F21)
- **What is stored:** `ai_cache` holds the checked reply for 7 days at most (so asking again is free); `ai_usage` and `ai_daily` hold counts, tokens and cost for 13 months with no text. **No prompt is stored** by us. All of it is in the person's data download (`ai`: usage rows, replies still held, the search choice) and in a host's download (their own counts); it goes on account deletion (`eraseAi`), is purged daily (`purgeAi`), and rows for an account that no longer exists are swept up. Hosts see none of it per person.
- **What goes to the provider:** only what the asker could already see plus what they type, cleaned (no emails, links, control or zero-width characters, no `<data>` look-alikes), with opaque ids. Processors: Anthropic (model) and Cloudflare (AI Gateway). Owner steps: turn off Gateway body logging, accept Anthropic's DPA and confirm no training on API data; the Privacy Policy sentences on both are only true once that is done.
- **Being found by AI search:** `users.ai_search_ok`, default 1 (owner decision 2026-11-10), switched off in Settings, Privacy and data. Honoured by the foundation, not by each feature. Each change is in `consent_log` (scope `ai_search`). Basis: legitimate interests; assessment below and in [[UK GDPR Audit 2026-11-01]].
- **Rules:** nothing runs on page load or typing; a person reads every result; nothing is sent for them; no tools, so a prompt injection can at most change a suggestion for the person asking.
- Privacy Policy: section 8c, rows in the data and retention tables, the provider line in section 4 and the legitimate-interests bullet. **The Terms and Privacy version was not bumped**; owner decision.

## Events tab and event hub (F15)
Nothing new is stored. The hub shows a person only their own connections at that event (the same name, subtitle fields, photo, how you met and time they already see on People) and, when the host has the room on, how many other people chose to be in it (a number, never names). It does not show who anyone else connected with, and the data export and account deletion are unchanged because no new row exists. Hosts get no new field: `worker/myevents.js` is attendee-only and `test/provenance.mjs` still treats `worker/events.js` as host-facing code that must never read `via`. When an event has been deleted (the F10 host reset) its connections stay in People without the event name and its hub is a plain 404.

## Welcome steps (F14)
- A person's place in the welcome steps (`profiles.onboarding_step`, `onboarding_max`) is product state, not analytics: it lets the steps resume on any device. It is on the profile row, so it is in the data download and goes when the account is deleted. It is NULL after the steps are finished.
- The funnel is a table of daily counts per step (`onboarding_stats`: day, step, reached, completed). It has no user id, session, address or time of day, so it holds no personal data. Rows over 400 days old are deleted by the daily purge. No cookie and no third-party analytics are used. The admin page shows it (`GET /api/admin/onboarding`); hosts never see it. Step 1 counts people who have saved a name, so a visitor who opens the page and leaves is not counted.
- Terms, the 18+ confirmation and consent recording are unchanged: step 1 holds the same tick (`consents`, `consent_log`, Terms version `2026-10-26`); see the table in [[F14 Onboarding revamp]].

## Retention (implemented in `worker/purge.js`)
- Selfies: 12 months. Feedback text: 12 months.
- Event presence (F17): at once on withdrawal, otherwise 48 hours after the event ends.
- Inactive guests: 30 days. Expired codes and sessions: daily purge.
- Consent records: 6 years.
- Welcome-step counts: 400 days (no personal data).
- AI replies (`ai_cache`): 7 days. AI usage counts (`ai_usage`, `ai_daily`): 13 months.
- Cron: daily 03:17 and hourly :47.
- User can export and delete their own data; delete removes R2 objects too.
- Host accounts (F10) are separate: a host can download their host account data on the host portal (`/api/host/account/export`). Expired host sessions, sign-in codes and invites are purged daily. Deleting a host account is by request for now (no self-serve button). Invoice records are kept 6 years even when the organisation is deleted (the organisation's name stays on the row). Host promo claims (F20: which host account and organisation took which code, and the credits given) are in the host download (`promoCodes`), go with the host account, and are wiped by the host reset with the credits they led to; they are not invoice records. The admin page sees totals per code only.

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
