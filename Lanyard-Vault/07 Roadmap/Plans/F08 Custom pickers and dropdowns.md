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
- [ ] F08.2 `UiDatePicker` and `UiTimePicker`, then `UiDateTimePicker`. Unit-test the date maths (month lengths, leap years, BST/GMT changeover on the last Sunday of March and October).
- [ ] F08.3 `UiCombobox` (needed by F12).
- [ ] F08.4 Replace the host controls (`HostDashboard`, `HostLive`, `HostAccount`).
- [ ] F08.5 Replace the attendee controls (`MyCard`, `People`, `CardForm`, `FeedbackEditor`, `PrivacyRequest`, `PublicCard` lazily).
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
