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
- [x] F38.6 Buttons that send something: audit every one, give each a short working label and a guard against a second press, and add the pattern guard to `test/loading.mjs`.
- [x] F38.7 Look at every page slowed down (375 and 1280 px, light and dark, reduced motion), tick the acceptance checks, vault notes and D043.

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

Buttons that send something are surveyed in F38.6. Left as text on purpose: `CopiedFacts` ("Reading its details…", one line inside the create-event form) and the unrouted `Connect.vue`.

## Acceptance checks
- [ ] Every page that waits on the API shows a skeleton or a clear waiting state (checked with the network throttled in a browser, at 375 and 1280 px, light and dark).
  - **Partly verified, so not ticked.** Run in the Browser pane with every request except `/api/me` held for 20 to 30 seconds (a `fetch` override, not the network panel's throttle; page chunks are not slowed). Looked at as screenshots: People (375 light, 1280 dark, with the slow note and Try again working), Events, an event, the public card (375 light, 1280 dark, with the note), the check-in page (375 light), the host live page, Present (with the note). Checked as DOM at 375 and 1280, light and dark, for the card, check-in page, Redeem, People, Events, an event and Feedback (one `aria-busy` region, one polite status line, blocks present, no sideways scroll), and at 1280 and 375 for the host Account, Billing, live, Present and Print pages, and the host dashboard at 375 (the dashboard's skeleton was seen at 1280 earlier). **Not looked at slowed down:** a Settings page's code loading, the welcome steps, the Room and Album tabs, the follow-up box, the host attendee list, drops and redeem box, Admin, and the QR placeholder while the library loads (its rule was checked in computed style only). Their markup and Try again wiring are guarded in `test/loading.mjs`.
- [x] No button that sends something can be pressed twice while it waits.
  - Verified by a scan in `test/loading.mjs` over every `.vue` file: all 81 buttons and forms whose handler sends something (a POST, PUT or DELETE, or a host or admin call) are disabled while they wait, and each handler ignores a second call (wrapped in `once()`, or a first-line guard, or its busy flag set before its first `await`). About 35 handlers and buttons lacked one or the other and were fixed (F38.6). Not pressed twice by hand in a browser.
- [x] Motion stops with reduced motion on.
  - The sweep and the QR square's pulse are the only repeating animations; both are switched off in one `@media (prefers-reduced-motion: reduce)` block (guarded in `test/loading.mjs`). In the browser I applied that block's rules to the page and read the computed style: the sweep's `animation-name` and `display` become `none`. The 8 second note is a one-off appearance (a visibility change), not motion, so it stays. I did not set the operating system's reduced-motion option.
- [x] No public page gets heavier than its budget ([[F28 Public-page JS budget]]).
  - First-load gzip bytes, before (HEAD 07c94e6, a clean checkout) and after (HEAD c91528f, F38.6, a clean checkout; the limit is 51,200 and builds move by up to 15 B): Landing 45,174 to 45,225, **PublicCard 51,043 to 51,087** (113 B of room), Hosts 43,620 to 43,674, Privacy 50,344 to 50,397, Terms 47,871 to 47,925, Redeem 46,948 to 47,086, SignIn 48,227 to 48,280, PrivacyRequest 50,587 to 50,639. About 45 B of each is the new `Waiting` chunk's name in the entry's preload list, which every page pays; the card's own skeleton markup was paid for by moving four inline styles into `main.css`. The numbers at the last commit are in the Log.

## Log
- 2026-11-17 (Claude subagent): All seven tasks built and committed (78c7db9 F38.1 survey, 7bf3d07 F38.2 style and `Waiting`, 533471b F38.3 public pages, fb31321 F38.4 signed-in app, 75f09ad F38.5 host site and Admin, c91528f F38.6 buttons, 4f1de62 F38.7 notes). **Left In progress, not Done:** three of the four acceptance checks are ticked; the first ("every page that waits ... throttled in a browser") is only partly verified, see its note. No migration, no Worker change, no new secret. [[D043 Waiting states are CSS on public pages and one component elsewhere]].
- **What changed.** Public pages wait with CSS and markup only: the card is one element drawn by CSS (strap, photo, name, headline, tags), the check-in page and Redeem are a few blocks; the "Taking longer than usual. Try again" link is in the markup and a CSS animation reveals it after 8 seconds (no timer; Try again reloads). Signed-in, host and admin pages use `src/components/Waiting.vue` (list, panel, form or line shapes; `aria-busy`; one polite status line that changes once when slow; the note and a Try again that calls the page's own `load`). Pages that showed nothing now show a skeleton: the host live page, a Settings page while its code loads, the Room and Album tabs (they said "No one else yet" while loading). The start-up splash has a CSS-only "Taking longer than usual. Reload the page" line, and the empty QR square is grey until the library draws it. Present and Print say "Opening the event…" with the same link. About 35 buttons that sent something had no guard; every one now disables, says what it is doing where it has its own flag, and ignores a second press (`useBusy().once` in `Waiting.vue`, or a local flag).
- **Budget (gzip bytes, clean checkouts, limit 51,200; builds move by up to 15 B).** Before (07c94e6) to after (4f1de62): Landing 45,174 to 45,235, **PublicCard 51,043 to 51,097 (103 B of room)**, Hosts 43,620 to 43,677, Privacy 50,344 to 50,402, Terms 47,871 to 47,930, Redeem 46,948 to 47,094, SignIn 48,227 to 48,284, PrivacyRequest 50,587 to 50,650. About 45 B on every page is the new `Waiting` chunk's file name in the entry's preload list (the entry went 42,026 to 42,07x); the card page gave back about 90 B by moving four inline styles to `main.css` and deleting an unused function; Redeem's +146 is its skeleton markup. `useBusy` was put inside `Waiting.vue` after a separate file cost another 25 B on every page.
- **Tests.** New `test/loading.mjs` (129 checks), wired before `test/budget.mjs`: the skeleton is tokens only and its sweep stops under reduced motion, one `aria-busy` region and one status line per waiting place, the 8 second note, public pages import nothing new, `Waiting` is imported by no shared entry file, every page's Try again calls a function that exists, and a scan of all `.vue` files that every button or form that sends something is disabled while it waits with a handler that ignores a second call (81 checked). No existing test or guard was changed. `npm test` in the tree still fails only in `test/ai.mjs` (the owner's uncommitted AI work); in a clean worktree at 4f1de62 it exits 0.
- **Owner files touched:** only `src/views/EventDetail.vue`, and only my lines: the `Waiting` import, `roomWait` and `albumWait` flags set and cleared around the room and album requests, the page's Loading line, and the Room and Album tabs. I copied the file first, edited it, built a patch of just those lines with `git diff --no-index` on line-ending-normalised copies, applied it with `git apply --cached`, and checked `git diff --cached src/views/EventDetail.vue` showed only my lines and `git diff src/views/EventDetail.vue` still shows only the owner's "leave this event" function, its button and nothing else. Every other owner file was left alone. (Their Leave button already disabled itself and said "Leaving…".)
- **Decisions I made without the owner:** a public page's Try again is a plain reload link, not a retry in place (no script); the slow note lives with the page's blocks rather than in a toast; small optional panels (My card's follow-up and feedback panels, AI allowances, lists of who checked in, plan prices) get no skeleton because they may stay empty; the unrouted `Connect.vue` and the one-line `CopiedFacts` status were left as text; `CardConnection.vue` (loaded lazily by a public card) got local busy flags instead of `Waiting` so the public card's lazy chunk imports nothing new; the sweep is one band across the whole region (one animation), not a shimmer on each block.

### Owner steps
- Review the F38 commits, `git push`, `npm run deploy`. No migration, no secret.
- Look at the pages I could not see slowed down (Chrome devtools, Network, "Slow 3G", at 375 px and 1280 px, light and dark): a Settings page, the welcome steps, an event's Room and Album tabs, the follow-up box, a host event's attendee list, drops and Feedback tab, the host Redeem box and Admin. Then tick the first acceptance check, set `status: Done`, and replace the "in progress" text in the Master To-Do with the done line (last commit 4f1de62 unless you change more).
- Check the real public card and check-in pages once on a slow phone connection: the skeleton, then "Taking longer than usual. Try again" after 8 seconds if the request is held.

> [!question] The public pages' Try again reloads the page. Is that acceptable, or should the card retry in place? In place needs script on the card page, which has 103 B of room under the budget (it cost about 55 B to add the skeleton and the note).

> [!question] The start-up splash (`/api/me` slow) now shows "Taking longer than usual. Reload the page to try again." as text only, with no button, because a button would need markup in `App.vue`, which every public page loads. Say if you want the button and accept about 40 B on every public page.

Related: [[Design System]], [[F39 Informative error messages]] · back to [[00 Master To-Do]]
