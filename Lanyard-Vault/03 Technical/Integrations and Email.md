---
tags: [technical, integrations, email]
---
# Integrations and Email

## Outbound webhook
One signed webhook per organisation (events: `event.ended`, `test`). Zapier, Make or a host's server can forward to Luma, Sheets, Slack. Signature header `Lanyard-Signature`.

## Inbound RSVP count
`POST /api/integrations/rsvp` with the organisation's API key sets an event's RSVP **count** (from Luma or union sign-ups) so the report can show sign-ups vs check-ins. Counts only, never names or emails.

## Email (Resend)
- Accounts key: sign-in codes and account mail.
- Decisions key (`hosts@lanyd.fyi`): host portal sign-in codes (F10), application received and decided, ticket decisions, transfers waiting, team invites, and the event recap. Host mail links go to `host.lanyd.fyi`.
- Local dev: `MAIL_LOG = "1"` in `wrangler.toml` prints mail in the wrangler console instead of sending it.
- Event mail: feedback reminders to attendees (on by default, one-click off) and a recap to the event owner; `event_mail_log` (attendees) and `host_mail_log` (the recap) stop duplicates.
- Broadcasts: marketing sends to opted-in users only; resumable via `broadcast_sends`.

Related: [[Host Portal and Billing]], [[Security]]
