---
tags: [roadmap, feature, ui, settings]
id: F09
priority: P1
phase: 1
size: M
status: Done
needs: [F08]
---
# F09 Settings in category pages

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** M · **Needs:** [[F08 Custom pickers and dropdowns]] · **Unlocks:** [[F26 Mailing list from news address]], [[F27 Lanyard Plus and billing]], AI settings in [[F21 AI foundation]] · back to [[00 Master To-Do]]

## What the owner asked for
The settings page is too stacked. Signed-in devices, for example, should be a button that opens a modal with more detail rather than a long list. Or, like X/Twitter, put settings into categories on separate pages.

## Current state
`src/views/Settings.vue` is one long page: sign-in status, passkey, `EmailSetup`, `AuthenticatorSetup`, `DevicesList`, sign in on another device (code + QR), appearance, `InstallGuide`, plan / Plus waitlist, consent history, export, delete, logout and more. Other pages link to anchors: `/app/settings#plus` (`CardForm.vue`, `Cards.vue`, `MyCard.vue`), and `#signin` / `#install` may also be used. Grep for `settings#` before moving anything.

## New structure
`/app/settings` becomes a short list of categories. Each row has an icon, a title, a one-line summary of the current state ("Passkey and email saved", "Plus until 9 Nov 2027") and a chevron.

| Route | Title | Holds |
| --- | --- | --- |
| `/app/settings/account` | Account | Name shown on emails, verified email, change email, sign-in methods summary |
| `/app/settings/security` | Sign-in and devices | Passkeys, authenticator app, recovery key, "Sign in on another device", **Devices** button |
| `/app/settings/notifications` | Email and notifications | Event feedback emails, news and offers (see [[F26 Mailing list from news address]]) |
| `/app/settings/privacy` | Privacy and data | Profile visibility, AI search setting ([[F24 Do I know someone who]]), consent history, download my data, privacy request, **Delete account** (danger zone at the bottom) |
| `/app/settings/plan` | Plan | Free / Plus, manage subscription ([[F27 Lanyard Plus and billing]]), "Redeem a code" |
| `/app/settings/appearance` | Appearance and app | Light / dark / auto, install the app |
| `/app/settings/help` | Help and legal | Contact, Terms, Privacy Policy, "About Lanyard" (`/?about=1`, see [[F02 Logo goes to My card when signed in]]) |
| bottom of the list | Log out | Separate, plain, with the "not saved yet" warning kept |

- **Devices:** a button "Signed-in devices (3)" opens a `UiSheet` (from F08). Each device row shows device and browser (from `describeDevice()`), when it was first signed in, and "This device" on the current one. Tapping a row shows details and "Sign out this device". The sheet footer has "Sign out all other devices". The API has `GET /api/auth/sessions` and `POST /api/auth/signout-others`. Add `DELETE /api/auth/sessions/:id`, which must only delete the caller's own sessions. The client needs a session id handle that isn't the hash: return an opaque short id per row.
- **Wide screens (≥ 900 px):** two columns. The category list stays on the left and the page shows on the right, like X. **Phones:** list → page, with "‹ Settings" back at the top.
- **Old anchors:** the router maps `/app/settings#plus` → `/app/settings/plan`, `#signin` → `/security`, `#install` → `/appearance`. Update the links in code too.

## Checklist: what the old `Settings.vue` did (2026-11-10)
Written before the split. Each line gets ticked, with its new place, once it works there.
- [x] Sign-in status line ("Passkey saved", "Email saved"...) and the "Save my card" / "Add more" link to `/claim` (Sign-in and devices; seen: Recovery key saved, Add more)
- [x] "Your card only lives in this browser until you save it" hint (Sign-in and devices; moved unchanged, not seen: the test account was already saved)
- [x] Recovery email shown (Account, for an unconfirmed address; a confirmed one shows in the email panel)
- [x] Add a passkey (Sign-in and devices; button seen; registration not run, it needs a real authenticator)
- [x] Add and confirm an email (send code, confirm) (Account; form seen; the code was not sent or entered)
- [x] Switch on or off the feedback reminder emails (Email and notifications; switched in a browser and read back from `/api/me`)
- [x] Switch on or off news and offers (Email and notifications; same)
- [x] Authenticator app: set up, copy key, account ID, turn off (Sign-in and devices; set-up showed the QR and key and Cancel worked; confirming a code and turning off were not run)
- [x] Signed-in devices, and sign out other devices (Sign-in and devices; now the sheet, F09.3; checked in a browser)
- [x] Sign in on another device (code, QR, countdown) (Sign-in and devices; code, QR canvas and countdown appeared)
- [x] Appearance: Auto, Light, Dark (Appearance and app; seen)
- [x] Install guide (Appearance and app; seen)
- [x] Plan label, Lanyard Plus details, "Tell me when Plus opens", "Have a code? Redeem it" (Plan; seen with the Free plan; the waitlist button was not pressed)
- [x] Host portal link (Account; seen)
- [x] Download my data (Privacy and data; link target checked, not downloaded)
- [x] Get help (mailto link) (Help and legal; seen)
- [x] About Lanyard (`/?about=1`) (Help and legal; seen, guarded by `test/homepath.mjs`)
- [x] Edit profile (Account; seen)
- [x] Log out of this device (with the "not saved yet" warning) (bottom of the list; logged out in a browser: landed on `/`, `/api/me` empty, hint cleared; the unsaved-card warning is old code, not triggered)
- [x] Consent history and the privacy request link (Privacy and data; opened, rows listed)
- [x] Delete account (Privacy and data, danger zone at the bottom; shown, not run)
- [x] Terms and Privacy policy links, and the selfie retention line (Help and legal; the 12-month selfie line is in Privacy and data)
- [x] Error line under the page (each page keeps its own error line)
- [x] Anchors `#signin`, `#install`, `#plus` (all three checked in a browser and in `test/settings.mjs`)
- [x] Links from other pages and from emails (`CardForm`, `Cards`, `MyCard`, `Privacy`, `PrivacyRequest`, `worker/alerts.js`, `worker/mail.js`) (changed, guarded by `test/settings.mjs`)

## Tasks
- [x] F09.1 Settings index and routes, and a shared `SettingsPage` shell (title and back link).
  - The shell is in `Settings.vue` itself (back link and title, from each route's `meta.title`), not a separate component: a component with a `<slot>` would grow the Vue runtime chunk every public page loads (D018). The old page is kept for now as `settings/SettingsAll.vue` at `/app/settings/all` so nothing is unreachable between commits; F09.2 removes it.
- [x] F09.2 Move each section into its page without changing behaviour (one commit per page is fine).
  - One commit for all seven pages. Pages are in `src/views/settings/`. `EmailSetup` was split: the add-and-confirm form stays (Account), the two switches moved to the new `EmailPreferences` (Email and notifications). "Sign in on another device" became `SignInOnAnotherDevice`. The signed-in devices list is still `DevicesList` until F09.3. `test/homepath.mjs` now reads `SettingsHelp.vue` for the About link.
- [x] F09.3 Devices sheet, plus `DELETE /api/auth/sessions/:id` with a security test (you can't delete another user's session).
  - `GET /api/auth/sessions` now returns an opaque `id` (first 16 hex characters of a SHA-256 of the stored session id with a fixed prefix; it cannot be turned back into the cookie or the stored id) and `until`. `DELETE /api/auth/sessions/:id` finds the handle among the caller's own sessions only; someone else's, a made-up one and a malformed one all give 404, and the caller's own current session gives 400 (use Log out). 9 checks under "Signed-in devices" in `test/security.mjs`. The host account page still uses the old `DevicesList`.
- [x] F09.4 Anchor redirects and link updates.
  - `src/router/settingsRedirect.js` maps `#plus`, `#signin`, `#install` (query kept) and the router applies it first in `beforeEach`. Links changed: `CardForm`, `Cards`, `MyCard` (Plan), `Privacy` and `PrivacyRequest` (Privacy and data), and the sign-in alert and welcome emails (`worker/alerts.js`, `worker/mail.js`, now Sign-in and devices). Old emails that point at `/app/settings` still land on the list. New `test/settings.mjs` (30 checks, in `npm test`).
- [x] F09.5 Two-column layout on wide screens.
  - From 900 px the list is 300 px on the left and the page on the right (the app column widens to 960 px through `:has()`, so `App.vue` is unchanged); the current category has a strap mark and `aria-current`. On the list with nothing chosen the right side says "Choose a setting from the list.".
  - Changed after F09.1 and F09.4, found when measuring the public-page JS: registering the seven pages as nested routes, plus the redirect, grew the router file (part of the entry chunk every public page loads) by about 0.4 KB gzip. Now Settings is one route, `/app/settings/:page?`; `Settings.vue` holds the page table, loads the page, applies the old-anchor redirect and shows the list for an unknown page. See [[D019 Settings pages load from the layout, not the router]]. `test/settings.mjs` was changed to match and guards that the router names no settings page.

## Acceptance checks
- [x] Every control that was on the old page is reachable in at most two taps from Settings. (Each category is one tap from the list and every control sits on its page or, for devices, behind one button on it. Opening a single device inside the sheet is a third tap, by design. Checked in a browser against the checklist above.)
- [x] Old `#plus` / `#signin` / `#install` links land on the right page. (Opened each as a full page load in a browser and landed on plan, security, appearance; `test/settings.mjs` checks the mapping and that no link in `src/` or `worker/` still uses an anchor.)
- [x] Signing out one device from the sheet ends that session only (security test). (`test/security.mjs`, "Signed-in devices": the other device is signed out, this one and another person's devices stay in, someone else's handle gives 404. Also done in a browser with extra local sessions: only the chosen row left `sessions`.)
- [x] F09 adds no JS to the first load of public pages. The 50 KB budget itself is not met and is not part of F09: those pages were already over it and [[F28 Public-page JS budget]] owns the fix. (Measured gzip, entry plus static imports plus the page's own chunk, from `dist/`: Landing 65,613 B before, 65,446 B after; public card 59,642 B before, 59,492 B after. A first version that registered the pages in the router grew both by about 0.4 KB; see F09.5 and D019.)
- [x] The index page fits on one phone screen without scrolling past the last category. (Measured in a browser: at 375 x 667 all seven categories and Log out end at 592 px, above the tab bar at 604 px. When the app's Add your email or passkey nudge shows above the heading the list is pushed down and scrolls; that nudge belongs to the app shell.)

## Log
- 2026-11-10 (Claude subagent): Settings is now a list of seven categories (Account, Sign-in and devices, Email and notifications, Privacy and data, Plan, Appearance and app, Help and legal) with Log out under it; each is its own page in `src/views/settings/`. Phones go list, then page with a "‹ Settings" back link; from 900 px the list stays on the left. Signed-in devices is a button that opens a `UiSheet`, backed by the new `DELETE /api/auth/sessions/:id` with an opaque id.
- Public-page JS: no growth. gzip bytes, entry + static imports + page chunk, `dist/` before and after: Landing 65,613 to 65,446; public card 59,642 to 59,492. Both still over 50 KB (F28). The router has one Settings route; `Settings.vue` loads the pages ([[D019 Settings pages load from the layout, not the router]]).
- Browser checks (local Wrangler and Vite, a throwaway local account, light and dark, 375 and 1280 px, 667 px high for the fit check; nothing sent to production): the list, every page, the devices sheet and popover, signing out one of two extra local sessions, both email switches, the three old anchors, an unknown address, back link, wide layout, Log out. Not run end to end: sending and entering the email code, passkey registration, confirming an authenticator code, joining the Plus waitlist, deleting an account, the download. Those components are unchanged apart from where they sit.
- Not done: "change email" for someone who already has a confirmed one (the old page had no such control). The host account page still uses the old `DevicesList`. Places left for later rows: `SettingsAccount` (F11), `SettingsPrivacy` (F21), `SettingsNotifications` (F26), `SettingsPlan` (F27).
- Guards changed: `test/homepath.mjs` now reads `src/views/settings/SettingsHelp.vue` for the About Lanyard link (was `Settings.vue`); same check, new place. New `test/settings.mjs` (30 checks); `test/security.mjs` gained 9 checks.

### Owner steps
- Review the F09 commits, `git push`, then `npm run deploy`. No migrations.
- Old emails that link to `/app/settings` still work (they show the list). New sign-in alert and welcome emails link to `/app/settings/security`.
- Try Settings on a real phone once, and sign out a second real device from the devices sheet.

Related: [[Auth and Sessions]], [[Screens and Routes]] · back to [[00 Master To-Do]]
