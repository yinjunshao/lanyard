---
tags: [roadmap, feature, email, profile]
id: F49
priority: P1
phase: 9
size: M
status: Not started
needs: [F45, F48]
---
# F49 Profile score and finish-your-profile emails

**Priority:** P1 · **Phase:** 9 Owner requests (2026-11-22) · **Size:** M · **Needs:** [[F45 Email when someone new connects]], [[F48 Follow-up reminder emails]] · back to [[00 Master To-Do]]

> [!note] Owner decision 2026-11-22: the photo counts, and the score is shown as a small bar on Edit profile. The emails use the same score.

## What the owner asked for (2026-11-22)
"We should remind the users to complete their profile on email. We need to do a research on a good time to send out this email. So obviously this will be a cron job, but we need to do a research into psychology, not and also like the average time where users will be online after a networking event. So there will be set a few rules to stand from. First of all, it has to be, for example, after an event, maybe like an hour and a half ish. So I'm assuming that's about the time when they get home after the event. If they don't complete it by then, or make changes to their profile of some kind, then I guess you could essentially have another one in like after like a bit. In the profile page, so the base profile, the master one, there should be like a progress bar that isn't exactly maybe not displayed to the user, but that's how we score if a profile has been completed or not. And then we will send the email if it is not met that level. So you have compulsory ones like name. I'm not sure about photo, but yes, for university, course, what you do about, and at least one social. That should be good enough, unless you have a better idea."

Answer (2026-11-22): **Photo counts, bar shown**: "Complete = name, photo, university and course (or company and role), what you do, and at least one link. A small 'Profile 4 of 6' bar on Edit profile shows what's missing; seeing progress makes people more likely to finish. Emails use the same score."

## Research (orchestrator, 2026-11-22)
- There is no study of the best send time for an "incomplete profile" nudge, and general send-time studies disagree: consumer audiences tend to read personal email in the evening, business audiences 10-11 am. Open rates are unreliable since Apple Mail Privacy Protection, so success should be measured by **profiles completed**, not opens. Closest analogue: abandoned-cart emails, first reminder 2-4 hours after the moment of intent. Sources: [Instantly, reminder timing](https://instantly.ai/blog/reminder-email-timing-when-and-how-often-to-send/), [Klaviyo, send times](https://www.klaviyo.com/blog/best-email-send-times), [Pipedrive, best time](https://www.pipedrive.com/en/blog/best-time-to-send-an-email), [Shopify, best time](https://www.shopify.com/blog/best-time-to-send-an-email).
- Networking advice is consistent that follow-up should happen within 24 to 48 hours, while the meeting is remembered; the evidence is practitioner advice rather than controlled studies. Sources: [Mind Tools](https://www.mindtools.com/a8pjz5d/how-to-follow-up-after-networking), [ATD](https://www.td.org/insights/the-art-of-the-follow-up).
- Psychology used here: a visible progress bar (goal-gradient and endowed-progress effects, as in profile-strength meters), naming the people they met (social proof and a concrete reason: "so Sam remembers you"), one clear button, and at most two emails.

## Rules (from the owner's words and the research)
- **Who:** a person with a profile, under 6 of 6, who has `notify_reminders = 1` (F48's switch) and a `mailableAddress` (F45).
- **The anchor** ("after an event"): the later of (a) the end of an event they checked in to in the last 24 hours (`COALESCE(ended_at, ends_at, starts_at + 4 h)`, as in `worker/eventmail.js`) and (b) the time of their latest connection in the last 24 hours. The anchor moves later while they keep connecting, so nobody is emailed mid-event.
- **Email 1:** about 90 minutes after the anchor (the owner's "get home" time). With the hourly cron at :47, send when `now >= anchor + 75 min`, which lands between 75 and 135 minutes after. Never between 23:00 and 08:00 in the person's time zone (`users.tz` from F45, default `Europe/London`); if the time falls in that window, send at the next 08:30 instead.
- **Email 2:** only if still under 6 of 6 **and** they have not changed their profile since email 1: the next day at about 19:00 in their time zone (evening, personal time), at least 18 hours after email 1. This stays inside the 24-48 hour window while the event is remembered.
- **Never more than two** finish-your-profile emails per person, ever (decided by the orchestrator; owner to confirm: see the question below). For a pending (unconfirmed) address F45's cap of two emails in total also applies.
- Stop at once when the profile reaches 6 of 6, the switch is off, or the account is deleted.

> [!question] Should a person who is still incomplete get the two emails again after a later event (say a month on), or only ever two in total? This plan says two in total; changing it is one constant and a test.

## Current state
- The master profile is edited at `src/views/EditProfile.vue`; profile fields in `profiles` (name, photo, mode, uni, course, company, role, headline, about, tags, links). `src/views/Welcome.vue` `firstMissing()` already decides what is missing per step: reuse its idea, not its code.
- "What you do" is the headline field ("What I do"); confirm in the code and use whatever the card shows as that line.

## Plan
1. **One scoring rule** in a small shared module (used by the Worker and the page; keep it out of any public page's first load): six items, each 1 point: name; photo; university (student) or company (career); course (student) or role (career); what you do (headline); at least one link. Complete = 6.
2. **Edit profile:** a quiet bar at the top, "Profile 4 of 6", with the missing items as links that scroll to or focus their fields. Hidden at 6 of 6 (or a short "Your profile is complete"). Follow [[Design System]].
3. **Migration 0038 (additive):** columns or a small table for `profile_nudge1_at`, `profile_nudge2_at` and the profile's last-changed time if there is none already (`profiles.updated_at` may exist: check).
4. **The job** (new `worker/profilenudge.js`, from the hourly cron), the rules above, a per-run cap, sent once (conditional write claims the send before mailing, so two runs never both send).
5. **The email:** subject like "Finish your card so Sam remembers you" (first names of up to two people met in the anchor window, else "Finish your Lanyard card"); the missing items as a short list; one button to `/app/profile` (or the welcome step that is missing); the F45 confirm button for a pending address; the F48 stop link; no other person's details beyond first names they already see in the app.
6. **Privacy Policy:** section 2 and 6 rows for these emails (at most two, the switch stops them). No Terms version bump ([[F50 QuantLink as the operator]] does it).

## Tasks
- [ ] F49.1 Scoring module and the Edit profile bar; tests for the score in both modes.
- [ ] F49.2 Worker: migration 0038, the nudge job with the timing rules, the email; tests in a new `test/profile-nudge.mjs` with a fixed clock (mid-event no email, 75 min after the anchor sends, 23:30 London waits until 08:30, email 2 next evening, no email 2 after a profile change, none at 6 of 6, never a third, switch off, pending address cap, a Hong Kong time zone shifts the quiet hours, two runs at once send once).
- [ ] F49.3 Privacy Policy rows; vault notes ([[Data Model]], [[Integrations and Email]], [[Privacy and Data Retention]], [[Features]]), decision note for the timing rules; browser check of the bar at 375 and 1280 px, light and dark; the email seen in the `MAIL_LOG=1` console.

## Acceptance checks
- [ ] A student with name, photo, university and course but no headline and no link scores 4 and the bar says "Profile 4 of 6" and names the two missing items.
- [ ] A career person scores company and role instead of university and course.
- [ ] Someone who connected at 20:00 and again at 21:10 (London) with a 3 of 6 profile gets email 1 at the 22:47 run, not before.
- [ ] Someone whose anchor is 22:30 London gets email 1 at the 08:47 run, not overnight.
- [ ] Email 2 goes about 19:00 the next day only if the profile is still under 6 and unchanged since email 1; a third never goes.
- [ ] Reaching 6 of 6, switching reminders off, or deleting the account stops all of it.
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F45 Email when someone new connects]] · [[F48 Follow-up reminder emails]] · [[F14 Onboarding revamp]] · back to [[00 Master To-Do]]
