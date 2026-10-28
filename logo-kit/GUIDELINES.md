# Lanyard logo — usage guide

**Idea:** a name badge with the lanyard slot at the top and an "L" cut out of it. The slot and the L are real holes, so the mark takes whatever is behind it.

## Files
- `lanyard-symbol-*.svg` — badge mark only (black, orange)
- `lanyard-horizontal-*.svg`, `lanyard-stacked-*.svg` — lockups (ink+orange, black, white)
- `lanyard-wordmark-ink.svg` — wordmark only
- `lanyard-app-icon.svg` — 512 px orange tile with cream badge
- `symbol-exports/` — favicon.ico/svg, PNG icon set, maskable icon, webmanifest, `head-snippet.html`
- `horizontal-exports/` — black / white / orange one-colour versions with 1200 px PNGs
- `build.py` — regenerates every SVG above (needs `fonttools` and `brotli`)

## Colour
| Role | Name | HEX | RGB |
|---|---|---|---|
| Primary | Lanyard Orange | `#D9502B` | 217 80 43 |
| Text / ink | Ink | `#1B1A17` | 27 26 23 |
| Background | Cream | `#F4F1EA` | 244 241 234 |

Orange with white or cream on it has about 4:1 contrast: fine for the large mark, not for small body text. CMYK and Pantone are not specified; get them matched by a printer.

## Clear space and size
- Keep clear space of one badge slot-width (the width of the slot, about 1/4 of the badge width) on all sides.
- Minimum: symbol 16 px on screen / 6 mm in print; horizontal lockup 24 px high; stacked lockup 48 px high.
- On orange backgrounds use the cream symbol (app icon) or the white lockup.

## Don't
- Don't recolour outside the palette, add shadows/gradients, rotate, or stretch.
- Don't set the L in another font or move the slot.
- Don't place the orange mark on busy photos or on red/orange backgrounds.

## Notes
- Wordmark is Atkinson Hyperlegible Next Bold (SIL OFL, which allows logo use), converted to outlines with slightly tightened spacing. It is the app's UI font.
- No trademark search has been done. Do one before relying on it commercially.
