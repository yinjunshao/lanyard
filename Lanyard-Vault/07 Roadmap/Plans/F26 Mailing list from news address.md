---
tags: [roadmap, feature, email, marketing, compliance]
id: F26
priority: P2
phase: 5
size: M
status: Not started
needs: [F09]
---
# F26 Mailing list from news address

**Priority:** P2 (can run in parallel any time after F09) · **Phase:** 5 Revenue and mail · **Size:** M · **Needs:** [[F09 Settings in category pages]] · back to [[00 Master To-Do]]

## What the owner asked for
A working mailing list, sent through Resend from **news@lanyd.fyi**.

## What already exists
- `users.marketing_optin` / `marketing_at`, set only by an explicit tick box with a verified email (`worker/email-auth.js`), and logged in `consent_log`.
- Admin broadcast `POST /api/admin/broadcast` (`worker/admin.js`): test send, resumable sends of 800 per call through `broadcast_sends`, opted-in and verified users only.
- `marketingEmail()` in `worker/mail.js`: names the sender, one-click unsubscribe link, plus `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
- Signed unsubscribe links (`worker/unsub.js`, kind `news`).
- **Gaps:** broadcasts go out with the **accounts** key and the `accounts@` sender, which mixes marketing with sign-in mail (a spam complaint could hurt sign-in delivery). There's no sign-up for people without an account (poster, landing page), no bounce or complaint handling, no preference topics, and no postal address in the footer.

## Decision: keep the list in our database, send from a separate stream
Resend has its own Broadcasts with contacts, segments and topics ([docs](https://www.resend.com/docs/dashboard/broadcasts/introduction.md)). Using them would mean two places that decide who is subscribed. Lanyard already records consent properly, so **D1 stays the source of truth** and we keep our own sender, with these changes:
- **Sender:** `Lanyard <news@lanyd.fyi>`, a **new Resend API key** `RESEND_NEWS_KEY` (new kind `news` in `mail.js`), reply-to `help@lanyd.fyi`.
- **Bounces and complaints:** a Resend webhook → `POST /api/webhooks/resend` (verify the signature with `RESEND_WEBHOOK_SECRET`). On a hard bounce or a complaint: unsubscribe, add to `email_suppressions(email_hash, reason, at)`, and log it in `consent_log`. Never send to a suppressed address again.
- Revisit Resend Broadcasts later if we need its editor or analytics.

## New pieces
### Sign-up without an account
- Table `newsletter_subscribers(id, email (lower), status pending|confirmed|unsubscribed, token_hash, source, created_at, confirmed_at, unsubscribed_at)`.
- Form on the landing page and on `/redeem` after a claim: email plus an **unticked** box "Send me Lanyard news and offers. Unsubscribe any time."
- **Double opt-in:** a confirmation email with a signed link. They're only subscribed after clicking. Pending rows are deleted after 7 days.
- If the email later becomes a verified account email, merge the two (the account flag wins and keeps the consent history).
- Rate limit: 5 sign-ups per IP per hour. Reply generically ("Check your inbox") whether or not the address exists.

### Topics (preference centre)
Two topics to start: **Product news** and **Events and offers**. `users.news_topics` / `newsletter_subscribers.topics` (JSON). Settings → Email and notifications ([[F09 Settings in category pages]]) shows switches for each. The unsubscribe page offers "Unsubscribe from everything" or per-topic choices.

### Every marketing email must have
- Who it's from: "Lanyard, run by Quantlink Investment Service Company Limited" ([[F50 QuantLink as the operator]]), with a **full postal address**. The postal address is still blocked on [[UK GDPR Audit 2026-11-01]] High 3: the site names the company but gives no address.
- Why they're getting it ("You signed up at lanyd.fyi on 4 Nov 2026").
- A one-click unsubscribe (link plus headers, which already exist) and a "Change what you get" link.
- No tracking pixels by default (fewer consent questions). If open tracking is ever turned on, the Privacy Policy must say so.

### Admin composer
Subject, plain-text body with Markdown-lite (paragraphs, links, bold), topic selector, "Send test to me", the audience count before sending, then a resumable send (existing). Store each broadcast with its topic.

## UK rules this follows (not legal advice)
- PECR: marketing email to individuals needs prior, specific, opt-in consent (unticked box), unless the "soft opt-in" applies to existing customers. Keep it simple and use explicit opt-in only.
- UK GDPR: consent records (exist), easy withdrawal (one click), named sender and contact.
- Keep consent and withdrawal logs ([[Privacy and Data Retention]]).

## Tasks
- [ ] F26.1 `news` mail kind with `RESEND_NEWS_KEY` and the `news@` sender; broadcasts use it.
- [ ] F26.2 Resend webhook endpoint, signature check, suppression table, and tests with signed fixture payloads.
- [ ] F26.3 Public sign-up plus double opt-in plus merge into accounts, with tests (pending expires; no enumeration).
- [ ] F26.4 Topics in settings and on the unsubscribe page.
- [ ] F26.5 Footer with sender identity and address (placeholder until the owner provides the address; the build fails the copy check if the placeholder ships).
- [ ] F26.6 Admin composer improvements (topic, count, test).
- [ ] F26.7 Policy text update.

## Owner steps
1. Resend: create the `RESEND_NEWS_KEY` (sending access only) and a webhook to `https://lanyd.fyi/api/webhooks/resend` for bounced and complained events. Copy its signing secret.
2. `wrangler secret put RESEND_NEWS_KEY` and `RESEND_WEBHOOK_SECRET`.
3. DNS: confirm SPF, DKIM and DMARC for `lanyd.fyi` pass in Resend's domain page (the domain already sends `accounts@` and `hosts@`).
4. Provide the postal address for the footer.

## Acceptance checks
- [ ] A landing-page sign-up gets a confirmation email from news@lanyd.fyi, and is subscribed only after clicking.
- [ ] A test broadcast arrives from `news@` with a working one-click unsubscribe.
- [ ] A simulated complaint webhook unsubscribes and suppresses that address.
- [ ] Sign-in code emails still come from `accounts@` with the accounts key.

## Log
-

Related: [[Integrations and Email]], [[Privacy and Data Retention]] · back to [[00 Master To-Do]]
