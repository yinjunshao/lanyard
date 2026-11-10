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
| `/claim`, `/signin`, `/host/signin` | Account claim and sign-in |

## Attendee app (`/app`, bottom tabs: My Card, Scan, People)
`/app`, `/app/cards`, `/app/profile`, `/app/scan`, `/app/people`, `/app/people/:id`, `/app/events`, `/app/events/:id`, `/app/settings`, `/app/feedback/:eventId`

## Host portal
`/host` (dashboard), `/host/events/:id` (live), `/host/billing`, `/host/account`, `/host/signout` (signs out and reloads to the host home), `/admin`

## Development only
`/ui-test` shows every picker for checking by eye. It is registered only under `vite dev`; a production build does not contain it.

## Host subdomain
On the `host.*` site only `/host/*` is served; everything else redirects to the main site. See [[D014 Separate host subdomain]].

Related: [[Features]], [[Codebase Map]], [[API Surface]]
