---
tags: [roadmap, feature, host, design, security]
id: F66
priority: P2
phase: 11
size: L
status: In progress
needs: [F65]
---
# F66 Host branding on event pages

**Priority:** P2 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** L · **Needs:** [[F65 Event themes and an advanced look]] · back to [[00 Master To-Do]]

> [!note] Owner decisions 2026-11-24:
> - A small **"Check in with Lanyard"** line stays at the foot of every branded page.
> - Branding shows on **paid events only**: events paid for with a credit (`events.is_paid`).

## What the owner asked for (2026-11-24)
"Also, I want to work on, so if the post sets up company settings, or like basically the settings for that host account, they can basically change the name of, for example, the presentation page where it displays the QR code. It can change the name. Instead of lanyard logo, it is now their company name or logo. I'm not sure how to do that very well, but that is a goal. So they can customize the event page to their own liking."

Asked whether anything from Lanyard should stay, the owner chose **"Small 'with Lanyard' line"**. Asked who gets branding, the owner chose **"Paid events only"**.

## Current state
- Organisations are the `orgs` table (`migrations/0001_init.sql` line 110), with team members ([[F10 Separate host accounts on host subdomain]] and later items). Their settings live on the host account page (`src/views/HostAccount.vue`).
- The Present page (`src/views/HostPresent.vue`, line 105) shows the wordmark `lanyard.` above the QR. The check-in page head shows "lanyard" on the strap (`EventPage.vue`, `.profile-strap-word`). Print (`HostPrint.vue`) and the event hub head also carry the Lanyard mark.
- Image uploads exist for photos (`worker/media.js`, R2), with the checks in `worker/security.js`. There is no organisation logo.
- Events carry `is_paid` (`worker/hosts.js` line 250).

## Plan
- **Organisation branding settings,** on the host account page, as a "Branding" section that owners and admins of the organisation can change (not plain members, matching the existing team roles). It has:
  - **Display name** shown on event pages: up to 60 characters, plain text, cleaned of control, zero-width and direction-changing characters. It defaults to the organisation's name.
  - **Logo:**
    - PNG, JPEG or WebP only. **No SVG**, because it can carry script.
    - Up to 1 MB, checked by magic bytes as well as type.
    - Kept within 1024 px on its longest side, re-encoded or rejected to the existing media rules.
    - Stored in R2 under the organisation, served through the Worker with its content type, `X-Content-Type-Options: nosniff` and a long cache with a version in the URL.
    - A remove button.
  - A live preview of the Present page head and the check-in page head.
- **Per event:** "Use our company branding" in step 2's Advanced ([[F65 Event themes and an advanced look]]), on by default once the organisation has branding. It applies only when the event is paid. On a free event the switch shows, disabled, with "Branding shows on paid events", and the pages stay Lanyard-branded.
- **Where branding shows** on a paid event with branding on:
  - the Present page: the logo, or the display name in the wordmark style if there is no logo, in place of `lanyard.`;
  - the check-in page strap head;
  - the attendee's event hub head;
  - print.

  Every one keeps a small muted **"Check in with Lanyard"** line at the foot. That line can't be switched off, and a test checks it is on every branded surface. Nothing else changes: the Lanyard app frame, menus, the Privacy Policy and Terms links stay.
- **Moderation:** the admin page can see an organisation's logo and remove it (and switch its branding off), recorded in the admin audit log. Add a Terms line saying hosts must have the right to use any name or logo they upload. Flag whether that is material; do not bump the version.
- **Data:** a migration (next free number, additive) adding to `orgs`:
  - `brand_name TEXT`;
  - `brand_logo_key TEXT`;
  - `brand_logo_version INTEGER`.

  Add one column to `events`, `use_branding INTEGER NOT NULL DEFAULT 1`. The logo is deleted from R2 when it is removed, replaced or the organisation is deleted, and the deletion is tested.
- **Public budget:** the check-in page shows the logo with a plain `<img>` and the display name as text. Keep its growth under 400 B gzip. The upload and preview are host-site code only.
- **Security bar:** each line gets a test, including negatives:
  - SVG refused;
  - a PNG renamed `.jpg` with HTML inside refused by magic bytes;
  - over 1 MB refused;
  - a member without the role gets 403;
  - another organisation's logo can't be replaced (404);
  - a signed-out user gets 401;
  - the display name is shown as text, never HTML (try `<script>`);
  - a free event never shows branding, even with `use_branding` 1.

## Tasks
- [x] F66.1 Migration, the branding settings routes (name, logo upload and remove, roles), R2 storage and serving, deletion; tests for the security bar. ([[D061 Host branding shows on paid events only, keeps a Check in with Lanyard line, and takes PNG, JPEG or WebP logos up to 1 MB]]; `worker/branding.js`, migration 0044, `test/host-branding.mjs`; `events.is_paid` is now set by the credit, it was never set before)
- [ ] F66.2 The Branding section on the host account page with the preview; the per-event switch in Advanced, paid events only; tests.
- [ ] F66.3 Branding drawn on Present, the check-in page, the event hub and print, with the "Check in with Lanyard" line; admin view and remove, audit-logged; Terms line; vault notes ([[Data Model]], [[API Surface]], [[Security]], [[Screens and Routes]]); browser check on a paid and a free event at 375 and 1280 px, light, dark and midnight.

## Acceptance checks
- [ ] An organisation admin uploads a PNG logo and sets the name "Acme Careers"; on a paid event the Present page shows the logo in place of `lanyard.` and "Check in with Lanyard" at the foot (browser).
- [ ] The same organisation's free event shows the Lanyard mark, and the switch is disabled with "Branding shows on paid events" (test and browser).
- [ ] An SVG, a 2 MB PNG and a file with a PNG name but HTML inside are each refused with 400 (test).
- [ ] A team member without the admin role gets 403 on the branding routes; another organisation's host gets 404 (test).
- [ ] A display name `<script>alert(1)</script>` shows as text on every surface (test).
- [ ] Removing the logo deletes the R2 object; deleting the organisation deletes it too (test with the R2 stand-in).
- [ ] The admin removes a logo, and the audit log records it (test).
- [ ] `npm test` passes; public pages within budget.

> [!question] Which credits make an event "paid"? Until now nothing set `events.is_paid` (every event was 0). F66.1 sets it when an event spends a credit, which is every event except a society's free one of the week, so starter and promo credits count as well as bought ones (the owner's words: "paid for with a credit"). Events made before F66 stay free. If branding should be for bought credits only, say so: it is one condition in `insertEvent` (`worker/hosts.js`).

## Log
-

Related: [[F65 Event themes and an advanced look]] · [[F27 Lanyard Plus and billing]] · back to [[00 Master To-Do]]
