---
tags: [product]
---
# Product Overview

**One line:** a mobile web app where people show a personal QR badge at events; scanning it connects two people with a shared selfie so they remember each other's face, name and what each can help with.

## How it works for an attendee
1. Make a card (guest: just a name and a selfie; no account needed). See [[Auth and Sessions]].
2. Show the QR (or a 4-character code) at the event.
3. The other person scans, both take a selfie together (both consent), optional private note.
4. Later, the **People** list shows every connection grouped by event, searchable by name or tag.

## How it works for a host
1. Create an event in the host portal, get an event QR.
2. Attendees scan it to check in; the **room** shows who is there (opt-in).
3. After the event: an aggregate report, optional feedback survey, CSV exports. See [[Host Portal and Billing]].

## Why it is different
- Two-way, with context ("how we met": selfie + note + "Come to me for"), where competitors capture one-way leads. See [[Competitors]].
- Free for attendees, no app to install.
- Priced for student and community events that big event apps ignore.

## Who pays
Hosts (societies, institutions, companies, careers services) buy event credits or plans. Later: sponsors. See [[Business Model]] and [[Pricing]].

## Status
Built and deployed (v2 on Cloudflare Workers + D1 + R2). Demoed at a UCL hackathon. No paying customers recorded. See [[Traction and Proof]].

Related: [[Features]], [[Architecture]], [[Decision Log]]
