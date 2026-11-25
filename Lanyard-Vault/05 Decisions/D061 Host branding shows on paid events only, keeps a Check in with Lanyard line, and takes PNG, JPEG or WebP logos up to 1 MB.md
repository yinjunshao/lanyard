---
tags: [decision, host, design, security]
status: Accepted
date: 2026-11-25
---
# D061 Host branding shows on paid events only, keeps a Check in with Lanyard line, and takes PNG, JPEG or WebP logos up to 1 MB

**Status:** Accepted  ·  **Date:** 2026-11-25  ·  Builds on [[D060 Event themes are one shared list drawn by CSS, and a chosen text colour must read]]

## Context
The owner asked that a host organisation can put its own name or logo on its event pages in place of the Lanyard wordmark ([[F66 Host branding on event pages]]). The owner chose (2026-11-24) that a small "Check in with Lanyard" line stays, and that branding is for paid events only. A logo is a file a host uploads and the public then sees, so the upload, who may change it and where it is shown matter as much as the look.

## Decision
- **Settings, once per organisation.** A display name (up to 60 characters, cleaned of control, zero-width and direction-changing characters with F31's `cleanWhy`; empty means the organisation's name) and a logo, in `orgs.brand_name`, `orgs.brand_logo_key` and `orgs.brand_logo_version` (migration 0044). Only the organisation's **owner** changes them: it is the only admin-level role an organisation has (staff and sponsor viewers read them, and get 403 on a change). The routes are `/api/host/orgs/:id/brand`, resolved with `findOrg`, so another organisation's host gets 404.
- **Paid events only.** `events.is_paid` was never set before; it is now set in the same `INSERT` by the credit rule: an event is paid only when the credit it spends was bought (`granted_by = 'polar'`, the owner's decision of 2026-11-25); a starter or promo credit spends but is not paid, and a society's free event of the week is not paid. The credit spent is the one that runs out first, then by id, in the same order as the statement that spends it, and `GET /api/host/me` says (`credits.nextBought`) whether the next event will be paid. Events made before this stay free. Branding shows only when the event is paid, its "Use our company branding" switch (`events.use_branding`, on by default) is on, the organisation has a name or a logo, and a Lanyard admin has not switched it off (`orgs.brand_off`). Otherwise the public responses carry no brand fields at all.
- **The logo is PNG, JPEG or WebP, checked by its bytes**, never by its name or declared type (an SVG, a GIF, HTML or `<svg` declared as PNG, and PNG bytes declared as anything else are each 400). At most 1 MB (400 over it) and 1024 px on its longest side, read from the file's header (400 over it). The host page shrinks a bigger picture to 1024 px in the browser before it is sent; the Worker does not re-encode (a Worker has no image decoder) but removes text and metadata chunks, as for face photos. It is stored in R2 under `logo/<org id>/<random>.<ext>`.
- **Logos are public by nature once shown.** `/media/logo/...` serves a logo with a long cache (`public, max-age=31536000, immutable`, the version in the address) only while it is the current logo of an organisation that shows it on at least one paid event with branding on; to the organisation's own hosts on the host site privately; to anyone else, and for a replaced, removed or guessed key, the same 404. It is always its real image type, `nosniff`, a sandbox CSP and no `Content-Disposition`.
- **Nothing is left in R2.** Two triggers queue the old key in `media_deletes` whenever a logo is replaced or removed and whenever an organisation is deleted (the host reset, or any later route); the routes delete it at once and the daily clean-up deletes anything left.
- **"Check in with Lanyard"** is a fixed line at the foot of every branded surface (the check-in page, the event hub, Present and the poster), with no setting to turn it off.
- **Moderation.** The admin page lists organisations with branding, shows the logo, removes it and switches branding off and on; each request is in `admin_audit`. A switched-off organisation's host cannot set a name or upload, but can still remove the logo.

## Consequences
A host on a paid event can replace Lanyard's mark with their own; a free event and every event made before this look as they did. The Terms say a host must have the right to use any name or logo they upload. The logo costs the check-in page a plain `<img>` and a line of text, no script.

**Evidence:** `worker/branding.js`, `worker/media.js` (`readImage`, `imageSize`), `worker/hosts.js` (`insertEvent`), `migrations/0044_host_branding.sql`, `test/host-branding.mjs`

Related: [[F66 Host branding on event pages]], [[F65 Event themes and an advanced look]] · back to [[Decision Log]]
