---
tags: [product, features]
---
# Features

## Attendee side
- **Student and Career mode:** a profile is either a student (course and university) or working (company and role, with where they studied optional). Switching keeps everything typed; the card, people list and search show only the chosen mode (F11).
- **Institution picker:** University, Studied at and a society's university are searched from a UK list (names, short names such as UCL, accents ignored) or typed if not listed; an email like name@students.example.ac.uk suggests its institution. The list was written by an agent and needs owner review (F12, [[D021 Institution list from knowledge, loaded when the picker opens]]).
- **Cards:** one profile, many cards ("Careers fair", "Hackathon", "Weekend"). Each card has its own note, visible links, tags, theme, QR and code. Free plan: 3 cards; Plus: 12. See [[D015 Profile split from cards]].
- **Rotating codes:** 4-character card code rotates every 3 days (6h grace). See [[D016 Rotating card codes]].
- **Connect with shared selfie:** consent from both people, deletable by either. See [[D005 Shared selfie needs both consents]].
- **Private notes** per connection; optional "personal note" on a card.
- **People:** grouped by event and date, keyword search (name, tags), filter.
- **Messages/threads** on a connection (table `messages`).
- **Report and block** on any profile or connection.
- **Event room, album and Discovery** after check-in. See [[Host Portal and Billing]].
- **Feedback survey** after events, with reminder email.
- **Account:** passkeys, email sign-in, authenticator app (TOTP), recovery code, export my data, delete account. See [[Auth and Sessions]].
- **Plus plan** (waitlist table exists): more cards, custom strap colour. See [[Pricing]].

## Host side
- Its own site and account (`host.lanyd.fyi`): sign in with an email code, no passkeys; setup is details, Host Terms, then own name or organisation, with Back and Sign out on every step (F10).
- Create / duplicate / end events; event QR and rotating event code; live check-in count; custom check-in questions (max 3).
- Aggregate report (PDF-style view and CSV).
- Sponsors on an event; sponsor opt-in at check-in.
- Feedback survey builder and results.
- Team members (owner, staff, sponsor_viewer), invites (by host email or code), ownership transfer by host email, support tickets.
- Webhook (signed) and RSVP API key. See [[Integrations and Email]].
- Billing requests (invoice / PO). See [[Host Portal and Billing]].

## Admin
`/admin` (token-protected): approve societies and institutions, grant credits, see usage.

## Not built yet (as far as the project files show)
Stripe checkout, sponsor talent search page, Apple/Google Wallet pass, NFC tap, Eventbrite/Luma native integrations (only generic webhook + RSVP count), AI follow-up drafts (an env var `CLAUDE_API_KEY` exists; confirm whether used).

Related: [[Screens and Routes]], [[Product Overview]]
