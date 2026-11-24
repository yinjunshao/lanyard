---
tags: [decision, email, design, security]
status: Accepted
date: 2026-11-24
---
# D053 Every email goes through one layout, with no remote images, checked when it is sent

**Status:** Accepted  ·  **Date:** 2026-11-24

## Context
[[F58 Branded emails]]: the owner found the emails "really bland" and asked for the confirmation, and by extension all of them, to look like the app. Emails go to real inboxes, so the look cannot cost safety: a name an organiser or a guest typed must not become markup, a stop link and its `List-Unsubscribe` headers must survive a redesign, and an email must not report back to anyone that it was opened.

## Decision
- **One layout function, `emailLayout`, in `worker/mail-layout.js`.** Every template calls it; none writes a `<p>` of its own. It makes the whole document: paper, a raised card with a 1px rule and 6px radius, a 6px Persimmon strap bar, the wordmark as text, a short title, a hidden preheader, one button, a footer with the operator line (`OPERATOR`, imported from `src/lib/contact.js`, the one place the name is written) and the stop link where the email has one.
- **Callers pass plain text.** The layout and its helpers (`paragraphs`, `panel`, `codeBox`, `bullets`, `link`, `button`) escape it. Only `bodyHtml` and `footerHtml` are HTML, and they are built from those helpers. A URL is turned into a link in a paragraph only when it is one of the exact URLs the template passes (`links`), never because a person typed it.
- **No remote anything.** No image (the wordmark is text), no tracking pixel, no script, no stylesheet or web font fetched, no form. The font is "Atkinson Hyperlegible Next" then the system stack. So an email never tells us (or anyone) that it was opened, and a client that blocks images loses nothing.
- **Email-client craft.** Tables and inline styles; the `<style>` block adds only a narrow-screen rule and the dark colours (`color-scheme` meta and `prefers-color-scheme: dark`, plus `[data-ogsc]` for Outlook.com), and the light version stands alone for clients that drop it. The button is a table button with a VML twin for Outlook.
- **The plain-text part and the subject stay each template's own.** F58 changed no subject and no plain-text line; the HTML gained a title line and a preheader only.
- **It is checked when it is sent.** `sendMail` and `sendBatch` refuse (throw) any HTML without the layout's marker when a test outbox or `MAIL_LOG` is in use, so a new email written without the layout fails in tests and in local runs. A live send with no marker is logged and still sent, because a plain sign-in code is better than a lost one. `test/mail-layout.mjs` also lists every send site, so a new one fails until it has a sample.

## Consequences
- A new email is a function that returns `{ subject, text, html, headers? }` with `html` from `emailLayout`, and an entry in `scripts/mail-samples.mjs` (which feeds `npm run mail:preview` and the tests).
- `withConfirm` adds its block through the layout's marker (`addToBody`) and throws on HTML that has none, so a confirm button can never be dropped silently.
- A real inbox check (Gmail on the web and a phone, Outlook) is still the owner's, after a deploy; the Outlook button and dark mode are written to the usual rules but were not seen in Outlook here.

**Evidence:** `worker/mail-layout.js`, `worker/mail.js`, `worker/mail-templates.js`, `scripts/mail-samples.mjs`, `scripts/mail-preview.mjs`, `test/mail-layout.mjs`

Related: [[Design System]], [[Integrations and Email]] · back to [[Decision Log]]
