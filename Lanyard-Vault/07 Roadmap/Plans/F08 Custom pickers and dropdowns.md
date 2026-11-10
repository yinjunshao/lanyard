---
tags: [roadmap, feature, ui, components]
id: F08
priority: P1
phase: 1
size: L
status: In progress
needs: []
---
# F08 Custom pickers and dropdowns

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** L · **Needs:** nothing · **Unlocks:** [[F09 Settings in category pages]], [[F11 Student and Career mode]], [[F12 Institution picker]], [[F18 Live previews for cards and events]] · back to [[00 Master To-Do]]

## What the owner asked for
Replace the browser's default date and calendar panels, dropdowns and so on with better-designed, smoother ones.

## Current native controls (2026-11-10)
| File | Control |
| --- | --- |
| `HostDashboard.vue` ~268, 275, 335, 428, 447 | `<select>` (frequency, size, kind, start-from, theme) |
| `HostDashboard.vue` ~438, 440 | `datetime-local` (starts, ends) |
| `HostLive.vue` ~238, 239 | `datetime-local` |
| `HostAccount.vue` ~271 | `<select>` (ticket kind) |
| `PublicCard.vue` ~320 | `type="date"` (remind me on a date) |
| `MyCard.vue` ~352, `People.vue` ~84, `PrivacyRequest.vue` ~56, `CardForm.vue` ~33, `FeedbackEditor.vue` ~84, 103 | `<select>` |
| `Admin.vue` ~233 | `type="date"` (admin only, lowest priority) |
| `src/lib/time.js` | `toLocalInput` / `fromLocalInput` helpers for `datetime-local` |

## Components to build (`src/components/ui/`)
| Component | Does | Notes |
| --- | --- | --- |
| `UiSelect.vue` | Single choice from a short list | Button shows the value. A popover opens below on desktop, a bottom sheet on phones (< 600 px). Keyboard: Up/Down, Home/End, type-ahead, Enter, Esc. Follows the WAI-ARIA "select-only combobox" pattern. |
| `UiCombobox.vue` | Searchable list with free text | Used by [[F12 Institution picker]]. Can offer a "Use what I typed" option. Matches names and aliases, highlights the match. |
| `UiDatePicker.vue` | Calendar month grid | Weeks start on Monday (UK). Min/max dates, "Today" button, arrow-key day moves, PageUp/PageDown months. Shows `Tue 4 Nov 2026` (`Intl.DateTimeFormat("en-GB")`). |
| `UiTimePicker.vue` | Time in 15-minute steps | A scrolling list with typed input allowed ("18:30", "6.30pm"). |
| `UiDateTimePicker.vue` | Date and time together | Returns a unix-ms value, like `fromLocalInput`. End time defaults to start + 2 h. |
| `UiSheet.vue` | Shared bottom sheet / popover shell | Focus trap, Esc closes, returns focus, `inert` behind. |

All of them:
- Use `v-model` with the same value types the forms use today, so swapping is a one-line change per field.
- Follow [[Design System]]: paper and ink, 1 px borders not shadows, 4-6 px radius, 44 px targets, labelled.
- "Smoother" means no layout jump and instant response, not animation. At most a 120 ms fade or slide, none under `prefers-reduced-motion`.
- Work in both light and dark tokens.
- Load lazily. `PublicCard.vue` is a public page with a 50 KB JS budget, so its date picker loads with `defineAsyncComponent` only when "Remind me on a date" is tapped.

## Tasks
- [x] F08.1 `UiSheet` and `UiSelect`, plus a test page for agents to check by eye (remove or hide it before finishing).
  - Test page: `/ui-test` (`src/views/UiTest.vue`), registered only when `import.meta.env.DEV`, so `npm run build` leaves it out (checked: no `UiTest` file in `dist/`). Hidden, not removed, so later tasks can add their pickers to it.
  - Checked in a local browser at 1280 px (popover, keyboard: Down skips a disabled option, Enter chooses, Esc closes, type-ahead, focus stays on the button) and 375 px (bottom sheet, focus on the listbox, page `inert`, body scroll locked, focus returns to the button).
- [x] F08.2 `UiDatePicker` and `UiTimePicker`, then `UiDateTimePicker`. Unit-test the date maths (month lengths, leap years, BST/GMT changeover on the last Sunday of March and October).
  - Date maths is in `src/lib/dates.js` (no Vue). `test/dates.mjs` (50 checks, wired into `npm test`) sets `process.env.TZ = "Europe/London"` first and asserts the zone took effect, so it does not depend on the machine's zone. It covers month lengths, leap years, Monday-first grids, typed times, and every quarter hour on the Saturday, Sunday and Monday of both clock-change weekends.
  - Value types: `UiDatePicker` takes and gives `"YYYY-MM-DD"` (like `type="date"`), `UiTimePicker` `"HH:mm"`, `UiDateTimePicker` a unix-ms number or `null` (like `fromLocalInput`; forms that held the `datetime-local` string will hold ms instead). The date-time picker has `clearable` for optional fields and `suggest` for the end time (one tap to start + 2 hours).
  - Clock changes: a time that does not exist (01:30 on the spring Sunday) becomes 02:30 BST, and a time that happens twice is the first one. A stored time is never rewritten unless the host edits it.
  - Checked in a local browser: calendar keys (arrows, Home/End, Page Down, min/max stop at the limit), Enter chooses and focus returns to the button, the time list takes `6.30pm`, and the phone sheet at 375 px in dark mode.
- [x] F08.3 `UiCombobox` (needed by F12).
  - API for [[F12 Institution picker]]: `options` = `[{ value, label, aliases }]`; `v-model` is the option's `value` (null when custom or empty); `v-model:text` is what the field shows (the official name, or the custom text as typed); `@select` gives `{ value, label, custom }`. `allow-custom` adds the last row and `custom-label` sets its words (F12 passes `(t) => "Not listed? Use '" + t + "'"`). `clearable`, `limit` (60 rows shown) and `placeholder` are there too.
  - Matching is in `src/lib/match.js` (case and accents ignored, word starts first, aliases, highlight ranges); `test/pickers.mjs` (15 checks, in `npm test`) covers it with made-up names.
  - Checked in a local browser: a letter on the button opens it with that letter typed, an alias (`ncl`) finds the long name, Down and Enter choose, a custom row keeps the typed text with a null value, focus returns to the button.
- [x] F08.4 Replace the host controls (`HostDashboard`, `HostLive`, `HostAccount`).
  - `HostDashboard`: the two frequency selects, size, start-from, theme, and Starts / Ends. `HostLive`: Starts / Ends. `HostAccount`: the ticket kind. Event start and end are now held as unix ms (or null) in the forms, so `fromLocalInput` / `toLocalInput` are no longer called from the host screens (the helpers stay in `src/lib/time.js`).
  - The old `<label for>` became `<label id>` plus `labelledby`, because a label click on a button would open the list.
  - Checked against local Wrangler and Vite with a throwaway local host (made through the API; nothing touched production): created an event with the keyboard only (name, start date, typed time `7pm`, "Set to 2 hours after the start", Enter on Create). It saved 11 Nov 19:00 to 21:00 and the Details tab shows the same back. Looked at the Details form at 1280 and 375 px (dark).
- [x] F08.5 Replace the attendee controls (`MyCard`, `People`, `CardForm`, `FeedbackEditor`, `PrivacyRequest`, `PublicCard` lazily).
  - `MyCard` (switch card), `People` (filter by event), `CardForm` (theme), `FeedbackEditor` (template, answer type), `PrivacyRequest` (kind) now use `UiSelect`. `PublicCard`'s "Remind me on a date" is a "Pick a date" chip that fetches `UiDatePicker` with a plain `import()` when tapped and opens it in "bare" mode (no button of its own, anchored to the chip, earliest day today).
  - Why not `defineAsyncComponent` (the plan's suggestion): measured, it adds about 2 KB (raw) to the Vue runtime chunk that every public page loads. A plain dynamic import does the same job for nothing. Same reason `UiSheet` has no `Teleport`, `useId` or `<slot>` (each added to that shared chunk). `test/pickers.mjs` guards this.
  - Public JS, gzip, entry + static imports + page chunk, measured from `dist/` before and after (see Log): no growth.
  - Checked in a local browser against a throwaway local account: My card "Switch card" (listed both cards, chose the second), card editor Theme, the privacy request kind (the `?kind=erasure` link preselects it), and the feedback editor (template list, then the answer-type list on each question). **Not checked in a browser:** the People event filter (it needs a connection made at an event) and the Remind me date chip on a real public card (needs a second account); the chip's code path was checked on `/ui-test` instead.
- [ ] F08.6 `Admin.vue` last (optional).
- [ ] F08.7 Keyboard-only and screen-reader pass (VoiceOver or NVDA): every control can be reached, opened, chosen from and closed.

## Acceptance checks
- [ ] No `<select>`, `type="date"` or `type="datetime-local"` is left in `src/` (except Admin, if deferred). Check with a grep.
- [ ] A host can create an event with start and end times using only the keyboard.
- [ ] Times survive a round trip across the clocks-change weekend.
- [ ] Public-page JS budget is still under 50 KB.

## Risks
Custom controls are easy to make less accessible than native ones. If a control can't meet the keyboard and screen-reader checks, keep the native one for that field and note why here.

## Log
-

Related: [[Design System]] · back to [[00 Master To-Do]]
