---
tags: [product, features]
---
# Features

## Attendee side
- **Student and Career mode:** a profile is either a student (course and university) or working (company and role, with where they studied optional). Switching keeps everything typed; the card, people list and search show only the chosen mode (F11).
- **Welcome steps** (F14): a new card is made one question a screen at `/app/welcome`: name and photo (with the 18+ and Terms tick), Student or Working, what you can help with and one line, links, save your card (email by code, then an optional passkey), and a done screen with the badge. Each answer is saved as it is given, so the steps resume on any device; every step after the first can be skipped (the email only while no promo code is waiting). A guest who connected before making a card is asked to finish by name. [[D023 Welcome steps keep their place on the server and count only]].
- **Institution picker:** University, Studied at and a society's university are searched from a UK list (names, short names such as UCL, accents ignored) or typed if not listed; an email like name@students.example.ac.uk suggests its institution. The list was written by an agent and needs owner review (F12, [[D021 Institution list from knowledge, loaded when the picker opens]]).
- **Cards:** one profile, many cards ("Careers fair", "Hackathon", "Weekend"). Each card has its own note, visible links, tags, theme, QR and code. Free plan: 3 cards; Plus: 12. See [[D015 Profile split from cards]].
- **Rotating codes:** 4-character card code rotates every 3 days (6h grace). See [[D016 Rotating card codes]].
- **Connect with shared selfie:** consent from both people, deletable by either. See [[D005 Shared selfie needs both consents]].
- **How you met** (F13): each connection says how it was made (QR code, code or link), at which event if you were both checked in, and when. Shown to the two people only; old connections just say Connected.
- **Private notes** per connection; optional "personal note" on a card.
- **People:** grouped by event and date, keyword search (name, tags), filter.
- **Messages/threads** on a connection (table `messages`).
- **Report and block** on any profile or connection.
- **Events tab and event hub** (F15): the fourth tab lists what is on now and the events you attended (Ongoing or Ended, the date you attended, your connection count); checking in lands on the hub with your figures and the people you met there.
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
`/admin` (token-protected): approve societies and institutions, grant credits, see usage, and the welcome-steps funnel (counts per step for 30 days, nothing about who).

## Not built yet (as far as the project files show)
Stripe checkout, sponsor talent search page, Apple/Google Wallet pass, NFC tap, Eventbrite/Luma native integrations (only generic webhook + RSVP count), AI follow-up drafts (an env var `CLAUDE_API_KEY` exists; confirm whether used).

Related: [[Screens and Routes]], [[Product Overview]]
