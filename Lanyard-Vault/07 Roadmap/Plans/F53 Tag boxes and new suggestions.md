---
tags: [roadmap, feature, ui, onboarding]
id: F53
priority: P1
phase: 10
size: S
status: Not started
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
- [ ] F53.1 Build `UiTagInput.vue`; use it in `TagFields.vue` and `CardForm.vue`; new suggestions; update guards that read the old suggestions or the comma input; tests for the add, remove, paste, duplicate and limit rules; browser check at 375 and 1280 px, light and dark, with keyboard only.

## Acceptance checks
- [ ] Typing "Investing" then Enter makes one box "Investing" and clears the input; the form is not submitted.
- [ ] Pasting "Design, Finance, Design" makes two boxes.
- [ ] Backspace on an empty input removes the last box (after it is first highlighted); the remove button on a box removes that box and is announced with its name.
- [ ] At the server's maximum count, a further Enter adds nothing and a muted line says the limit.
- [ ] Student mode shows exactly the five student suggestions; career mode the five career ones; none says "hackathons"; an added suggestion disappears from the row.
- [ ] Saving Edit profile and a card stores the same tags as before (test that the request body is unchanged in shape).
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F52 Rotating examples and better link examples]] · [[F11 Student and Career mode]] · back to [[00 Master To-Do]]
