---
tags: [decision, privacy, host]
status: Accepted
date: 2026-11-24
---
# D056 New events start from the organisation's latest event's switches, collects included, flagged on the form

**Status:** Accepted  ·  **Date:** 2026-11-24  ·  Narrows [[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]]

## Context
A new event's Create form started from fixed defaults: the attendee room, "Suggest people to each other" and feedback on, and "What this event collects" off. [[D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice]] said the list is per event and off by default, and that a copy of an earlier event does not carry it over: the host chooses again. The owner asked (2026-11-24) that a host's new event start with the switches as on their latest event, "for example, applies for what this event collects, suggest people to each other". Asked whether that should include "What this event collects", the owner chose **"Copy it, flag it"** ([[F64 New events start from the host's latest settings]]).

## Decision
- **Seven values follow, nothing else:** `directoryOn`, `suggestOn`, `feedbackOn`, and the collects choice `collectOn`, `collectEmail`, `collectCard`, `collectWhy`. No content (name, venue, perks, questions, sponsors) follows.
- **The latest event** is the organisation's most recently created event (`created_at`, then insertion order), per organisation, not per team member. Events are only ever removed outright (there is no soft delete), so every row counts; an organisation with none gets the fixed defaults, collects off.
- **The server says it:** `GET /api/host/me` carries `eventDefaults` with exactly those seven keys, only once the host has an organisation, found with the existing `findOrg` (the account's own membership). One query on that organisation's events, selecting only the six setting columns. Nothing about attendees. Signed out and attendee sessions get 401 as for every host route.
- **Only a fresh form:** a fresh Create event form (no draft, after Cancel, after Create) takes them; a draft keeps its own values. A form still exactly as it started is not saved as a draft, so the next visit starts from the latest event again.
- **Start from an earlier event:** the seven come from the event chosen, read from the host's own live route, not from the latest, so the two never disagree. While it is being read the collects are off. The Worker rule of D038 is unchanged: the duplicate route still copies no list by itself; the form sends the chosen event's collects as the host's own choice, which they can untick.
- **Flagged:** each copied setting that differs from the fixed default shows a muted line under it, "As on your last event" (or "As on the event you started from"); the collects switch, when it comes on that way, says in bold "On because your last event collected names. Untick to stop."; Review adds "(as on your last event)" to each such row. A setting in its usual state gets no line, since the line is there to make the unusual one visible.

## Consequences
D038 is narrowed: the list is still per event and off by default for an organisation that never used it, but once an organisation has switched it on, its next events start with it on until someone unticks it.

> [!warning] Risk the owner accepted (2026-11-24): a host who switched on named attendance once now has it on for every new event unless they untick it. They could collect names at an event where they did not mean to. Lowered by the "On because your last event collected names. Untick to stop." line on the switch, the Review row, and a test that a host who never switched it on still starts with it off.

The extra items (email and card) carry the D038 warning with them: they have no settled lawful basis yet, and now a host who ticked them once has them pre-ticked on the next event too. The Privacy Policy and Terms are unchanged: what attendees see and choose on the check-in page is the same.

**Evidence:** `worker/hosts.js` (`eventDefaults`, `EVENT_DEFAULTS`), `src/lib/eventsteps.js` (`START_KEYS`, `startValues`, `startFromEvent`, `freshForm`, `copiedKeys`, `reviewGroups`), `src/views/HostDashboard.vue`, `src/components/EventCollects.vue`, `EventStepAtEvent.vue`, `EventStepQuestions.vue`, `EventCreate.vue`, `test/event-defaults.mjs`

Related: [[D037 Create event in steps keeps the old request and one draft per host and organisation]], [[D054 Everyone checked in can be suggested unless they untick Suggest me, shown only what their card shows]], [[D004 Aggregate-only host analytics]] · back to [[Decision Log]]
