---
tags: [technical, api]
---
# API Surface

Grouped from route definitions in `worker/*.js`. All under `/api` unless noted.

**Session and account:** `GET /me`, `POST /logout`, `POST /terms/accept`, `GET /account/export`, `DELETE /account`, `POST /account/email`, `/account/email/confirm`, `/account/event-emails`, `/account/marketing`, `GET /auth/sessions` (each device has an opaque `id`), `POST /auth/signout-others`, `DELETE /auth/sessions/:id` (one of your own other devices; someone else's or a made-up id is 404, this device is 400)

**Sign-in:** passkey register/login (`/passkey/...`), email (`/auth/email/start`, `/verify`), TOTP (`/auth/totp/setup`, `/confirm`, `/redeem`, `DELETE`), recovery (`/auth/recovery`, `/recovery/redeem`), `POST /auth/redeem`, `/auth/link`

**Profile and cards:** `PUT /onboarding` (F14: `{ step: 1 to 6 }` moves a person in the welcome steps, `{ done: true }` finishes; anything else is 400, no profile is 404, and for anyone not in the steps it changes nothing and counts nothing), `GET/POST/PUT /profile` (`POST` with `onboarding: true` starts the welcome steps at step 2; it still needs `acceptTerms` and `over18`; `mode` must be `student` or `career`, otherwise 400; `company` and `role` are trimmed to 80 characters; `institutionId` (or `institution_id`) must be an id from the institution list or null, otherwise 400, and a listed id sets `uni` to the official name; typed `uni` text is capped at 120 characters and, when it changes without an id, clears `institution_id`. `GET /me` also returns `user.emailDomain` for the institution suggestion. `GET /c/:cardId`, `GET /connections`, `GET /connections/:id` and `GET /e/:id/room` return `mode`, `company` and `role` alongside `uni`, `course` and `year`), `POST /cards`, `PUT/DELETE /cards/:id`, `POST /cards/:id/rotate-code`, personal-note routes, `GET /c/:cardId`, `GET /code/:code`

**Connections:** `POST /connect` (takes `via`: `qr`, `code` or `link`; anything else or nothing is stored as `link`; set only when the connection is first made), `GET /connections` (each has `via`, `eventName`, `metAt`), `GET /connections/:id` (same, and `eventName`), `GET /c/:cardId` (`viewer.connection` has `via`, `event`, `metAt`; `via` is `null` for connections made before F13) and the data export (`connections[].via`), `PUT /connections/:id/note`, `/meta`, `POST /connections/:id/report`, `DELETE /connections/:id`

**Events (attendee):** `GET /e/:code`, `POST /e/:code/checkin`, `GET /e/:id/room`, `/album`, `/feedback`, `POST /e/:id/feedback`, `GET /my/events` (F15: each event has `startsAt`, `endsAt`, `endedAt`, `status` of `upcoming`, `ongoing` or `ended` for that person, `checkedInAt`, `connectionCount`, and the server clock `now`), `GET /my/events/:id` (F15: the event, `status`, `checkedInAt`, `connectionCount`, `roomCount` (others in the room, `null` with the directory off), `connections` of the viewer's own at that event with `via`, `metAt`, `cardId` and a selfie only when the viewer may see it, and `event.hasChoices`; 404 unless checked in, 401 signed out; it lives in `worker/myevents.js`), `GET /home`

**Host** (host site only, host cookie only; refused on the main site and from other origins, see [[Auth and Sessions]]): `POST /host/auth/start`, `/host/auth/verify` (email code), `POST /host/logout`, `GET /host/me` (includes `step`: details, terms, org, ready), `POST /host/account/details`, `POST /host/terms`, `GET /host/sessions`, `DELETE /host/sessions/:id`, `POST /host/sessions/signout-others`, `GET /host/account/export`, `/host/org(s)`, `/host/events` (create, `PUT :id`, duplicate, end, rotate-code, live, report, report.csv, feedback), `/host/billing`, `/host/billing/request`, `/host/team` (invite with an optional email, join, remove by host account id), `/host/transfer(s)`, `/host/tickets`, `/host/terms`, `/host/integrations` (webhook, key)

**Integrations:** `POST /integrations/rsvp` (API key sets an event's RSVP count)

**Promo codes:** `GET /redeem/:code` (look up; 30 per 10 minutes per IP and per person, wrong codes 30 an hour per IP), `POST /redeem/:code` (claim; 20 an hour per person). See `worker/promo.js`.

**Admin onboarding** (token): `GET /admin/onboarding` (counts per step for the last 30 days: `steps[].step`, `reached`, `completed`; no ids).

**Admin hosts** (token): `GET /admin/hosts?q=` (host accounts and organisations with no host), `POST /admin/hosts/:id/status`, `POST /admin/orgs/:id/attach` (by host email)

**Other:** `GET /health`, `GET /media/:key`, `/admin` routes (token), `POST /plan/waitlist`. Not under `/api`: `GET /host` and `/host/*` answer 301 to the same page on the host site (F10)

Related: [[Screens and Routes]], [[Integrations and Email]], [[Security]]
