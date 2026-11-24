---
tags: [design]
---
# Design System

**Concept:** a physical ID badge. Portrait card, punched slot, photo, labelled fields like a printed pass. Everything else stays quiet. See [[D010 Paper, ink and one strap colour]].

## Tokens
```css
--paper: #F4F1EA; --ink: #1B1A17; --graphite: #6B675F;
--rule: #DAD5CA; --strap: #D9502B;  /* Persimmon */
--radius: 6px; --space: 8px;
--font: "Atkinson Hyperlegible Next", system-ui, sans-serif;
```

## Themes (interface fixed; only theme changes)
| Theme | Use |
| --- | --- |
| Default | Paper, ink, Persimmon strap |
| Formal | Banking, law, consulting, careers fairs; monochrome, navy-grey strap `#2B3138` |
| Night | Socials; ink background, paper text, Persimmon strap |
| Host brand | Paid events; host colour on the strap only |

## Rules
- One primary action per screen, bottom thumb zone, Persimmon.
- 1px borders not shadows; 4-6px radius; no hover effects; motion only as set out under Motion below (and the shutter flash on a selfie).
- Contrast 4.5:1 text; tap targets 44px; every input labelled.
- No gradients, glass, emoji, sparkle icons, "New" pills, or centred three-card hero.
- Tabular figures, no monospace; labels in small caps with slight spacing.
- Pickers: no native `<select>`, date or time inputs. Use `UiSelect`, `UiCombobox`, `UiDatePicker`, `UiTimePicker`, `UiDateTimePicker` from `src/components/ui/` (bottom sheet under 600 px, popover above). Same rules as the rest: 1px borders, no shadows, 44px targets, a bottom sheet that slides and a popover that fades, by the Motion tokens. See [[F08 Custom pickers and dropdowns]] and [[D018 Hand-built pickers outside the shared Vue chunk]].
- Motion (F40): sheets, panels, dialogs and tabs move, so a change reads as a change, and only in the ways below. See [[F40 Motion for sheets panels and tabs]] and [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]].
- Rotating examples (F52): an empty text field may show an example that swaps for the next every 3.5 s: the old line rises and fades out (140 ms), the new one rises in from below (200 ms), by `--shift` and the tokens, so under reduced motion it is a fade. The overlay is `aria-hidden`, takes no clicks, goes at the first keystroke, and the input keeps a static placeholder.
- Tag boxes (F53): a tag the person types becomes a chip (the chip style, with a small remove button) inside one field-looking box; a new one eases in with the pop token and a removed one fades out, both on the motion tokens. Suggestions are five a mode under the field, and one already added is hidden.
- Elastic (F42): a sliding bar (the tab bar's bar, and a segmented control that glides, the host event tabs and Settings' appearance) overshoots slightly and settles, on `--ease-spring` (a `linear()` spring, about 7% overshoot, with a `cubic-bezier` fallback) over `--dur-elastic` 420 ms. That is the one named exception to the 300 ms rule; nothing else may be over 300 ms, and the elastic token is never over 450 ms. A tap while the bar is still moving, or a third tap within about 600 ms, jumps it with no transition, and the next calm tap springs again. Only real sliders get it; chips and plain segmented pickers still change at once. See [[D046 Elastic spring for sliding bars, with a spam skip]].
  - Only `transform` and `opacity` move (a `<details>` may also ease its height where the browser can). Nothing runs over 300 ms, and a thing leaves faster than it arrives. Durations and curves are the tokens in `:root` (`--dur-fast` 120 ms, `--dur` 200 ms, `--dur-sheet` 260 ms in, `--dur-sheet-out` 200 ms out, `--ease-out`, `--ease-in`); never write a time in a component.
  - A phone sheet slides up from the bottom and down again, with its dim fading beside it; a centred dialog or a popover drops 8 px and fades; the preview panel slides in from the right. Closing is quicker than opening. A dialog stays in the page until its exit ends and takes no clicks while it leaves; the page behind and focus wait for the exit.
  - A phone sheet can be swiped down by its handle or, with the content at the top, anywhere; past 30% of its height or a flick closes it, a short drag springs back, and scrolling its content never closes it.
  - New content fades in; the first six rows of a list rise in 30 ms apart; a new page in the signed-in frame fades in over 120 ms; one bar slides between the tabs; a `<details>` eases open.
  - `prefers-reduced-motion: reduce` turns every slide into a short fade (one block in `main.css` redefines the tokens). No animation library and no Vue `<Transition>`: both cost public pages bytes.
- Waiting: grey blocks in the shape of the content (`--rule` on paper, no new colour) with one soft sweep that stops under `prefers-reduced-motion`; the region is `aria-busy` with one polite message; after about 8 seconds it says it is taking longer than usual and offers Try again; a button that sends is disabled and says "Saving…". Public pages do this with CSS only. See [[F38 Loading states]] and [[D043 Waiting states are CSS on public pages and one component elsewhere]].
- Errors: say what happened and what to do, in plain words, with no code, status number or library English, no blame and no exclamation mark; the Worker writes them, the vague ones stay vague. See [[F39 Informative error messages]] and [[D044 Errors say what happened and what to do, and the vague ones stay vague]].
- Performance: under 50 KB JS on public pages; profile pages under 1 s on 4G.

Related: [[Brand and Logo]], [[Features]]
