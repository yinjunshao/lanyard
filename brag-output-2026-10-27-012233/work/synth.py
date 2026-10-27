# 120 BPM soundtrack + in-key SFX for the Lanyard brag video -> work/audio.wav
import sys, wave
import numpy as np

SR = 44100
DUR = 24.5
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def tt(n): return np.arange(n) / SR

def env(n, a=0.005, r=0.3, hold=0.0):
    t = tt(n)
    e = np.minimum(1, t / max(a, 1e-4))
    rel = np.where(t > a + hold, np.exp(-(t - a - hold) / r), 1.0)
    return e * rel

try:
    from scipy.signal import lfilter
except ImportError:
    lfilter = None

def lp(x, cutoff):
    # one-pole low-pass; cutoff can be an array (sweeps)
    if lfilter is not None and np.isscalar(cutoff):
        a = np.exp(-2 * np.pi * cutoff / SR)
        return lfilter([1 - a], [1, -a], x)
    c = np.broadcast_to(np.asarray(cutoff, float), x.shape)
    a = np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); s = 0.0
    for i in range(len(x)):
        s = (1 - a[i]) * x[i] + a[i] * s
        y[i] = s
    return y

def hp(x, cutoff): return x - lp(x, cutoff)

def add(buf, sig, at):
    i = int(round(at * SR))
    if i >= len(buf): return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]

music = np.zeros(N); sfx = np.zeros(N); send = np.zeros(N)

# ---- chords (root-position triads + octave), changes on beats ----
A3, C4, E4, F3, G3 = 57, 60, 64, 53, 55
CH = {
    'Am': [57, 60, 64, 69], 'F': [53, 57, 60, 65], 'C': [48, 55, 60, 64, 67],
    'G': [55, 59, 62, 67], 'Csus': [48, 55, 60, 62, 67],
}
prog = [(0, 'Am'), (2, 'F'), (4, 'Am'), (6, 'F'), (8, 'G'),
        (9, 'C'), (11, 'G'), (13, 'Am'), (15, 'F'), (17, 'C'), (19, 'G'), (21, 'F'), (22.5, 'C')]
ends = [p[0] for p in prog[1:]] + [DUR]

def pad_voice(f, n, bright):
    t = tt(n)
    x = np.zeros(n)
    for d in (-0.08, 0.0, 0.07):           # detuned saws
        ph = (t * f * 2 ** (d / 12)) % 1.0
        x += 2 * ph - 1
    x /= 3
    return lp(x, bright)

for (st, name), en in zip(prog, ends):
    n = int((en - st + 0.6) * SR)
    bright = 700 if st < 9 else 1600
    v = sum(pad_voice(midi(m), n, bright) for m in CH[name]) / len(CH[name])
    e = env(n, a=0.12, r=0.35, hold=en - st)
    gain = 0.10 if st < 9 else 0.11
    if st >= 22.5: e = env(n, a=0.05, r=0.9, hold=0.6)
    add(music, v * e * gain, st); add(send, v * e * gain * 0.6, st)

# ---- bass ----
roots = {'Am': 45, 'F': 41, 'C': 36, 'G': 43, 'Csus': 36}
def bass_note(f, n):
    t = tt(n)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)
    return x * env(n, a=0.004, r=0.12, hold=0.05)
for (st, name), en in zip(prog, ends):
    f = midi(roots[name])
    if st < 9:
        n = int((en - st) * SR)
        add(music, np.sin(2 * np.pi * f * tt(n)) * env(n, a=0.08, r=0.4, hold=en - st - 0.5) * 0.12, st)
    else:
        k = st
        while k < en - 1e-6 and k < 22.5:
            add(music, bass_note(f, int(0.24 * SR)) * 0.2, k)
            k += BEAT / 2
if True:
    n = int(2.0 * SR)
    add(music, np.sin(2 * np.pi * midi(36) * tt(n)) * env(n, a=0.01, r=0.8, hold=0.3) * 0.22, 22.5)

# ---- drums (from the reveal) ----
def kick():
    n = int(0.35 * SR); t = tt(n)
    f = 45 + 90 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12)
def clap():
    n = int(0.22 * SR)
    x = rng.standard_normal(n)
    x = hp(lp(x, 3200), 900)
    return x * env(n, a=0.002, r=0.06)
def hat(open_=False):
    n = int((0.12 if open_ else 0.05) * SR)
    x = hp(rng.standard_normal(n), 7000)
    return x * env(n, a=0.001, r=0.05 if open_ else 0.015)
K, CL, HT = kick(), clap(), hat()
b = 9.0
while b < 22.5 - 1e-6:
    beat_in_bar = round((b - 9.0) / BEAT) % 4
    add(music, K * 0.34, b)
    if b >= 11 and beat_in_bar in (1, 3): add(music, CL * 0.16, b); add(send, CL * 0.08, b)
    add(music, HT * (0.05 if b < 11 else 0.07), b + BEAT / 2)
    if b >= 11: add(music, HT * 0.035, b + BEAT / 4); add(music, HT * 0.035, b + 3 * BEAT / 4)
    b += BEAT

# ---- SFX (all pitched to the key, on the 16th grid) ----
def pluck(m, dur=0.35, bright=1.0):
    n = int(dur * SR); t = tt(n); f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.3 * bright * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.05)
    return x * env(n, a=0.002, r=dur / 3)
def bell(m, dur=1.6):
    n = int(dur * SR); t = tt(n); f = midi(m)
    x = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.2) + 0.2 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t / 0.08)
    return x * env(n, a=0.002, r=dur / 3.5)
def tick():
    n = int(0.03 * SR)
    return hp(rng.standard_normal(n), 2500) * env(n, a=0.0005, r=0.006)
def whoosh(dur, f0, f1, g=1.0):
    n = int(dur * SR); t = tt(n)
    x = rng.standard_normal(n)
    cut = f0 * (f1 / f0) ** (t / dur)
    y = lp(x, cut) - lp(x, cut * 0.35)
    return y * np.sin(np.pi * np.clip(t / dur, 0, 1)) * g

exec(open(sys.argv[2] if len(sys.argv) > 2 else 'sfx.py', encoding='utf-8').read())

# ---- reverb (shared room) ----
irn = int(1.1 * SR); ti = tt(irn)
ir = rng.standard_normal(irn) * np.exp(-ti / 0.32)
ir = lp(ir, 5000); ir /= np.sqrt(np.sum(ir ** 2))
L = 1 << int(np.ceil(np.log2(N + irn)))
wet = np.fft.irfft(np.fft.rfft(send, L) * np.fft.rfft(ir, L), L)[:N] * 0.35

mix = music + sfx + wet
fade = np.ones(N); fl = int(0.8 * SR); fade[-fl:] = np.linspace(1, 0, fl) ** 1.5
mix *= fade
mix[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
mix = np.tanh(mix * 1.4) / np.tanh(1.4)
mix *= 0.89 / np.max(np.abs(mix))

# subtle stereo: delayed copy on the right
d = int(0.011 * SR)
right = np.concatenate([np.zeros(d), mix[:-d]]) * 0.25 + mix * 0.75
stereo = np.stack([mix, right], 1)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "audio.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print("ok")
