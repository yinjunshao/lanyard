---
tags: [roadmap, feature, ui]
id: F05
priority: P0
phase: 0
size: S
status: Done
needs: []
---
# F05 QR icon for My card tab

**Priority:** P0 · **Phase:** 0 Quick fixes · **Size:** S · **Needs:** nothing · back to [[00 Master To-Do]]

## What the owner asked for
Change the My card tab icon to a QR code icon that matches the other icons.

## Current state
`src/components/Icon.vue` draws every icon as 24×24 strokes, `stroke-width 1.8`, round caps and joins. The `card` icon is a rectangle with a line. `src/App.vue` tabs use `key: "card"` as the icon name.

## Plan
Add a `qr` icon in the same style: three rounded finder squares plus a few short strokes for the data area. A starting point (tune it by eye):
```html
<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/>
<rect x="4" y="14" width="6" height="6" rx="1.2"/>
<path d="M14 14h2.5M14 17.5v2.5M17.5 17h2.5M20 14v.01M17 20h3"/>
```
Use `qr` for the My card tab. Keep `card` for other places that use it.

## Tasks
- [x] F05.1 Add the icon and switch the tab.
- [x] F05.2 Check it at 24 px and 20 px, in light and dark, next to Scan and People. The stroke weight must match, and it must not look filled or heavier.

## Acceptance checks
- [x] Tab bar shows a QR glyph for My card. The active and inactive colours behave like the other tabs.

## Log
- 2026-11-10 (Claude subagent): the My card tab now shows a `qr` glyph (`src/components/Icon.vue`), drawn in the same 24 px stroke style as Scan and People. `App.vue` tabs take an optional `icon` name; the card icon stays for other uses.
- Checked in a local browser (dev servers, a test profile) at 375 px in light and dark: the glyph matches the stroke weight of Scan and People, and the active tab is ink while the others are graphite. The 20 px check used a copy of the glyphs placed on the page, not the real tab bar.
- `test/ui.mjs` (in `npm test`) guards the icon and the tab wiring. Nothing else left over.

### Owner steps
- Review the F05 commits, `git push`, then `npm run deploy`. No migrations.

Related: [[Design System]], [[F15 Events tab and event hub]] (adds a fourth tab icon in the same style) · back to [[00 Master To-Do]]
