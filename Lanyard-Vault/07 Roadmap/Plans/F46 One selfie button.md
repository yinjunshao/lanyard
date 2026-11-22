---
tags: [roadmap, feature, ui]
id: F46
priority: P0
phase: 9
size: S
status: Not started
needs: []
---
# F46 One selfie button

**Priority:** P0 · **Phase:** 9 Owner requests (2026-11-22) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-22)
"For the button during when basically someone connects with me in the screenshot thing, there is currently a button and also a logo. Can you make that just like a single button? Because people keep clicking on the logo and not the take a selfie button, and it's a bit like misleading in terms of UI."

## Current state
- `src/components/ConnectSheet.vue` "Shared selfie (optional)" (about lines 168-178): a 64 px round avatar with a camera icon (`avatar avatar-initial`, not clickable) beside a `<label for="sheet-selfie" class="btn">Take a selfie together</label>`. People tap the camera circle, which does nothing.
- `src/views/Connect.vue` has the same pattern (60 px camera circle and "Take selfie").
- Check any other place with a camera circle next to a photo button that does nothing (for example `EventPresence.vue`, `CardConnection.vue`, the welcome photo step) and list what you find; change only the connect ones unless another has the same dead circle.

## Plan
- Before a photo: one full-width button (the existing `.file-picker` label pattern, so the keyboard focus ring still works) with the camera icon inside it and the words "Take a selfie together". No separate circle.
- After a photo: the preview (tap does nothing, so make it look like a picture, not a button) with "Retake" and "Remove" beside or under it, then the existing consent tick.
- Same on `Connect.vue`. Keep the input `capture="user"` and the lazy photo code.
- Public card budget: the sheet is a lazy chunk; keep it so.

## Tasks
- [ ] F46.1 One selfie button on the connect sheet and the Connect page; test guard in `test/ui.mjs` (no `avatar-initial` camera circle in the selfie field); browser check at 375 and 1280 px, light and dark.

## Acceptance checks
- [ ] On a card you are not connected to, the selfie field shows exactly one control, a button with a camera icon and "Take a selfie together"; tapping anywhere on it opens the camera or file picker.
- [ ] After choosing a photo the preview shows with Retake and Remove; Remove brings the single button back and clears the consent tick.
- [ ] Keyboard: Tab reaches the button, the focus ring shows, Enter or Space opens the picker.
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F47 Tidy follow-up section]] · back to [[00 Master To-Do]]
