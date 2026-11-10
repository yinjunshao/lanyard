---
tags: [product, frontend]
---
# Screens and Routes

From `src/router/index.js`. All views are code-split so public pages stay light (target under 50 KB JS).

## Public
| Route | View |
| --- | --- |
| `/` | Landing. Signed-in people (browser hint `lanyard-signed-in`) are sent to `/app`; `/?about=1` shows it anyway (Settings, "About Lanyard"). The `lanyard.` logo on other pages goes to `/app` when signed in |
| `/c/:cardId` | Public card (what a scan opens; Connect) |
| `/e/:code` | Event join / check-in |
| `/e/:code/feedback` | Feedback survey |
| `/hosts` | Host pitch + early pricing |
| `/terms`, `/privacy` | Legal |
| `/claim`, `/signin` | Account claim and sign-in |

## Attendee app (`/app`, bottom tabs: My Card, Scan, People)
`/app`, `/app/cards`, `/app/profile`, `/app/scan`, `/app/people`, `/app/people/:id`, `/app/events`, `/app/events/:id`, `/app/settings`, `/app/feedback/:eventId`

**Settings** (F09) is a list of categories, each its own page: `/app/settings/account`, `/security` (Sign-in and devices), `/notifications` (Email and notifications), `/privacy` (Privacy and data), `/plan`, `/appearance` (Appearance and app), `/help` (Help and legal). Log out sits under the list. Phones show the list, then one page with a "‹ Settings" back link; from 900 px the list stays on the left. It is one route, `/app/settings/:page?`; `Settings.vue` loads the page. Old `/app/settings#plus`, `#signin` and `#install` links redirect to `/plan`, `/security` and `/appearance`. Emails about sign-in link to `/app/settings/security`.

## Host portal (its own site, F10)
Served at the root of `host.lanyd.fyi` (locally `http://host.localhost:5173`), from `src/router/routes.host.js`:
`/` (sign in by email code, then details, Host Terms and own name or organisation, then the dashboard), `/signin` (same page), `/events/:id` (live, details, feedback, report), `/billing`, `/account` (sign-in email, devices, organisation, team, integrations), `/signout` (signs out and reloads to `/`). Old `/host/...` addresses on the host site redirect to the root; anything else goes to the main site.

On the main site, `/host` and `/host/...` go to the same page on the host site (the router, and a 301 from the Worker). `/hosts` (the pitch page) stays on the main site and links to the portal. `/admin` stays on the main site.

## Development only
`/ui-test` shows every picker for checking by eye. It is registered only under `vite dev`; a production build does not contain it.

## Two route tables
`src/router/index.js` picks `routes.attendee.js` or `routes.host.js` by `ON_HOST_SITE`, so each site's router names only its own pages. Host API calls live in `src/lib/hostapi.js`, which only host pages import. See [[D020 Host accounts separate from attendee accounts]].

Related: [[Features]], [[Codebase Map]], [[API Surface]]
