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

## Attendee app (`/app`, bottom tabs: My Card, Scan, People, Events)
`/app`, `/app/cards`, `/app/profile`, `/app/scan`, `/app/people`, `/app/people/:id`, `/app/events`, `/app/events/:id`, `/app/settings`, `/app/feedback/:eventId`

**Card page, In common** (F16, `/c/:cardId`): under the name and headline, one line with a small "In common" label: the first two facts joined by " · ", the third folds to "+1" under 600 px. Then Come to me for, About, Projects, Find online; a shared selfie and its prompts now follow the links. The People list rows do not show it.

**Draft a follow-up** (F22, a bottom sheet on `/c/:cardId` once you are connected, loaded only when the button is pressed): choices as chips in groups (Send it on, Tone, Goal, Talk about, You can offer), the note switch, "Anything to add?" with a counter, then Draft it. The result is a notice ("A draft written by AI..." or "Here's a starting point. ..."), an optional Subject, an editable Message, Copy and Open in, Try again and Change the choices, "2 drafts left today", and Mark as followed up. No new route.

**Feedback summary** (F23, host site, `/events/:id` Feedback tab and Report tab, in the same chunk as the rest of the page): a panel with the figures, the paragraph, "What worked", "What to change", "In their words", a footer "Written by AI from N written answers on D" with a link to all the answers, and Regenerate and Copy with "2 of 3 left today". States: below the threshold, ready to write, written, AI unavailable (a message; figures and answers unaffected), none left today.

**Do I know someone who** (F24, a bottom sheet on `/app/people`, no new route): a row under the search box opens a sheet with one text box (200 characters), example chips, Search, and "N searches left today". Results: a notice "Found by AI from people you know. It only uses what they've shared with you.", then up to 5 rows (photo, name, line, reason, "Matched on: ...", where and when you met) linking to the card; "Nobody fits yet. Try different words."; or, when AI is not used, "Showing a keyword search instead" with the reason. The sheet is a separate chunk (`PeopleAsk`, about 3.4 KB gzip) fetched when the row is pressed, so it is in no first load.

**Rank with AI** (F25, on the event hub at `/app/events/:id`, no new route): under "People you might want to meet", once a wish is saved. The button says how many are left for this event; pressing it is the only trigger. Result: the list re-ordered, "Improved with AI. Ranked from what people here show. Not right? Press Usual list."; or "AI didn't find anyone who fits better, so this is the usual list."; or, when AI is off, used up or failing, the usual list with the plain message. It lives in the existing lazy `EventPresence.vue` chunk; no chunk, route or shared file was added or changed.

**Be easy to find** (F17, in the event hub above the Room, Album and Perks tabs, only while the event is on and the room is on): a card that says who sees it, what they see and when it is deleted, with "Show me to people here" (off by default), a selfie, a line, "I want to meet someone who..." with topic chips, and a row of people (photo, first name and last initial, line, reason). Tapping one opens a sheet with a bigger photo and "Find them in the room and scan their badge to connect." plus Report or block. After the event ends the card only offers to delete your photo and line now.

**Events tab** (F15, `/app/events`): "Happening now" (ongoing, then upcoming events, as cards with the word Ongoing or "Starts 18:00", venue, "Checked in 18:04" and the connection count) and "Past events" (rows with "Attended Wed 4 Nov 2026", the count and Ended). A small dot with hidden text sits on the tab while an event you checked in to is ongoing. **Event hub** (`/app/events/:id`, where check-in lands): a back arrow (to My card, or to the Events list if you came from it), the event name, venue and status word, a figures row (Connections, Checked in, People here), the feedback prompt, People you met here, then the Room, Album and Perks tabs and a "Your choices at this event" row that opens a sheet. A removed event shows "Not available". See [[F15 Events tab and event hub]] and [[D025 Event status is worked out from the clock, never stored]].

**Welcome steps** (`/app/welcome?step=1` to `6`, F14): where a new card is made. Not an `/app` page: no tab bar, no account banner and no Terms pop-up over it. A progress bar, Back (Leave on step 1), Skip on steps 2 to 5, and one Continue in the thumb bar. Each step saves as it is answered and the place is kept on the server, so closing the tab and opening `/app` carries on where they were; the step is also in the address, so a refresh and the browser Back button stay on the right step. Landing "Make your card", Sign in, the redeem page and My card with no card all open it, and `/app/profile` with no card redirects to it. People who left the steps are asked again from My card ("Pick up where you left off") and, for a guest who connected first, from People. "Finish your card" on My card opens the step that asks for the missing item (`?step=N`).

**Edit profile** (`/app/profile`, now only for editing a card): a Student / Career switch sits under Name. Student shows University, Course, Year; Career shows Company, Role and an optional "Studied at" (F11). The switch is on the profile, not in Settings. University and Studied at are a searchable picker with a "Not listed? Use ..." row and, for a `.ac.uk` email, a "Looks like you're at ... Use it" suggestion (F12).

**AI (F21):** Settings, Privacy and data has the AI search switch; Settings, Plan lists the AI allowances; `/admin` has an AI section (state, spend, kill switch, rollout stage, allow-list, test call).

**Settings** (F09) is a list of categories, each its own page: `/app/settings/account`, `/security` (Sign-in and devices), `/notifications` (Email and notifications), `/privacy` (Privacy and data), `/plan`, `/appearance` (Appearance and app), `/help` (Help and legal). Log out sits under the list. Phones show the list, then one page with a "‹ Settings" back link; from 900 px the list stays on the left. It is one route, `/app/settings/:page?`; `Settings.vue` loads the page. Old `/app/settings#plus`, `#signin` and `#install` links redirect to `/plan`, `/security` and `/appearance`. Emails about sign-in link to `/app/settings/security`.

## Host portal (its own site, F10)
Served at the root of `host.lanyd.fyi` (locally `http://host.localhost:5173`), from `src/router/routes.host.js`:
`/` (sign in by email code, then details, Host Terms and own name or organisation, then the dashboard), `/signin` (same page), `/events/:id` (live, details, feedback, report), `/events/:id/present` (F19: the projector page: event name, venue and time, a QR at least 40% of the screen height, the code in large figures, the typed address and a check-in count; Fullscreen, Light/Dark and Exit show on movement and hide after 3 s; refreshes every 15 s, not while hidden), `/events/:id/print` (F19: the A4 poster, black on white with a thin strap rule; opens the print dialog on load, `?auto=0` stops that), `/billing`, `/redeem` and `/redeem/:code` (F20: a host promo code for event credits, in the Billing chunk), `/account` (sign-in email, devices, organisation, team, integrations), `/signout` (signs out and reloads to `/`). Old `/host/...` addresses on the host site redirect to the root; anything else goes to the main site.

On the main site, `/host` and `/host/...` go to the same page on the host site (the router, and a 301 from the Worker). `/hosts` (the pitch page) stays on the main site and links to the portal. `/admin` stays on the main site.

**Create event in steps (F30):** on the host dashboard, New event opens `/?step=1`; the five steps are Basics, Look, At the event, Questions and Review (`?step=2` to `?step=5`). "Step N of 5" and the step names show where you are, Back and Next sit in a bar at the bottom, Cancel is at the top; the browser Back button moves between steps and a refresh stays on the step. The Details tab of a saved event stays one page.

**Named attendance (F31):** no new route. Step 3 of Create event and an event's Details tab have a "What this event collects" section (a tick for the list, two optional extras, a required why line); the Live tab shows a "Who checked in" list with a CSV link for an event that has it on (host event chunk), and the Report tab links to the CSV. On the main site the check-in page `/e/:code` shows "This event collects" above Check in for such an event; the event hub's "Your choices at this event" sheet and Settings, Privacy and data show the lists a person is on, with the same ticks, saved at once.

**Previews (F18):** on the host portal, the Create event form and an event's Details tab show the check-in page as attendees will see it, beside the form from 1000 px and behind a Preview button (full screen) below that, with a Default / Formal / Night strip and a brand colour that change the form too. In Edit profile and My cards, a Preview shows your badge or "What they see" (the card page) while you type: a Preview button at the top below 1260 px, open beside the page from 1260 px. Nothing in a preview is saved or sent. A host's Formal or Night theme, or brand colour, shows as a strap on the check-in page head.

## Development only## Development only
`/ui-test` shows every picker for checking by eye. It is registered only under `vite dev`; a production build does not contain it.

## Two route tables
`src/router/index.js` picks `routes.attendee.js` or `routes.host.js` by `ON_HOST_SITE`, so each site's router names only its own pages. Host API calls live in `src/lib/hostapi.js`, which only host pages import. See [[D020 Host accounts separate from attendee accounts]].

Related: [[Features]], [[Codebase Map]], [[API Surface]]
