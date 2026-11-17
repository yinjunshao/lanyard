---
tags: [roadmap, feature, design]
id: F38
priority: P2
phase: 7
size: M
status: In progress
needs: []
---
# F38 Loading states

**Priority:** P2 · **Phase:** 7 Owner requests (2026-11-15) · **Size:** M · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-15)
"There should be loading states for content that hasn't loaded, so people don't feel like something isn't happening, where even though it is. This improves the aesthetical properties of the website."

## Plan
1. Survey every page and panel that waits on the API (attendee app, public card, event join, host site, admin) and list what each shows while waiting today: nothing, a word "Loading", or a spinner.
2. One small shared skeleton style (grey blocks the shape of the content, a gentle shimmer that stops under `prefers-reduced-motion`), in CSS only so no public page gets heavier. Follow [[Design System]] (paper and ink, no new colours).
3. Use it wherever content loads: the card, lists (People, Events, host events), event detail, host dashboard and live page, settings pages.
4. Buttons that send something show they are working (disabled, a short "Saving…" label) and cannot be pressed twice.
5. A slow request (over about 8 seconds) says so and offers Try again, rather than shimmering forever.
6. Screen readers: the waiting region has `aria-busy="true"` and one polite announcement, not one per block.

## Tasks
Each is one commit; `npm test` (checked in a clean worktree, because the owner's uncommitted AI work breaks `test/ai.mjs` in the tree) and `npm run build` pass before it. No migration and no Worker change.
- [x] F38.1 Survey every page and panel that waits (the table below) and turn the plan into these tasks.
- [x] F38.2 One skeleton style in `src/styles/main.css` (CSS only, the sweep stops under `prefers-reduced-motion`), `src/components/Waiting.vue` for signed-in and host pages (`aria-busy`, one polite message, the 8 second "taking longer than usual" note with Try again), a grey placeholder for the QR square, a slow note on the start-up splash, and the first `test/loading.mjs` guards.
- [x] F38.3 Public pages, CSS only and no new module: the card (`/c/:id`), Redeem, and the event join page (which may use `Waiting`; it is not one of the eight budget pages). Budget numbers before and after.
- [x] F38.4 Signed-in app: People, Events, an event (and its Room and Album tabs), Person, Feedback, Welcome, Settings pages, and the small text-only waits inside panels.
- [x] F38.5 Host site and Admin: dashboard, live page (and its Feedback and Report tabs), Account, Billing, attendee list, drops, Redeem, Present, Print, Admin.
- [ ] F38.6 Buttons that send something: audit every one, give each a short working label and a guard against a second press, and add the pattern guard to `test/loading.mjs`.
- [ ] F38.7 Look at every page slowed down (375 and 1280 px, light and dark, reduced motion), tick the acceptance checks, vault notes and D043.

## Survey (F38.1, 2026-11-17)
What each page or panel waits on, what a person sees today, and what they will see. "CSS only" means markup and classes in `main.css` and no new JavaScript (public pages are held to 51,200 B, [[F28 Public-page JS budget]]). "Waiting" is the new `Waiting.vue`, used only by signed-in, host and admin pages.

| Page or panel | Waits on | Shows today | Will show |
| --- | --- | --- | --- |
| Start-up of `/app` and the host site (`App.vue`) | `GET /api/me` (the router holds the first page until it answers) | The wordmark with a hidden "Loading" | The same, plus a line "Taking longer than usual. Reload the page." after 8 seconds (CSS only, no change to `App.vue`) |
| Public card `/c/:id` | `GET /api/c/:id` | The word "Loading…" | A card-shaped skeleton (strap, photo, name, headline) the height of a short card; after 8 seconds "Taking longer than usual" and a Try again link that reloads the page (CSS only) |
| Event join `/e/:code` | `GET /api/e/:code` | "Opening event…" | Waiting, a head and two panels |
| Redeem `/redeem/:code` | `GET /api/redeem/:code` | "Checking the code…" | A skeleton block, the same words for a screen reader, and the same slow note (CSS only) |
| Landing demo QR | The QR library (a second download after first paint) | An empty white square | A grey square with the sweep until the QR is drawn (CSS only; also on My card) |
| Sign in, Privacy request, Terms, Privacy, Hosts | Nothing on load; their buttons send | Buttons already say "Sending…" or "Checking…" and are disabled | No skeleton needed; buttons are checked in F38.6 |
| My card (`/app`) | `me` is loaded before the page shows; `GET /api/home` adds follow-up and feedback panels | The badge at once; extra panels appear later | No change (a skeleton would leave a gap when there is nothing to show); the QR placeholder above |
| Cards | `me` (already loaded) | The page at once; Create card is disabled but its label does not change | F38.6 label "Creating…" |
| People | `GET /api/connections` | "Loading…" | Waiting, list rows (an avatar and two lines at `.list-row` height) |
| Person (old link) | `GET /api/connections/:id`, then a redirect | "Opening…" | Waiting, lines |
| Events | `GET /api/my/events` | "Loading…" | Waiting, a panel and list rows |
| Event detail | `GET /api/my/events/:id`, then the room and album | "Loading…" and no title; the Room and Album tabs say "No one else yet" while they load | Waiting for the page; the Room and Album tabs show rows until they answer |
| Feedback form | `GET /api/e/:id/feedback` | "Loading…" | Waiting, form blocks |
| Welcome steps | `ensureMe` (cached by the router) | "Loading…" | Waiting, lines |
| A Settings page | The page's chunk (dynamic `import()`) | Nothing under the title | Waiting, panels, with Try again that loads the chunk again |
| Settings small panels: AI allowances, AI search, lists of who checked in, devices, consents, plan prices | Their own small request | Nothing until they arrive (the AI search tick is disabled until it is known) | No change: each is an extra that may stay empty, so a skeleton would promise content that may not come |
| Scan | The camera | A dark video box | No change (the browser asks for the camera; nothing to skeleton) |
| Follow-up composer, Feedback summary | Their drafts and settings | "Loading…" | Waiting, lines |
| Host dashboard `/` | `GET /api/host/me` and the events | "Loading…" | Waiting, panels |
| Host event, Live tab (`/events/:id`) | `GET /api/host/events/:id/live` | Nothing at all (no title) | Waiting, a head, stat tiles and a panel |
| Host event, Feedback and Report tabs | Their own requests | "Loading…", "Building report…" | Waiting, lines (a report may take a while, so the slow note matters) |
| Host Account, Billing | `hostMe`, `hostBilling` | "Loading…" | Waiting, panels |
| Host attendee list, drops, redeem box | Their own requests | "Loading…", "Checking the code…" | Waiting, lines |
| Present, Print | `GET /api/host/events/:id/live` | Nothing | A short "Opening the event…" with the slow note (these pages have their own colours) |
| Admin | The queue and lists | Empty sections that say 0 | Waiting while the queue has not arrived |

Buttons that send something are surveyed in F38.6.

## Acceptance checks
- [ ] Every page that waits on the API shows a skeleton or a clear waiting state (checked with the network throttled in a browser, at 375 and 1280 px, light and dark).
- [ ] No button that sends something can be pressed twice while it waits.
- [ ] Motion stops with reduced motion on.
- [ ] No public page gets heavier than its budget ([[F28 Public-page JS budget]]).

## Log
-

Related: [[Design System]], [[F39 Informative error messages]] · back to [[00 Master To-Do]]
