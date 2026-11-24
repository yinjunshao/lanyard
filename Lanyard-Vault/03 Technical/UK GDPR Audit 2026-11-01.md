---
tags: [technical, privacy, gdpr, audit]
date: 2026-11-01
---
# UK GDPR / PECR audit (2026-11-01)

**Scope:** `Privacy.vue`, `Terms.vue`, consent flows (connect, event check-in, sign-up), export/delete, retention cron, email, service worker, admin, deployment files. Static review of code and text only: no live testing, no review of the Cloudflare/Resend dashboards, no legal advice. Nobody can certify a product "completely compliant"; this lists what the evidence shows. Have a lawyer or the UCL legal clinic review before the first paid event. See [[Privacy and Data Retention]].

**Verdict:** a strong base for a student project, but not ready to run at real events until the four High items are fixed.

## Already good
- Selfie capture needs an explicit tick; directory, each sponsor and marketing are separate, never pre-ticked.
- 18+ confirmation recorded; Terms/Privacy acceptance versioned (`worker/legal.js`).
- In-app data download and account deletion (removes R2 images too). Delete a connection removes the selfie for both.
- Retention cron: selfies 12 months, feedback text 12 months, guests 30 days, codes/sessions/counters.
- Hosts get aggregates only, small groups hidden (3 for totals, 5 for text). Feedback is stored without account. (Since F31 an event can switch on a named list of who checked in, for people who left that tick on; see the F31 notes at the end.)
- Marketing: opt-in, one-click unsubscribe, List-Unsubscribe headers, sender named.
- Only one strictly necessary cookie; no analytics. Hashed tokens, private media, security headers.

## High (fix before real events)
1. **Second person never consents to the shared selfie.** `consent_b` is set to 0 and nothing in the code ever changes it; the comment promises an "accept/remove" step on People that does not exist. The capturer ticks "Everyone in the selfie agrees". The policy says "consent, from both people". Fix: hold the selfie as *pending* until the other person accepts in the app (hidden from them until they choose), set `consent_b` with a timestamp, auto-delete if not accepted within e.g. 7 days. Or at minimum reword the policy honestly.
2. **Consent records contradict the policy.** Policy: kept up to 6 years after the account ends. Code: deleting the user cascades `consents` away (`CONSENT_KEEP` is defined but never used), and each consent row is overwritten, so there is no history or record of withdrawal. Fix: either change the policy to "deleted with your account", or keep a minimal separate consent log with no foreign key; log withdrawals too.
3. **Operator identity and registration.** Policy/Terms name "ARCK Softworks" with only the postcode WC1E 6BT. Need a full postal address (not a halls/university address you may lose), the legal entity (company number or sole-trader name), and **ICO registration with the data protection fee paid** (about £50 a year at the smallest tier; confirm current amount at ico.org.uk). **Update 2026-11-22 ([[F50 QuantLink as the operator]]):** the controller is now named, Quantlink Investment Service Company Limited, in the Privacy Policy, the Terms and a footer line; name only, by the owner's choice. Still open: a postal address for paid plans, ICO registration and the fee, and a lawyer's view on whether a UK representative is needed (UK GDPR Article 27). 
4. **Legacy v1 and leftover exports.** The old Worker (`lanyard.musea-moderation.workers.dev`, KV) is still live with guessable birthday login and v1 data including birthdays; the production config still binds that KV namespace to v2. `.migrations/lanyard-kv.json`, `.migrations/media/` and `.wrangler/state` hold plain copies of real user data on the laptop (gitignored, but unencrypted). Fix: confirm migration, delete or redirect v1, empty and delete the KV namespace, remove the binding, delete the local exports.

## Medium
5. **Complaints process (new law).** Since 19 June 2026 controllers must let people complain to them, acknowledge within 30 days and handle without undue delay ([CMS](https://cms.law/en/gbr/legal-updates/data-use-and-access-act-2025-new-statutory-rules-on-handling-data-protection-complaints-from-19th-june-2026), [DLA Piper](https://privacymatters.dlapiper.com/2026/06/uk-new-complaints-handling-rules-under-duaa-take-effect-on-19-june-2026-are-you-ready/)). The policy only points to the ICO. Add a complaint route, a 30-day acknowledgement, and a log.
6. **Missing paperwork.** Record of processing (Art. 30; not exempt, processing is not occasional), a short DPIA (face photos, Discovery mode, student audience), legitimate-interests assessment, breach response plan and register, accepted DPAs with Cloudflare and Resend, written retention schedule. Not code, but regulators ask for them.
7. **Privacy by default.** Profiles default to `is_public = 1`; no `noindex` anywhere; avatars are served `public, max-age=31536000, immutable`, so a deleted photo can survive in browser/CDN caches for a year. Default to link-only, add noindex, use short or private caching for avatars.
8. **Reports and blocks** (free-text reasons about other people) are not in the policy's data table or retention list and are never purged. Add to policy; delete e.g. 12 months after resolution.
9. **Access request is incomplete.** Export omits verified email and notification/marketing settings, and all host data (name, email, sign-up answers, billing requests, tickets). Policy says hosts email you; write the manual DSAR steps (1 month deadline) or add them to the export.
10. **Withdrawing event choices.** The API lets someone re-check-in to change directory/sponsor choices, but I did not confirm a screen exposes it. Policy promises withdrawal is as easy as giving.
11. **Admin access.** One shared `ADMIN_TOKEN`; `/admin` can search users by name, university and email; no audit log. Add logging, rotate the token, consider Cloudflare Access with 2FA.
12. **Inactive accounts never expire.** Claimed profiles are kept "until you delete". Add inactivity expiry (e.g. 24 months, with a warning email).
13. **Backups.** The Terms mention backups; D1 keeps point-in-time history for a period (check current Cloudflare retention). Say so in the policy.

## Lower
- **Feedback reminder emails** are on by default. Grey area under PECR; keep wording purely about feedback (no promotion), keep the one-click off, or make them opt-in.
- **Data location:** no D1/R2 jurisdiction set. Policy covers transfers; consider an EU jurisdiction for new buckets/databases (check Cloudflare docs).
- **Sponsors:** today only counts. If you ever send named lead lists, sponsors become controllers: per-sponsor notice, sponsor agreement, re-check the policy. The Terms make Lanyard sole controller of check-ins and hosts receive aggregates only, so the earlier "host is controller, needs a DPA" idea no longer applies unless named exports return.
- **Age check** is a tick box: acceptable for 18+, keep the "we delete if we find out" route and the report button.
- **Analytics later?** Any non-essential cookie/storage needs consent and a notice (DUAA widens some exemptions; re-check then).
- Re-run `npm test`, and consider an external security test before any sponsor data is shared.

## Missing features for UK use
- [ ] Pending/accept flow for shared selfies (High 1) and a "remove me from this photo" button
- [ ] Settings page listing every consent with date and a withdraw switch
- [ ] Complaint and data-request form with a log
- [ ] Short just-in-time notices at selfie and at event check-in
- [ ] Admin audit log; documented erasure test
- [ ] Inactivity expiry; retention for reports
- [ ] Host DPA/terms acceptance record (scope exists) if named exports are ever added

Related: [[Security]], [[Risks]], [[Open Questions]], [[D005 Shared selfie needs both consents]], [[D011 Retention limits]]

## Status after the code pass (2026-11-01)
Built and tested locally, **not yet deployed** (migration `0014_gdpr.sql` + new code):
- [x] High 1: shared selfie is *pending* until the other person accepts (`/api/connections/:id/selfie/accept|remove`), auto-deleted after 7 days, "remove me from this photo" button, withdrawals logged.
- [x] High 2: `consent_log` (no foreign key, kept 6 years, withdrawals logged); policy now matches.
- [x] Medium 5: `/privacy-request` form, emailed acknowledgement, 30-day deadline log, admin list and close.
- [x] Medium 7: `X-Robots-Tag: noindex`; avatars cached 1 day instead of 1 year. Profiles still default to `is_public = 1` (product decision, see below).
- [x] Medium 8: reports deleted after 12 months; reports and blocks added to the policy.
- [x] Medium 9: export now includes email settings, consent history, host data, tickets, billing requests, privacy requests.
- [x] Medium 10: "Your choices at this event" on the event page (directory and sponsors) with history.
- [x] Medium 11: every admin request is written to `admin_audit` (12 months).
- [x] Medium 12: unused accounts: warning email at ~23 months, deleted at 24; any sign-in resets it.
- [x] Medium 13: backups sentence added to the policy.
- [x] Settings: "My consents and privacy requests".

**Still needs the owner (not code):** High 3 (full postal address, legal entity, ICO registration and fee), High 4 (shut down v1 Worker, empty/delete the KV namespace and remove its binding, delete `.migrations/` and `.wrangler/state`), Medium 6 (Art. 30 record, DPIA, LIA, breach plan, accepted Cloudflare/Resend DPAs), rotate `ADMIN_TOKEN` and consider Cloudflare Access, decide default profile visibility (`is_public`), decide whether feedback reminders should be opt-in, optional EU jurisdiction for new D1/R2.

## DPIA draft: event presence (F17)
Part of Medium 6. A draft for the owner and a lawyer to review; not signed off.

- **What and why:** at an event that is on, an optional face photo, a short line and a wish, shown to other opted-in attendees of the same event so they can find each other in the room. Purpose: in-person introductions, which is the product. Lawful basis: consent, per event, off by default, as easy to withdraw as to give.
- **People affected:** adults (18+ is enforced at sign-up, [[D012 18 plus only]]), mostly students. A face photo is personal data; it is **not** used for recognition and is not special category data as processed here (no biometric template is made). Treat it as higher risk anyway because of the audience and because a face can identify someone in a room.
- **Necessary and proportionate:** the photo is optional; the line and wish are free text of 80 and 120 characters; only first name and last initial are shown; no card, contact details or ids; only people also opted in, only at the same event, only while it is on.
- **Risks and what reduces them:** being found by someone unwanted (blocking both ways, report from the list, only opted-in people see it, no contact route from the entry); photo copied by another attendee (stated in the copy; cannot be prevented, no public URL, `no-store`); photo metadata (EXIF, XMP and text chunks removed by the Worker); lurking (you must be findable to see others); over-retention (deleted at once on withdrawal, 48 hours after the event ends at the latest, with the account, and by the host reset); host access (hosts see only a count, hidden under 3); leaks through reasons (only fields each person shows, F16 rules); abuse of the free-text line (report and block; the line is shown only to opted-in attendees).
- **Residual risk:** low to medium. Owner to review: whether Terms and Privacy should be re-accepted, the wording on the hub card, and the Art. 30 record entry. Tests: `test/presence.mjs`.

## DPIA draft: AI features (F21)
Part of Medium 6. A draft for the owner and a lawyer to review; not signed off. The AI features are off in production until the owner turns them on.

- **What and why:** a model drafts follow-up messages, summarises anonymous event feedback for hosts, finds people the asker already knows, and ranks people to meet at an event. Each runs only when someone taps; a person reads the result; nothing is sent automatically.
- **People affected:** adults (18+), mostly students; other people whose cards are in a prompt; people who wrote feedback (anonymous).
- **Data:** what the asker can already see (card fields their connection shows them, their own notes, event names and dates, anonymous feedback text) plus what they type. Never emails, link addresses, photos, other people's notes or hidden fields; text is cleaned and ids are opaque. Special category data is not asked for, but free text can contain it: the model only sees what was already visible, and results are not stored beyond 7 days.
- **Necessary and proportionate:** saves time at the moment people drop off (follow-up) and for hosts reading many answers; each feature has a version without AI; limits per person and per day cap use; the opt-out removes someone from AI search.
- **Risks and what reduces them:** prompt injection through bios or answers leaking data (the model is only given what the asker may see, has no tools, and the Worker accepts only allowed ids, exact quotes and plain text; `test/ai-injection.mjs` runs a model that obeys every attack); a provider keeping or training on the data (Gateway logging off, Anthropic commercial terms and DPA: owner steps, unconfirmed); transfer outside the UK (provider terms, UK addendum); cost abuse (burst, quota, budgets, kill switch, provider limits); profiling feeling (results are suggestions with the reason shown, no automated decision with legal effect); over-retention (7 days for replies, 13 months for counts, deleted with the account, in the data download); hosts seeing individuals (they do not: summaries use anonymous answers and their own counts).
- **Residual risk:** low to medium until the provider steps are confirmed. Owner to review: the "no training" and "logging off" sentences in the Privacy Policy, whether Terms and Privacy should be re-accepted, and the Art. 30 record entry for Anthropic and Cloudflare.

## Legitimate interests assessment: AI people search (F21)
- **Purpose:** letting a person find, among people they have already connected with, someone who can help ("do I know someone who..."), which is the point of keeping connections.
- **Necessity:** the same fields are already visible to that person on the card they connected through; the AI only ranks what they could read themselves. No new information is revealed to anyone.
- **Balance:** reasonable expectation is moderate (people do not expect a model to read a card), so the default is on **with an easy opt-out** (owner decision 2026-11-10): Settings, Privacy and data, "Let people I've connected with find me using AI search", effective at once, recorded in the consent history, and explained in the Privacy Policy (section 8c). Blocked people never appear. Nothing runs unless the searcher taps. People can also object by writing to us.
- **Conclusion (draft):** legitimate interests can apply; a lawyer or legal clinic should confirm before the feature is switched on for everyone.

## Legitimate interests assessment: an organiser's list of who checked in (F31)
Part of Medium 6. A draft for the owner and a lawyer to review; not signed off. Named attendance is off unless the host switches it on, per event ([[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]]).

- **Purpose:** the organiser (and Lanyard, who runs the check-in) knowing who came to an event: a register for safety, numbers by person rather than by count, and following up for that event. This is the plain reason people check in to events at all.
- **Necessity:** the list is the least that does it: a name and a check-in time, nothing else unless the person leaves another tick on. There is no way to enable a free-text data item, no special category question, and nothing about who connected with whom. A count alone would not give a register.
- **Balance:** people at a society or company event reasonably expect their name to be on a register. They are told before they check in, on the page itself, who asks, why and what, in plain words with a tick in each box; they can untick the first and still check in; they can come off the list later at once (event page or Settings), after which the organiser's next look no longer shows them. The host's list is kept 12 months after the event (proposed; owner to confirm), then deleted. Hosts see nothing for events without the list, and nothing on the Present page or the report. Names are shown only to the event's own organisation, on the host site, behind a signed-in host account.
- **Risks:** an organiser using the list for another purpose or keeping a download (Host Terms now say so; Lanyard cannot police a copy); a host switching it on without a real reason (the why line is required and shown to attendees); people not noticing the notice (a full-width block above the Check in button, not behind a link); an event where people feel they cannot untick (they can, and still check in).
- **Roles:** the organiser decides why a list is kept, so it is a controller for its own copy; Lanyard still holds the list and the choices. A host agreement or a lawyer's view on controller and processor roles is needed before launch ([[Privacy and Data Retention]]).
- **Conclusion (draft):** legitimate interests can apply to the attendance list. The objection route is the untick, at check-in and afterwards.

> [!warning] The extra items are not covered by this assessment
> The owner chose to pre-tick every box on the check-in page (2026-11-13), after being told that ICO guidance says a pre-ticked box is **not valid consent** under UK GDPR. That does not matter for the attendance list, which rests on legitimate interests with the untick as the objection route. It does matter for the two extra items a host may add, **the person's email address and their card, shared with the organisers**: sharing an email address so an organiser can contact someone is the kind of thing consent normally covers, and consent cannot be a pre-ticked box. Those items need **another lawful basis, or a lawyer's review, before launch**. They are built pre-ticked as the owner asked. The Privacy Policy section 8d carries a bracketed operator note to the same effect. Until that review, the safest use is to leave the two extra items off for real events.

## Legitimate interests assessment: suggesting people to each other at an event (F60)
Part of Medium 6. A draft for the owner and a lawyer to review; not signed off. By the owner's decision (2026-11-24) everyone checked in to an event can be suggested to the others there unless they untick "Suggest me to people here" ([[F60 Intention at check-in and who to meet for everyone]], [[D054 Everyone checked in can be suggested unless they untick Suggest me, shown only what their card shows]]). This narrows the F17 DPIA above, where being findable was consent, off by default.

- **Purpose:** helping people at an event find who to talk to (the product's reason to exist): up to five people checked in to the same event, ordered from what each hopes to get from it and what their cards show, with an AI order when AI is on.
- **Necessity:** an entry is only what the person's own card already shows to anyone they hand it to, cut down: first name and last initial, the default card's headline and at most three of its tags, plus their own optional intention and one reason. No surname, card link, links, email or contact route; a photo only if they separately turned on Be easy to find. A smaller set would not let anyone choose who to walk over to. An opt-in default (D027) was tried in F17 and left the list empty, which is the owner's reason for this choice.
- **Balance:** people checking in to a networking event reasonably expect to be introduced to others there; they may not expect to be suggested without choosing it. So: a notice and the tick on the check-in page itself, above the button, in plain words, on to start with and untickable without losing the check-in; untick later on the event's page or in Settings, effective on the very next request; only people at the same event, only while it is on, only those who are suggested themselves (no lurking); blocks both ways, report and block from the list; the host can switch it off per event; hosts see two counts, hidden under 3, never who; 48 hours after the event everything goes. Each choice is recorded with the words and version.
- **Risks:** being approached by someone unwanted (untick, block both ways, report; no contact route from the entry); an intention that says too much (it is optional, 120 characters, shown only at that event while it is on); people not reading the notice (it sits in its own panel next to the fields they fill in, not behind a link; still a residual risk, which is why a lawyer's look is advised); the AI provider seeing intentions and card fields (only when AI is on, without names, photos or ids, not for anyone who switched AI search off, not for anyone who unticked; section 8c); an agent-built default that pre-ticks a choice (this is an objection route under legitimate interests, not consent; it would not be valid consent).
- **Special category data (F69, 2026-11-24):** a tag, headline or intention can reveal religion or belief, health, sexuality or gender identity, politics, ethnicity or union membership (a faith society, a disability group, an LGBTQ+ network, a political society, a union, a heritage society). Matching on it would be processing Article 9 data for a new purpose with no Article 9 condition. So those words are screened out of matching, shared ground in Who to meet and the AI input, reasons can never contain them, and the prompt says not to match on or mention them ([[D057 Who to meet never matches on or sends special category words]]). They still show on the card, which is the person's own choice. Residual risk: a list cannot catch every phrasing, and the AI may still infer from what is left; F61's embeddings (option B) would need the same screen first.
- **Conclusion (draft):** legitimate interests can apply, given the notice, the narrow entry, the untick at check-in and later, and the host switch. A lawyer should confirm before launch, with the Terms and Privacy version bump the owner decides.

### F31 DPIA notes (draft)
- **Data:** name, check-in time, and (only if ticked) the verified email and what the default card shows (headline, the line under the name, its web links). The check-in answers, connections, photos and how people met are never part of it.
- **Where it lives:** `event_attendees` (deleted by account deletion, by the host switching the list off, by an untick, and 12 months after the event ends); `consent_log` holds each choice with the exact wording and its version for 6 years, as for every consent record.
- **Residual risk:** medium until the extra items' basis is settled and the host terms are reviewed. Tests: `test/named-attendance.mjs`.
