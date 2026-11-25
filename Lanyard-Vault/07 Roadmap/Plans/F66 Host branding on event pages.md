---
tags: [roadmap, feature, host, design, security]
id: F66
priority: P2
phase: 11
size: L
status: Done
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
- [x] F66.2 The Branding section on the host account page with the preview; the per-event switch in Advanced, paid events only; tests. (`src/views/HostAccount.vue`, `src/lib/logo.js` shrinks a picture over 1024 px to a PNG in the browser, `EventLook.vue` switch with `brand` and `paid`; Create knows paid from the free-week rule, Details from `/api/host/me`)
- [x] F66.3 Branding drawn on Present, the check-in page, the event hub and print, with the "Check in with Lanyard" line; admin view and remove, audit-logged; Terms line; vault notes ([[Data Model]], [[API Surface]], [[Security]], [[Screens and Routes]]); browser check on a paid and a free event at 375 and 1280 px, light, dark and midnight. (EventPage, EventDetail, HostPresent, HostPrint; the logo on a light plate; previews beside the forms use `previewBrand`; admin Company branding section; Terms section 15 line; browser: a paid and a free event on the local database, see the Log)

## Acceptance checks
- [x] An organisation admin uploads a PNG logo and sets the name "Acme Careers"; on a paid event the Present page shows the logo in place of `lanyard.` and "Check in with Lanyard" at the foot (browser).
- [x] The same organisation's free event shows the Lanyard mark, and the switch is disabled with "Branding shows on paid events" (test and browser).
- [x] An SVG, a 2 MB PNG and a file with a PNG name but HTML inside are each refused with 400 (test).
- [x] A team member without the admin role gets 403 on the branding routes; another organisation's host gets 404 (test).
- [x] A display name `<script>alert(1)</script>` shows as text on every surface (test).
- [x] Removing the logo deletes the R2 object; deleting the organisation deletes it too (test with the R2 stand-in).
- [x] The admin removes a logo, and the audit log records it (test).
- [x] `npm test` passes; public pages within budget.

> [!note] Owner decision 2026-11-25: **bought credits only**. An event is paid, and can show company branding, only when the credit it spends was bought (`granted_by = 'polar'`); a starter or promo credit spends but is not paid, and a society's free event of the week is not paid.

## Log
- 2026-11-25 (Claude, owner decision): bought credits only. `insertEvent` now works out `is_paid` from the credit it spends (the one that runs out first, then by id, the same order as the UPDATE that spends it), 1 only when that credit's `granted_by` is `polar`. `GET /api/host/me` `credits.nextBought` tells Create whether the next event can carry branding. `test/host-branding.mjs` gives its test hosts bought credits and adds starter, promo and mixed-credit checks (130 checks).
- 2026-11-25 (Claude subagent). Company branding: `worker/branding.js` (settings routes, `/media/logo/...`, `eventBrand`), migration 0044 (`orgs.brand_name`, `brand_logo_key`, `brand_logo_version`, and `brand_off` for the admin's switch; `events.use_branding`; a `media_deletes` table with two triggers so a replaced, removed or deleted organisation's logo is always deleted from R2), Branding on Account and team with a preview, the switch under Advanced, the name and logo on the check-in page, the hub, Present and the poster with "Check in with Lanyard", an admin section, and a Host Terms line (section 15). [[D061 Host branding shows on paid events only, keeps a Check in with Lanyard line, and takes PNG, JPEG or WebP logos up to 1 MB]].
- Found: `events.is_paid` was never set (every event was 0). It is now set in `insertEvent`'s own `INSERT` when the event spends a credit (any credit; not a society's free event of the week). Events made before F66 stay free. See the question above.
- The security bar, each in `test/host-branding.mjs` (126 checks): types (SVG, SVG or GIF or HTML declared as PNG, PNG bytes declared as JPEG, WebP, SVG or text/html, a URL: each 400; just over 1 MB and 2 MB: 400; over 1024 px: 400; the stored PNG has its tEXt chunk with HTML removed); no re-encode in the Worker (no decoder there): the browser draws a picture over 1024 px smaller as a PNG, the Worker checks size and strips metadata; serving (real type, nosniff, sandbox CSP, no Content-Disposition, `public, max-age=31536000, immutable` with `?v=`, 404 before it is public, private to the organisation's hosts, 404 for another organisation's host, a guessed key, another extension and a traversal); roles (owner only; staff 403 on all three writes; another organisation 404 on all four; signed out 401; an attendee cookie 401 on the host site, 403 on the main site); the name (control, zero-width, direction characters removed, 61 refused, `<script>alert(1)</script>` and `"><img src=x onerror=alert(1)>` rendered as text on the check-in page by the real component, the other surfaces by source: text and attributes only, no v-html); paid only (a society's free event with use_branding 1 and a logo: no brand on `/api/e/:code`, the hub or `/live`, and the rendered page is the Lanyard look); the line (a test reads each of the four surfaces); deletion (replace, remove, an R2 failure then the purge, and the host reset's wipe then the purge, against the R2 stand-in); admin (list, view, remove, switch off and on, both in `admin_audit`; the host cannot undo the switch); isolation (`/host/me`, `/live`, the host and attendee downloads and the events list).
- Browser (local database, servers on 8787 and 5173, `MAIL_LOG`, throwaway vars, no `.dev.vars`): as F68 Test Co's owner, set "Acme Careers" and added a generated PNG (picked through the real file input), checked the Branding section and its preview (1280 dark, 375 light); created "Acme Careers Evening" through Create, which spent a real local credit and came out paid, with the switch on in step 2 and the logo in the preview; Present showed the logo in place of `lanyard.` and "Check in with Lanyard" at the foot (1280 light and dark, 375 light); the poster showed the logo at the top and the line at the foot; the check-in page (1280 light, 375 Dark and Midnight) and, after checking in, the hub (375 Midnight, 1280 light) showed the name, the logo and the line; the free event "Coming up Friday" (made before F66) showed `lanyard.` on Present, no brand on its check-in data or hub, and its Details switch disabled with "Branding shows on paid events"; the admin page listed the organisation and showed the logo. Fixed on the way: the logos are on a light plate so a dark logo reads in the dark themes, and keep their shape.
- Not checked by eye: every surface in every theme and width (sampled as above), the poster on paper, a logo over 1024 px through the browser's shrink (unit-tested only), the admin's Remove and Switch off buttons in the browser (tested through the Worker), screen readers.
- Check-in page JS: EventPage chunk 3,680 to 3,774 B gzip (+94), the page's first load 49,067 to 49,155 B (+88); public pages (built from a clean copy, before to after, B gzip): Landing 44,326 to 44,330, PublicCard 47,680 to 47,681, Hosts 42,680 to 42,680, Privacy 50,296 to 50,295, Terms 46,804 to 46,889, Redeem 46,037 to 46,036, SignIn 47,145 to 47,147, PrivacyRequest 49,867 to 49,871. Owner steps: `npm run db:remote` (0044, additive) before `npm run deploy`; decide which credits count as paid; decide whether the Terms line needs a version bump (my view: not material, as it only binds a host who uses the new feature, but it adds an obligation, so it is the owner's call); upload your own test logo on a paid test event and look at Present, the check-in page and print on a phone.

Related: [[F65 Event themes and an advanced look]] · [[F27 Lanyard Plus and billing]] · back to [[00 Master To-Do]]
