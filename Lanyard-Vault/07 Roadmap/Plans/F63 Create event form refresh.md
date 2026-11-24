---
tags: [roadmap, feature, host, ui]
id: F63
priority: P1
phase: 11
size: M
status: Not started
needs: [F30]
---
# F63 Create event form refresh

**Priority:** P1 · **Phase:** 11 Owner requests (2026-11-24, second batch) · **Size:** M · **Needs:** [[F30 Create event in steps]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"it's time to look into potential restyling for hosts when they're creating the event. This is because right now the form that to create an event is kind of not buggy, but low quality and not very nice. Therefore, maybe improve that."

"I think we could potentially remove the access info for attendees for now, because this is more like a ticket thing, not a check-in thing, because if they have checked in, they should have technically be in the room ready. So that shouldn't be concerned. Maybe just hide that field and from the user side, and still keep it as a function so we could make it come back in the future maybe."

"make food and drinks a better input field. So if it's provided, it's a checkbox, and then if it's checked, then I guess you could write what type of food there is and what options there are. So for the main ones like vegan, halal, and etc. are provided or not."

"the animation smoother for this form as well."

"make the perks on the host's details page 2 text boxes that are next to each other per row. So it will be the main name that will obviously be a thinner box, and a longer box on the right side of it. There are the descriptions. So when user clicks on the button on the events page of that perk, they get information that is written in the wider box."

## Current state
- Create event is `src/components/EventCreate.vue` (139 lines) with four step components, `EventStepBasics.vue`, `EventStepLook.vue`, `EventStepAtEvent.vue` and `EventStepQuestions.vue`, then Review. Step rules and the review rows are in `src/lib/eventsteps.js`. The request body is built in `src/lib/eventform.js` (`createBody`, `detailsBody`, `eventFromBody`). The host dashboard `src/views/HostDashboard.vue` owns the form and `?step=N`.
- Step changes swap the component with no motion. Fields are stacked inputs with uneven help text.
- Step 3 (`EventStepAtEvent.vue`) has:
  - Perks as one textarea, "one per line", with details in brackets: `Free coffee (Show this at the bar before 11am)`. The attendee side parses the brackets into a perk button that opens the details (`src/lib/eventtext.js` near line 20).
  - "Access info for attendees" and "Food and drink" as 200-character text inputs, saved in `events.info` JSON as `info.access` and `info.food`.
- The Details tab of a saved event (`src/views/HostLive.vue`) has the same perks textarea and the info fields (access, dress, food, other).
- The Worker cleans `info` with `eventInfo()` and perks to 10 strings of up to 300 characters (`worker/hosts.js` lines 335-341). The check-in page (`src/components/EventPage.vue`) shows every `info` key in a list, with labels in `INFO_LABELS`.

## Plan
1. **Motion.** Moving between steps slides the new step in a short way and fades it, using the motion tokens only. Forward and back go in opposite directions. Under reduced motion it is a plain fade. Disclosures, such as the food details and "What this event collects" opening, use `UiReveal` ([[F57 Card editor opens with motion]]). This follows [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]]: CSS tokens, transform and opacity, nothing over 300 ms, no Vue Transition.
2. **Look.** Tidy every step to the [[Design System]]:
   - each step's fields in labelled groups with even gaps;
   - one help line per field, under it;
   - the step names as a clear progress row;
   - the sticky Back and Next bar kept.

   The same at 375 and 1280 px, in light, dark and midnight.
3. **Access info hidden, kept in code.**
   - Remove the field from Create event and from the Details tab, and stop the check-in page and the event hub showing `info.access`.
   - Keep `access` in `eventInfo()`, the API and the database, so an old event's value is kept and the field can come back. Add a one-line comment saying why.
   - The Review step no longer lists it.
4. **Food and drink.**
   - A tick, "Food or drinks provided". When ticked, a disclosure opens with:
     - a short text field, "What there is", such as "Pizza and soft drinks" (up to 200 characters, as now);
     - a row of option ticks: **Vegetarian, Vegan, Halal, Kosher, Gluten-free, Dairy-free**.
   - Stored in the existing `info` JSON, so no migration:
     - `info.food` stays the text;
     - a new `info.foodOn: true`;
     - a new `info.diet`, an array of exact ids (`vegetarian`, `vegan`, `halal`, `kosher`, `gluten-free`, `dairy-free`).
   - The Worker's `eventInfo()` keeps only known ids, at most 6, and drops `diet` when `foodOn` is not true.
   - The check-in page and the event hub show one "Food and drink" row: the text, then "Options: Vegan, Halal" in plain words.
   - An old event that has `food` text but no `foodOn` still shows its text, and the host form opens it ticked.
   - The same field is on the Details tab.
5. **Perks as rows.**
   - Each perk is one row of two boxes: a narrow "Perk" (the name, up to 60 characters) and a wide "Details (optional)" (up to 230 characters). Up to 10 rows. "Add a perk" adds a row, and each row has a remove button with an accessible name.
   - At 375 px the two boxes stack, name first.
   - The wire format does not change: a row becomes `Name (Details)`, or `Name` when there are no details, so the Worker, the attendee perk button and copies of earlier events keep working. Reading a saved perk back splits on the last bracketed group at the end.
   - A name may not contain `(` or `)`, so it cannot be misread. This is checked in the step, with a plain message.
   - Used on Create event step 3 and the Details tab.
   - The attendee perk button opens the details, as now.
6. **Copy.** UK English, plain words, no emoji, no named universities.

## Tasks
- [ ] F63.1 Step motion and the tidy layout of every step (Create event), with `UiReveal` for the disclosures; tests for the motion rules (tokens only, reduced motion) and that every step still validates and keeps its focus rules.
- [ ] F63.2 Access info hidden (Create, Details, check-in page, hub; kept in the Worker); food and drink as a tick, text and diet options, in `eventform.js`, `eventInfo()`, the check-in page and the hub; tests (unknown diet ids dropped, `diet` without `foodOn` dropped, old events still show their text, access no longer shown but still stored).
- [ ] F63.3 Perks as name and details rows on Create and Details, round-tripping the existing string format; tests (round trip, brackets in a name refused, 10 rows at most, an old perk with brackets in the middle read back sensibly); vault notes ([[Screens and Routes]], [[API Surface]] `info` shape, [[Design System]]); browser check of every step and the Details tab at 375 and 1280 px, light, dark and midnight, keyboard only.

## Acceptance checks
- [ ] Pressing Next on step 1 slides step 2 in; Back slides the other way; nothing moves over 300 ms (test reads the CSS); with reduced motion it fades (owner, with the system setting on).
- [ ] Create event and Details have no Access field; an event saved earlier with `info.access` keeps it in the database and the API, and the check-in page does not show it (test).
- [ ] Ticking "Food or drinks provided", typing "Pizza" and ticking Vegan and Halal shows "Food and drink: Pizza. Options: Vegan, Halal" on the preview and on the real check-in page after Create (test and browser).
- [ ] A request with `info.diet: ["vegan", "beef"]` saves only `vegan`; with no `foodOn` it saves no `diet` (test).
- [ ] Two perk rows "Free coffee" / "At the bar before 11am" and "Raffle entry" / (empty) save as `["Free coffee (At the bar before 11am)", "Raffle entry"]`; reopening Details shows the same two rows; the attendee's Free coffee button opens "At the bar before 11am" (test and browser).
- [ ] At 375 px the perk boxes stack; at 1280 px the name box is narrower than the details box (browser).
- [ ] `npm test` passes; public pages within budget (this is host-site code, not a public page; the check-in page change must not grow it by more than 300 B gzip).

## Log
-

Related: [[F30 Create event in steps]] · [[F64 New events start from the host's latest settings]] · [[F65 Event themes and an advanced look]] · back to [[00 Master To-Do]]
