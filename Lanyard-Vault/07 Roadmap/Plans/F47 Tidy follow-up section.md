---
tags: [roadmap, feature, ui, people]
id: F47
priority: P1
phase: 9
size: S
status: Not started
needs: []
---
# F47 Tidy follow-up section

**Priority:** P1 · **Phase:** 9 Owner requests (2026-11-22) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-22)
"In the people page, so after I connect with someone and then I go into the people page and I click on a person, can you make the follow up section better in terms of UI design? Because currently it's just really messy and there are too many buttons. It should be more like you have a follow up section and you have a specific section for drafting. And I think there might be too many buttons for follow up. So tomorrow is good, and 3 days is good, and pick a day is good. Next week is too long, so I don't think people would do that anyways."

## Current state
- A person opens at `/c/:cardId` (`src/views/Person.vue` redirects there). The "Your connection" panel is `src/components/CardConnection.vue` (lazy, loaded by `PublicCard.vue`).
- Its "Follow up" block (about lines 148-171) mixes: a reminder line with Clear, four chips (Tomorrow, In 3 days, Next week, Pick a date), a "Draft a follow-up" button and a "Mark as followed up" button, all at the same weight. Below: private note, tags, then Save to contacts, Remove and Report as three equal buttons.
- Reminders are 9:00 local via `morningIn()` in `src/lib/time.js`; "Pick a date" opens `UiDatePicker.vue` lazily.

## Plan
Two clearly separate blocks inside the panel, each with a small heading:
1. **Follow up** (the reminder):
   - No reminder: one short line ("Remind me to follow up") and three chips only: **Tomorrow**, **In 3 days**, **Pick a day**. Next week is removed.
   - Reminder set: one line "Reminder tomorrow, Thu 24 Nov" with **Change** (shows the chips again) and **Clear**. Under it a muted line saying we will email them then, only if they have an email on file (confirmed or pending; [[F48 Follow-up reminder emails]] sends it; until F48 lands, leave that line out or behind a flag so it never promises an email that is not sent).
   - "Mark as followed up" becomes a quiet text button in this block, not a full button. Followed up: "Followed up Thu 24 Nov · Undo", and the chips are hidden.
2. **Write to {first}** (drafting): one line of help ("Get a first draft for email, LinkedIn or WhatsApp. You edit it and send it yourself.") and one primary button **Draft a message** that opens the existing `FollowupComposer.vue`. Nothing else in this block.
- Order in the panel: messages thread, Follow up, Write to {first}, private note, tags, then the bottom row.
- Bottom row: **Save to contacts** stays a button; **Remove** and **Report** become quieter text buttons in one small row, Remove still asking to confirm.
- Follow [[Design System]] (paper, ink, one strap colour, spacing tokens). No new library; motion only from the existing tokens ([[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]]).

## Tasks
- [ ] F47.1 Rework the follow-up and drafting blocks and the bottom row in `CardConnection.vue`; update any guard in `test/` that reads the old buttons; browser check at 375 and 1280 px, light and dark, in all three states (no reminder, reminder set, followed up).

## Acceptance checks
- [ ] With no reminder, the Follow up block shows exactly three chips: Tomorrow, In 3 days, Pick a day. "Next week" appears nowhere in the panel.
- [ ] Tapping In 3 days sets the reminder to 9:00 three days ahead and the block reads "Reminder in 3 days, <date>" with Change and Clear.
- [ ] Draft a message is the only button in its own block and opens the composer; finishing a draft still marks the connection as followed up as before.
- [ ] Remove still asks to confirm; Report still opens its form.
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F22 AI follow-up drafts]] · [[F48 Follow-up reminder emails]] · back to [[00 Master To-Do]]
