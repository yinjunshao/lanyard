---
tags: [roadmap, feature, ui, onboarding]
id: F53
priority: P1
phase: 10
size: S
status: In progress
needs: []
---
# F53 Tag boxes and new suggestions

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"For the add your own separated by commas, that bit where they add in like tags, can you refresh the suggested words, because currently they're not like that good, even for students. They're like mediocre. It shouldn't be that hackathon focused. It's like in general, this could be anyone that uses the platform. This includes regular students that are not doing hackathons, people that are interested in finance or already working in finance. Also, don't have that many. It looks very cramped. Furthermore, for that bit, instead of having it by comma, if they press enter while texting, that makes it basically like ... a box, and then that's like one part, so they don't have to put like commas individually, because if it's like a box, and then that looks better."

## Current state
- `src/components/TagFields.vue`: "Come to me for" tags, a text input `form.tags` with commas (placeholder "hackathons, CV reviews, CAD", line 26), and suggestion chips by mode: student `["CV reviews", "internships", "hackathons", "startups", "coding help", "design", "finding a team", "research"]`, career `["Hiring", "Referrals", "Industry advice", "Mentoring", "Side projects"]` (lines 12-14). Used by welcome step 3 and Edit profile.
- `src/components/CardForm.vue` line 42: a card's own tags as comma text `f.tagsText`, placeholder from the profile or "hackathons, CV reviews"; `Cards.vue` turns it into a list with `tagList()`.
- The Worker's tag limits (count and length) are in `worker/index.js`; confirm the numbers and use them in the UI.

## Plan
- A tag input component `src/components/ui/UiTagInput.vue`: the tags show as boxes (chips, Design System chip style) inside one field-looking box, followed by a text input. **Enter** (and a typed comma, and Tab when there is text) turns the typed text into a box; Backspace on an empty input selects then removes the last box; each box has a remove button with an accessible name ("Remove Investing"); pasting "a, b, c" makes three boxes; duplicates (case-insensitive) are ignored; it stops at the server's maximum count and says so in a muted line; each box is trimmed to the server's length limit. Enter never submits the surrounding form. The model is still an array (or the same comma text the form sends today, so the Worker and saved data do not change).
- Boxes ease in with the existing pop token; removing fades out (transform and opacity only).
- Use it in `TagFields.vue` and `CardForm.vue`.
- New suggestions, **five per mode**, general, not hackathon-led, including finance, shown as a single row under the field; a suggestion already added is hidden; tapping one adds a box:
  - Student: "Internships", "Career advice", "Study groups", "Investing", "Side projects"
  - Career: "Hiring", "Mentoring", "Industry advice", "Finance", "Partnerships"
- Placeholder: "Type a topic and press Enter" (no examples in the placeholder, so it is never cramped).
- No public-page JS change.

## Tasks
- [x] F53.1 Build `UiTagInput.vue`; use it in `TagFields.vue` and `CardForm.vue`; new suggestions; update guards that read the old suggestions or the comma input; tests for the add, remove, paste, duplicate and limit rules; browser check at 375 and 1280 px, light and dark, with keyboard only.

## Acceptance checks
- [x] Typing "Investing" then Enter makes one box "Investing" and clears the input; the form is not submitted.
- [x] Pasting "Design, Finance, Design" makes two boxes.
- [x] Backspace on an empty input removes the last box (after it is first highlighted); the remove button on a box removes that box and is announced with its name.
- [x] At the server's maximum count, a further Enter adds nothing and a muted line says the limit.
- [x] Student mode shows exactly the five student suggestions; career mode the five career ones; none says "hackathons"; an added suggestion disappears from the row.
- [x] Saving Edit profile and a card stores the same tags as before (test that the request body is unchanged in shape).
- [x] `npm test` passes; public pages within budget.

## Log
- 2026-11-24 · Claude subagent (F53.1): "Come to me for" is now boxes. `src/components/ui/UiTagInput.vue` draws one field-looking box holding a chip per tag (a small remove button each, named "Remove <tag>") and a bare input, placeholder "Type a topic and press Enter" (then "Add another"). Enter, a typed comma or Tab-with-text makes a box; Enter is always prevented, so it never submits anything; a paste with commas or line breaks splits; a repeat (ignoring case) is skipped; a box is cut to the length limit; Backspace on an empty input highlights the last box and a second Backspace removes it (a polite status line says which); leaving the field turns pending text into a box, so Save never loses it; at the maximum Enter adds nothing and a muted line says so. A new box eases in with the pop token and a removed one fades out in 140 ms (transform and opacity only). The rules and the suggestions are in `src/lib/tags.js`. `TagFields.vue` (welcome step 3 and Edit profile) and `CardForm.vue` (a card's tags) use it; the suggestions are five a mode, one row under the field, an added one hidden: Student "Internships, Career advice, Study groups, Investing, Side projects", Career "Hiring, Mentoring, Industry advice, Finance, Partnerships". A card with no tags of its own says the profile's tags show instead (its old placeholder did that).
- What is saved is unchanged: the forms still hold the tags as the same comma text (`form.tags`, `f.tagsText`) and the save code in `StepFor.vue`, `EditProfile.vue` and `Cards.vue` is untouched (a guard compares it), so the request body is the same array of strings. Limits are the ones the app already sent (a profile 12 tags of 24 characters, a card 30 of 24); the Worker allows 30 of 60 (`worker/index.js`), so the UI is inside it and the Worker is not changed.
- A bug found in the browser and fixed before the commit: a parent hands a new list back only when it next draws, so two boxes made in the same moment (fast typing with commas, a paste) lost all but the last. The input now keeps its own copy of the list and the test covers it.
- Tests: new `test/tag-input.mjs` (88 checks) before the budget check; draws the real components on the server and runs the welcome step's own `save` and a card's `tagList` against the real Worker. No existing guard changed. Public pages: only non-public screens import the new files; PublicCard 48,830 to 48,847 B, PrivacyRequest 51,125 to 51,143 B (57 B left of 51,200; since F51 it has gone up 53 B with none of this on that page), Landing 45,537 B.
- Browser (local servers, a local test person): welcome step 3 at 1280 px light and 375 px light and dark with the real keyboard (type then Enter, comma, Backspace twice, Tab with text, Shift+Tab to a remove button and Enter on it, 12 tags then a 13th refused with the limit line and the suggestions gone); Edit profile in Student and Career mode (the two suggestion rows), a paste of "Design, Finance, Design" (two boxes, default prevented), Enter prevented; a card's editor in My cards at 375 px light (a box made, no submit). **Not looked at:** 1280 px in dark, a screen reader reading "Remove <tag>" (it is the button's `aria-label`, checked in the DOM and the test), and a Save pressed in the browser (checked through the real save code and Worker in the test).
- Owner steps: none beyond the usual push and deploy.

Related: [[F52 Rotating examples and better link examples]] · [[F11 Student and Career mode]] · back to [[00 Master To-Do]]
