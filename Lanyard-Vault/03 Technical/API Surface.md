---
tags: [technical, api]
---
# API Surface

Grouped from route definitions in `worker/*.js`. All under `/api` unless noted.

**Session and account:** `GET /me`, `POST /logout`, `POST /terms/accept`, `GET /account/export`, `DELETE /account`, `POST /account/email`, `/account/email/confirm`, `/account/event-emails`, `/account/marketing`, `GET /auth/sessions` (each device has an opaque `id`), `POST /auth/signout-others`, `DELETE /auth/sessions/:id` (one of your own other devices; someone else's or a made-up id is 404, this device is 400)

**Sign-in:** passkey register/login (`/passkey/...`), email (`/auth/email/start`, `/verify`), TOTP (`/auth/totp/setup`, `/confirm`, `/redeem`, `DELETE`), recovery (`/auth/recovery`, `/recovery/redeem`), `POST /auth/redeem`, `/auth/link`

**Profile and cards:** `GET/POST/PUT /profile`, `POST /cards`, `PUT/DELETE /cards/:id`, `POST /cards/:id/rotate-code`, personal-note routes, `GET /c/:cardId`, `GET /code/:code`

**Connections:** `POST /connect`, `GET /connections`, `GET /connections/:id`, `PUT /connections/:id/note`, `/meta`, `POST /connections/:id/report`, `DELETE /connections/:id`

**Events (attendee):** `GET /e/:code`, `POST /e/:code/checkin`, `GET /e/:id/room`, `/album`, `/feedback`, `POST /e/:id/feedback`, `GET /my/events`, `GET /home`

**Host:** `/host/signup`, `/host/me`, `/host/org(s)`, `/host/events` (create, `PUT :id`, duplicate, end, rotate-code, live, report, report.csv, feedback), `/host/billing`, `/host/billing/request`, `/host/team` (invite, join, remove), `/host/transfer(s)`, `/host/tickets`, `/host/terms`, `/host/integrations` (webhook, key)

**Integrations:** `POST /integrations/rsvp` (API key sets an event's RSVP count)

**Promo codes:** `GET /redeem/:code` (look up; 30 per 10 minutes per IP and per person, wrong codes 30 an hour per IP), `POST /redeem/:code` (claim; 20 an hour per person). See `worker/promo.js`.

**Other:** `GET /health`, `GET /media/:key`, `/admin` routes (token), `POST /plan/waitlist`

Related: [[Screens and Routes]], [[Integrations and Email]], [[Security]]
