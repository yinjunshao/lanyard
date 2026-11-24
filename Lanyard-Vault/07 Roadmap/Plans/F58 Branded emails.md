---
tags: [roadmap, feature, email, design]
id: F58
priority: P1
phase: 10
size: M
status: In progress
needs: [F45, F48, F49]
---
# F58 Branded emails

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** M · **Needs:** [[F45 Email when someone new connects]], [[F48 Follow-up reminder emails]], [[F49 Profile score and finish-your-profile emails]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"I'm not sure if users get emailed about follow-up reminders yet, because I've not really received an email to do a follow-up, so I ensure to do that. And also maybe start designing a better email, because currently they're really bland. So the confirmation make it stylized to the design that we currently have."

> [!note] Why no reminder email has arrived (2026-11-24): the reminder emails ([[F48 Follow-up reminder emails]]) are built and tested but are in the commits not yet pushed or deployed, and they need migrations 0036 to 0038 on production first. See the "F45 to F50" row in the Master To-Do owner steps. They also go only to a confirmed email address, and only for reminders that come due after the deploy (or up to 48 hours before it).

## Current state
- `worker/mail-templates.js` (161 lines): event, feedback, follow-up reminder, finish-your-profile and other templates. HTML is bare `<p>` paragraphs, a dark button (`#1B1A17`), and a small grey footer. `worker/mail.js` sends (Resend) and has `escapeHtml`; check whether it wraps the HTML in a layout. Sign-in codes, magic links, confirm-your-email ([[F45 Email when someone new connects]]), host emails, invites and privacy emails may live in other files (`worker/email-auth.js`, `worker/host-auth.js`, `worker/pending-email.js`, `worker/eventmail.js`, `worker/followupmail.js`, `worker/profilenudge.js`, `worker/privacy.js`): find every email.
- `MAIL_LOG=1` logs emails locally instead of sending.

## Plan
- One layout function `emailLayout({ preheader, title, bodyHtml, button, footerHtml })` in `worker/mail-layout.js`, used by **every** email, in the Lanyard look ([[Design System]]):
  - Paper background `#F4F1EA`, a raised card `#FFFDF8` 560 px wide with a 1px `#D8D2C5` border and 6px radius, a 6px Persimmon strap bar `#D9502B` across the top of the card (the lanyard cue), the wordmark "lanyard" in text (bold, with the brand's accent as in the app header) at the top, Atkinson Hyperlegible Next with system fallbacks, ink `#1B1A17` text at 16px / 1.5, muted `#6B675F`.
  - The main button is Persimmon with white text, 44 px tall, rounded 6px, written as a bulletproof table button that works in Outlook.
  - A footer with the operator line (from the F50 `OPERATOR` constant), why they got it, and the stop link where the email has one.
  - A hidden preheader line for the inbox preview.
  - Dark mode: `color-scheme` meta and a `@media (prefers-color-scheme: dark)` block for clients that support it (paper `#141311`, card `#201E1A`, ink `#F4F1EA`); clients that ignore it get the light version, which must still look right.
  - Tables and inline styles only (email clients), no web fonts that call out, **no remote images or tracking pixels**, no JavaScript. Total HTML under 30 KB.
- Each email keeps its words and its plain-text part, gets a short title line and preheader, and uses the one layout. The sign-in code email shows the code large, spaced, in a box, easy to copy.
- A local preview: `npm run mail:preview` writes every template, with sample data, to `scratch/mail-preview/*.html` (git-ignored) and an index page, so the owner can open them in a browser. No email is sent.
- Tests: every template goes through the layout, user text is escaped (try `<script>` and `"` in a name and event name), no `http` image sources, the stop link and List-Unsubscribe headers are kept where they were, plain text present.

## Tasks
- [x] F58.1 Build `emailLayout` and the preview script; move the templates in `mail-templates.js` onto it.
- [ ] F58.2 Move every other email (sign-in, magic link, confirm email, host, invites, privacy, security) onto it; tests; vault notes ([[Codebase Map]], [[Design System]] email section); open the preview pages at 375 and 1280 px in a browser, light and dark.

## Acceptance checks
- [ ] `npm run mail:preview` writes one page per email; each shows the paper background, the white card with the strap bar, the wordmark, a Persimmon button and the footer.
- [ ] The sign-in code email shows the code large and in a box.
- [ ] In a dark-mode preview the colours switch; in light it looks as designed.
- [ ] A name `<script>alert(1)</script>` appears escaped in every template that shows a name (test).
- [ ] No template contains a remote image (test).
- [ ] Reminder and finish-your-profile emails still carry their stop link and List-Unsubscribe headers (test).
- [ ] Real-world, owner only: one real email of each main kind looks right in Gmail (web and phone) and Outlook after deploy.
- [ ] `npm test` passes.

## Log
-

Related: [[F48 Follow-up reminder emails]] · [[F50 QuantLink as the operator]] · back to [[00 Master To-Do]]
