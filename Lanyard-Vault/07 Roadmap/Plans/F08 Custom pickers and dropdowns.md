---
tags: [roadmap, feature, ui, components]
id: F08
priority: P1
phase: 1
size: L
status: Done
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
- [x] F08.6 `Admin.vue` last (optional).
  - The promo code "Ends (optional)" date is now `UiDatePicker` (clearable, earliest day today); the value is still `YYYY-MM-DD`, so the Worker is untouched. The grep guard in `test/pickers.mjs` no longer exempts Admin, so `src/` has no native `<select>` or date input at all.
  - Not opened in a browser (the admin page needs the admin token, which I did not use). The same component was checked elsewhere.
- [x] F08.7 Keyboard-only and screen-reader pass (VoiceOver or NVDA): every control can be reached, opened, chosen from and closed.
  - **Done: the keyboard-only pass and an ARIA check. Not done: a real screen reader** (I cannot run VoiceOver or NVDA; it is an owner step, see the Log).
  - Keyboard, in a local browser (Chrome engine): every picker was reached with Tab, opened with Enter, Space or Down, chosen from and closed. `UiSelect`: Down/Up skip disabled rows, Home/End, type-ahead, Enter or Space chooses, Tab chooses and moves on, Esc closes, focus stays on the button. `UiDatePicker`: arrows, Home/End, Page Down, stops at min and max, Tab cycles inside the dialog (and Shift+Tab back), Esc closes. `UiTimePicker`: typed `6.30pm`, `7pm`, Up/Down, Enter. `UiCombobox`: a letter on the button opens it with that letter typed, Down and Enter choose, custom row. Focus returned to the button every time and the page behind was `inert` while open. Whole flow with the keyboard only: new event on the host dashboard (name, date, typed time, "2 hours after the start", Enter on Create).
  - Roles and attributes against the WAI-ARIA patterns: `UiSelect` is a select-only combobox (`role=combobox`, `aria-haspopup=listbox`, `aria-expanded`, `aria-controls` only while open, `aria-activedescendant`; list `role=listbox`, rows `role=option` with `aria-selected` and `aria-disabled`; accessible name is the visible label plus the value). `UiDatePicker` follows the date picker dialog (button `aria-haspopup=dialog`; `role=dialog` `aria-modal` with a label; month grid `role=grid` named by the month heading, `aria-live` for month changes, day buttons named in full such as "Wednesday 11 November 2026, today", `aria-selected`, `aria-current=date`). `UiTimePicker` and `UiCombobox` put a `role=combobox` text box (`aria-autocomplete`, `aria-activedescendant`, `aria-controls`) over a listbox in a labelled modal dialog on phones, with a polite status line for the result count or an error. Every text label sits on the button through `aria-labelledby`.
  - Native controls kept: **none**. Every field in the plan table moved to a custom control.

## Acceptance checks
- [x] No `<select>`, `type="date"` or `type="datetime-local"` is left in `src/` (except Admin, if deferred). Check with a grep. (None left, Admin included; `test/pickers.mjs` greps every `.vue` file for `<select`, `type="date"`, `datetime-local`, `time`, `month`, `week`.)
- [x] A host can create an event with start and end times using only the keyboard. (Done in a local browser against local Wrangler: 11 Nov 19:00 to 21:00, saved and shown again on the Details tab. Details under F08.7.)
- [x] Times survive a round trip across the clocks-change weekend. (`test/dates.mjs`, zone fixed to Europe/London: every quarter hour on the Saturday, Sunday and Monday of the March and October 2026 changes, except the one hour that does not exist, comes back unchanged. A stored time is never rewritten unless the host edits it. Not tried in a browser set to the clock-change weekend itself.)
- [x] F08 adds no JS to the first load of public pages. The public-page budget itself (50 KB) is not met and is not part of F08: those pages were already over it, and [[F28 Public-page JS budget]] owns the fix. (Measured gzip, entry plus static imports plus the page's own chunk, from `dist/` before and after: Landing 65,738 B before, 65,613 B after (64.2 to 64.1 KB); public card 59,665 B before, 59,642 B after (58.3 to 58.2 KB). The calendar and `UiSheet` are in lazy chunks the card fetches only on "Pick a date".)

## Risks
Custom controls are easy to make less accessible than native ones. If a control can't meet the keyboard and screen-reader checks, keep the native one for that field and note why here.

## Log
- 2026-11-10 (Claude subagent): `src/components/ui/` has `UiSheet`, `UiSelect`, `UiCombobox`, `UiDatePicker`, `UiTimePicker` and `UiDateTimePicker`; all 18 native selects and date inputs in `src/` (host, attendee, public card and Admin) now use them, and a source guard keeps native ones out. Date maths is `src/lib/dates.js` (tested in `test/dates.mjs`, 50 checks, with the zone fixed to Europe/London), search matching `src/lib/match.js` (`test/pickers.mjs`, 20 checks). `/ui-test` shows every picker and is registered only under `vite dev`.
- Time zone assumption: the person using it (owner and hosts) is in the UK, so the browser's zone is Europe/London; event times are read and written in the viewer's own zone, as `datetime-local` did. Forms now hold event start and end as unix ms or null (the API already took ms); a time in the skipped spring hour becomes the next hour, one in the repeated autumn hour is the first.
- Public-page JS: no growth. gzip bytes, entry + static imports + page chunk, `dist/` after `npm run build`: Landing 65,738 to 65,613; public card 59,665 to 59,642 (64.2 to 64.1 KB and 58.3 to 58.2 KB). Both pages are still over 50 KB (F28). First version had grown the shared Vue chunk by about 0.7 KB gzip; swapping `Teleport`, `useId`, a compiled `<slot>` and `defineAsyncComponent` for plain code removed that ([[D018 Hand-built pickers outside the shared Vue chunk]]).
- API for [[F12 Institution picker]]: `UiCombobox` with `v-model` (option value), `v-model:text`, `allow-custom`, `custom-label`, `@select`. Options are `{ value, label, aliases }`.
- Left over: **a screen-reader pass (VoiceOver or NVDA) is still an owner step**; I checked roles, names, states and focus in the DOM and by keyboard only. Not opened in a browser: the Admin promo form (needs the admin token), the People event filter, and the Remind me chip on a real public card (checked on `/ui-test` instead). The clock-change weekend was tested in Node only. Each picker leaves one empty `<div class="ui-portal">` in `<body>`.
- One of my full `npm test` runs once failed a 36-check file (probably `test/codes.mjs`, by its count) and passed on the next ten runs; I did not capture which check. Worth watching for a flaky timing test.
- Test data: I made a throwaway host and event in the **local** D1 (`.wrangler/`, ignored by git) to test; nothing was sent to production.

### Owner steps
- Review the F08 commits, `git push`, then `npm run deploy`. No migrations.
- Try each picker with VoiceOver (Safari, iPhone) or NVDA (Windows), especially the calendar and the time list, and tell me if anything is read badly. If a control cannot be made to work for a field, the plan says to put the native one back for that field.
- Try the event form on a phone once.

Related: [[Design System]] · back to [[00 Master To-Do]]
