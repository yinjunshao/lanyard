from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
f = instancer.instantiateVariableFont(TTFont('../public/fonts/atkinson-latin.woff2'), {'wght': 700})
gs, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f['hmtx']
def word(text, size, track=0):
    s = size / 1000; x = 0; paths = []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, lambda v: f"{v:.1f}")
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, 0)))
        paths.append(pen.getCommands()); x += hmtx[g][0] * s + track
    bp = BoundsPen(gs); 
    return ''.join(paths), x - track
# symbol (256 canvas): badge, lanyard slot and L are real holes
BADGE = "M88 24H168A32 32 0 0 1 200 56V200A32 32 0 0 1 168 232H88A32 32 0 0 1 56 200V56A32 32 0 0 1 88 24Z"
SLOT = "M104 44H152A8 8 0 0 1 160 52V52A8 8 0 0 1 152 60H104A8 8 0 0 1 96 52V52A8 8 0 0 1 104 44Z"
L = "M88 96H116V176H168V204H88Z"
SYM = BADGE + SLOT + L
def sym(fill, extra=''): return f'<path fill-rule="evenodd" fill="{fill}" d="{SYM}"{extra}/>'
def svg(vb, body, title): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img"><title>{title}</title>{body}</svg>\n'
INK, ORG, CRM = '#1B1A17', '#C4441E', '#F4F1EA'
wp, ww = word('lanyard', 150, -2)
# horizontal: baseline so x-height centre ~ badge centre (128); x-height ~ 0.5*size
bl = 128 + 150*0.255
def horiz(sc, wc): return svg(f"0 0 {int(56+... if False else 0)}", '', '')
x0 = 56; gap = 36
def lockup_h(symcol, wordcol, bg=None):
    W = 200 + gap + ww - 56 + 0
    body = (f'<rect x="56" y="0" width="{W+8:.0f}" height="256" fill="{bg}"/>' if bg else '') if False else ''
    body = sym(symcol) + f'<path fill="{wordcol}" transform="translate({200+gap:.1f} {bl:.1f})" d="{wp}"/>'
    return svg(f"56 0 {200+gap+ww-56:.1f} 256", body, "Lanyard logo")
# stacked: symbol above wordmark
sw, _ = word('lanyard', 120, -1.5)
_, sww = word('lanyard', 120, -1.5)
def lockup_s(symcol, wordcol):
    body = sym(symcol) + f'<path fill="{wordcol}" transform="translate({128-sww/2:.1f} 340)" d="{sw}"/>'
    vb_x = min(56, 128 - sww/2) - 8; vb_w = max(144, sww) + 16
    return svg(f"{vb_x:.1f} 8 {vb_w:.1f} 360", body, "Lanyard logo, stacked")
out = {
 'lanyard-symbol-black.svg': svg('0 0 256 256', sym('#000'), 'Lanyard symbol'),
 'lanyard-symbol-orange.svg': svg('0 0 256 256', sym(ORG), 'Lanyard symbol'),
 'lanyard-horizontal-ink.svg': lockup_h(ORG, INK),
 'lanyard-horizontal-black.svg': lockup_h('#000', '#000'),
 'lanyard-horizontal-white.svg': lockup_h('#fff', '#fff'),
 'lanyard-stacked-ink.svg': lockup_s(ORG, INK),
 'lanyard-stacked-black.svg': lockup_s('#000', '#000'),
 'lanyard-wordmark-ink.svg': svg(f"-4 -130 {ww+8:.1f} 170", f'<path fill="{INK}" d="{wp}"/>', 'lanyard'),
 'lanyard-app-icon.svg': svg('0 0 512 512', f'<rect width="512" height="512" fill="{ORG}"/><g transform="translate(96 96) scale(1.25)">{sym(CRM)}</g>', 'Lanyard app icon'),
}
for k, v in out.items(): open(k, 'w', encoding='utf-8').write(v)
print(list(out))
