---
tags: [technical, security, auth]
---
# Auth and Sessions

## Guest first
Anyone scanning a card can connect with a name, an email (F45) and a selfie. No account and no code: the email is kept unconfirmed in `users.pending_email` and cannot sign in until the person presses the button behind the link in our first email ([[D049 A new person's email is kept unconfirmed, never signs in, and gets at most two emails]]). Sign-in by email reads only `recovery_email`, so an unconfirmed address never finds an account. A connect that is refused (no email, no Terms tick, a made-up card) makes no guest at all. A guest is minted only on an action, not by page views or bots (a test checks this). New guests are rate-limited per IP.

## Session
- Cookie `lanyard_session`: HttpOnly, SameSite=Lax, Secure on https, 365 days.
- The database stores only the **SHA-256** of the token, so a leaked backup cannot be replayed.

## Claiming an account
At home the guest finishes their profile and adds a **passkey** (Face ID / fingerprint). Optional methods: email sign-in code, authenticator app (TOTP, secrets encrypted with `TOTP_KEY`), recovery code.

## What was dropped
The v1 login (birthday + 4-char hex code) was guessable (65,536 combinations) and birthdays are public. See [[D003 Guest first with passkeys]].

## Passkey scope (attendee accounts)
`RP_ID` is tied to the hostname. Passkeys made on the workers.dev address stay on that address; `RP_DOMAIN` (lanyd.fyi) covers the custom domain. Host accounts have no passkeys, and `host.*` origins are not accepted for passkeys (F10). See [[Deployment]].

## Student verification
University email domain (ac.uk first) gives a verified-student flag; only domain + flag are public. See [[Customers and Buyers]].

## Host accounts (F10)
Host accounts are separate from attendee accounts ([[D020 Host accounts separate from attendee accounts]]). Code: `worker/host-auth.js`.
- **Where:** only on the host site (`host.lanyd.fyi`; locally `host.localhost:5173`). `/api/host/*` is refused on the main site (403 `wrong_site`) and from any other origin, including the main site's pages (403 `bad_origin`; reads too, because both sites are the same "site" to SameSite). The host site answers 401 `wrong_site` to every attendee API route.
- **Cookie:** `__Host-lanyard_host` on https (`lanyard_host` on plain-http local dev): HttpOnly, Secure, SameSite=Strict, Path=/, no Domain, 30 days. `host_sessions` stores only its SHA-256. The attendee cookie is never read for host routes and the host cookie never for attendee routes. Being signed in on one site does nothing on the other.
- **Sign-in:** email, then a 6-digit code (`POST /api/host/auth/start`, `/verify`). Codes are stored as a peppered SHA-256 (`host_login_codes`), last 10 minutes, allow 5 tries, work once; a new code replaces the old. Limits: 5 codes per email and 20 per IP an hour; wrong guesses throttled per IP and per email. Replies are the same whether or not the email has an account. The first right code for a new email creates the account. No passkeys, recovery keys or authenticator.
- **Setup:** details, then Host Terms, then own name or organisation; each saved on `host_accounts`, and `GET /api/host/me` says which `step` comes next. Until done, other host routes answer 403 `details_required` or `terms_required`.
- **Devices and sign-out:** `POST /api/host/logout` (any state); devices list, sign out one device or all others under `/api/host/sessions`. An admin can switch an account off, which ends its sessions.

Related: [[Security]], [[Privacy and Data Retention]]
