# Host video SFX, exec'd by synth.py (uses its helpers and buffers)
def scratch(dur=0.22):
    n = int(dur * SR); t = tt(n)
    x = hp(lp(rng.standard_normal(n), 4500), 1200)
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 38 * t) ** 2
    return x * env(n, a=0.01, r=dur / 2.5)

# hook: sheet lands, pencil scratches per row (16ths), red marks
add(sfx, whoosh(0.4, 500, 2200, 0.04), 0.0)
rows = [r for r in range(15) if r not in (9, 12, 13, 14)]
for r in rows:
    add(sfx, scratch() * 0.07, 0.375 + r * 0.125)
for i, m in enumerate([64, 62]):
    p = lp(pluck(m, 0.5, 0.4), 1800) * 0.07
    add(sfx, p, 2.75 + i * 0.25); add(send, p, 2.75 + i * 0.25)
# problem cards: low pluck thud each
for at, m in ((5.25, 57), (6.0, 55), (6.75, 53)):
    p = pluck(m, 0.6, 0.5) * 0.1
    add(sfx, p, at); add(send, p * 0.7, at)
    add(sfx, whoosh(0.3, 400, 1600, 0.03), at - 0.1)
# riser + reveal
add(sfx, whoosh(1.0, 300, 6000, 0.07), 8.0)
n = int(1.4 * SR); tb = tt(n)
add(sfx, np.sin(2 * np.pi * (40 + 40 * np.exp(-tb / 0.05)) * tb) * np.exp(-tb / 0.35) * 0.35, 9.0)
for m in (72, 76, 79): add(sfx, bell(m) * 0.05, 9.0); add(send, bell(m) * 0.05, 9.0)
# browser window in
add(sfx, whoosh(0.5, 600, 3000, 0.04), 11.0)
# faces land in the QR: rising C-major pentatonic, one per face
scale = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]
for i in range(16):
    at = 11.875 + i * 0.125 + 0.5
    p = pluck(scale[i] - 12 if i < 6 else scale[i] - 12, 0.3) * 0.055
    add(sfx, p, at); add(send, p * 0.8, at)
# connection pings
for i in range(8):
    at = 14.75 + i * 0.375
    m = [79, 84, 81, 86, 84, 88, 86, 91][i]
    add(sfx, pluck(m, 0.25) * 0.045, at); add(sfx, pluck(m + 5, 0.3) * 0.035, at + 0.0625)
    add(send, pluck(m + 5, 0.3) * 0.03, at + 0.0625)
# tap Report, view swap, report blocks
add(sfx, tick() * 0.12, 17.95)
add(sfx, whoosh(0.4, 700, 2800, 0.035), 18.0)
for i in range(6):
    add(sfx, pluck([72, 74, 76, 79, 81, 84][i], 0.3) * 0.04, 18.25 + i * 0.25)
# outro bell
for m in (72, 76, 79, 84): add(sfx, bell(m, 2.2) * 0.045, 22.5); add(send, bell(m, 2.2) * 0.06, 22.5)
add(sfx, tick() * 0.08, 23.0)
