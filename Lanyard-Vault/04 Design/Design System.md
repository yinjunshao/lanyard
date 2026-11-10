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
- 1px borders not shadows; 4-6px radius; no hover effects; almost no animation (shutter flash on selfie).
- Contrast 4.5:1 text; tap targets 44px; every input labelled.
- No gradients, glass, emoji, sparkle icons, "New" pills, or centred three-card hero.
- Tabular figures, no monospace; labels in small caps with slight spacing.
- Pickers: no native `<select>`, date or time inputs. Use `UiSelect`, `UiCombobox`, `UiDatePicker`, `UiTimePicker`, `UiDateTimePicker` from `src/components/ui/` (bottom sheet under 600 px, popover above). Same rules as the rest: 1px borders, no shadows, 44px targets, at most a 120 ms fade and none under `prefers-reduced-motion`. See [[F08 Custom pickers and dropdowns]] and [[D018 Hand-built pickers outside the shared Vue chunk]].
- Performance: under 50 KB JS on public pages; profile pages under 1 s on 4G.

Related: [[Brand and Logo]], [[Features]]
