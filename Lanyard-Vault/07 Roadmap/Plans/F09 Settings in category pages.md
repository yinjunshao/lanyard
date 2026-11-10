---
tags: [roadmap, feature, ui, settings]
id: F09
priority: P1
phase: 1
size: M
status: Not started
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

## Tasks
- [ ] F09.1 Settings index and routes, and a shared `SettingsPage` shell (title and back link).
- [ ] F09.2 Move each section into its page without changing behaviour (one commit per page is fine).
- [ ] F09.3 Devices sheet, plus `DELETE /api/auth/sessions/:id` with a security test (you can't delete another user's session).
- [ ] F09.4 Anchor redirects and link updates.
- [ ] F09.5 Two-column layout on wide screens.

## Acceptance checks
- [ ] Every control that was on the old page is reachable in at most two taps from Settings.
- [ ] Old `#plus` / `#signin` / `#install` links land on the right page.
- [ ] Signing out one device from the sheet ends that session only (security test).
- [ ] The index page fits on one phone screen without scrolling past the last category.

## Log
-

Related: [[Auth and Sessions]], [[Screens and Routes]] · back to [[00 Master To-Do]]
