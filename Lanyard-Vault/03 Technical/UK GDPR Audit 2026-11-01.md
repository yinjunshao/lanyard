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
- Hosts get aggregates only, small groups hidden (3 for totals, 5 for text). Feedback is stored without account.
- Marketing: opt-in, one-click unsubscribe, List-Unsubscribe headers, sender named.
- Only one strictly necessary cookie; no analytics. Hashed tokens, private media, security headers.

## High (fix before real events)
1. **Second person never consents to the shared selfie.** `consent_b` is set to 0 and nothing in the code ever changes it; the comment promises an "accept/remove" step on People that does not exist. The capturer ticks "Everyone in the selfie agrees". The policy says "consent, from both people". Fix: hold the selfie as *pending* until the other person accepts in the app (hidden from them until they choose), set `consent_b` with a timestamp, auto-delete if not accepted within e.g. 7 days. Or at minimum reword the policy honestly.
2. **Consent records contradict the policy.** Policy: kept up to 6 years after the account ends. Code: deleting the user cascades `consents` away (`CONSENT_KEEP` is defined but never used), and each consent row is overwritten, so there is no history or record of withdrawal. Fix: either change the policy to "deleted with your account", or keep a minimal separate consent log with no foreign key; log withdrawals too.
3. **Operator identity and registration.** Policy/Terms name "ARCK Softworks" with only the postcode WC1E 6BT. Need a full postal address (not a halls/university address you may lose), the legal entity (company number or sole-trader name), and **ICO registration with the data protection fee paid** (about £50 a year at the smallest tier; confirm current amount at ico.org.uk). 
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
