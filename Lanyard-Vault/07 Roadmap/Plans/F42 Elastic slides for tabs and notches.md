---
tags: [roadmap, feature, design]
id: F42
priority: P1
phase: 8
size: S
status: In progress
needs: [F40]
---
# F42 Elastic slides for tabs and notches

**Priority:** P1 · **Phase:** 8 Owner requests (2026-11-18) · **Size:** S · **Needs:** [[F40 Motion for sheets panels and tabs]] · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-19)
"Let's add ... rubber banded or elastic animations for the settings where there is a sliding notch or whenever there is one on the website."
"Let's add a animation for when user switches different pages, such as from my card to scan to people to events, where the little orange bar on top of the selected thing, it slides across to the other side ... Make this also kind of elastic. And on second, if they spam it, then obviously you can't do the animation. So just skip that."

## Current state
- F40 added `--dur-glide` and a sliding bar to the AppShell tab bar (`src/components/AppShell.vue` about line 70, `--tab` index; CSS in `src/styles/main.css`), and `src/lib/segGlide.js` for `.seg` segmented controls (host event page). Both use an ease-out, no overshoot.
- Other sliding notches: any `.seg`, toggle switches and chip groups in Settings and elsewhere. Survey them first.

## Plan
1. One elastic easing token in `:root`: a spring written with CSS `linear()` (a small overshoot of about 6-8% and one settle, about 420 ms), with a `cubic-bezier(.34,1.4,.64,1)` fallback where `linear()` is not supported. Only `transform` moves.
2. Use it for the tab bar's orange bar between My card, Scan, People and Events, and for every sliding notch: `.seg` (via `segGlide`), toggle switch knobs, and any other sliding indicator the survey finds. Make Settings use `.seg` + `segGlide` where it has a hand-made picker that would read better as one (survey first; do not restyle what is not a slider).
3. The tab bar bar keeps its place across route changes (it lives in the shell, so it survives the page swap). If the person taps another tab while the bar is still moving (within the glide time) or more than twice in about 600 ms, the bar jumps straight to the new tab with no animation, and the elastic comes back on the next calm tap.
4. Reduced motion: no overshoot, no slide; it jumps (as F40).
5. F40's motion rules hold, with one named exception: the elastic token may run up to 450 ms. Update the F40 guard in `test/loading.mjs` for that one exception without weakening the rest.

## Tasks
- [x] F42.1 The elastic token, the tab bar bar with the spam skip, guards in `test/loading.mjs`.
- [x] F42.2 Every other sliding notch (survey listed in the Log), browser check at 375 and 1280 px, light and dark, reduced motion; [[Design System]] Motion section and D045 updated (or D046 if it is a new decision).

## Acceptance checks
- [ ] Tapping My card then People moves the orange bar across with a slight overshoot and settle.
- [ ] Tapping four tabs quickly makes the bar jump to the last one, with no queued slides.
- [ ] A segmented control in Settings or the host event page slides with the same overshoot.
- [ ] With reduced motion on, the bar jumps.
- [x] `npm test` passes with budget numbers in the Log.

## Log
- 2026-11-19 (Claude subagent): F42.1 d2f3563 added the elastic token and the spring (linear(), about 7% overshoot, 420 ms; cubic-bezier fallback), --dur-elastic as the one named exception to 300 ms, the tab bar's bar on it, the spam skip and guards. F42.2 (next commit) puts the host event tabs and Settings' appearance control on the same spring and skip, updates the Design System and adds D046. The feature is not Done: the acceptance checks below that need the signed-in app are open.
- Survey of sliding notches (grep for .seg, switch, toggle, knob, ::before and ::after, transition): the app has no toggle switch or knob. The sliders are (1) the AppShell tab bar's bar, (2) the host event tabs (.seg.glides, glideSeg) and (3) Settings > Appearance, a plain .seg that now glides with glideSeg. Left as they are, because they change at once and do not slide: the .seg pickers in CardPreview, EventPreview, ModeFields and Admin (audience); the chip toggles; EventDetail's tabs (v-if); status pills; the step, select and scan decorations; the tap areas and skeletons.
- Browser check (Vite dev server; the tab bar sits in the signed-in frame and Settings needs a sign-in, so these were run on a probe that uses the real CSS and the real glideSeg module, not on those pages): the bar's transition is 420 ms, peaks at 6.9% over the target at 240 ms and settles by 420 ms; a jump (class set on the same change) lands at once with no transition; the calm tap after it springs again; a glideSeg control takes the same curve (117 px at 200 ms on a 112 px move); with the elastic token at 0 ms it lands at once. Looked at 375 and 1280 px, light and dark. Not checked: the signed-in pages, Settings itself, the operating system's reduced-motion setting (only the token), and the cubic-bezier fallback (Chromium runs linear()).
- Budget, first-load gzip, limit 51,200 B. Before (HEAD 3985d9e): Landing 45,257; PublicCard 48,767; Hosts 43,704; Privacy 50,428; Terms 47,956; Redeem 47,131; SignIn 48,324; PrivacyRequest 51,084 (116 B left); entry 42,099. After (final commit): Landing 45,259; PublicCard 48,761; Hosts 43,703; Privacy 50,427; Terms 47,956; Redeem 47,129; SignIn 48,325; PrivacyRequest 51,082 (118 B left); entry 42,099. npm test exits 0; npm run build exits 0.
- Guards changed in test/loading.mjs, not weakened: the F40.5 check for --dur-glide 200 ms is now --dur-elastic 420 ms; the two F40.6 regexes (tab bar and .seg.glides.ready) now name the elastic token and --ease-spring; the AppShell class check includes jump and no longer imports the helper (the frame keeps its own copy, guarded as identical); the stand-in classList gained toggle. New F42.1 section: the spring is 6 to 8% overshoot from 0 to 1, the fallback is there, the elastic token is 420 ms (never over 450) and used only by the two bars, the old glide token is gone, a jump sets transition none after the spring rule, the helper's sequences, and the Settings control glides and no public page imports the glide code. All other 300 ms and transform-only guards unchanged. Loading guards: 238 passed.
- Decisions made without the owner: the one exception is a new token (--dur-elastic 420 ms, 0 under reduced motion), and --dur-glide is removed; Settings' appearance control was made to glide, because the owner named Settings; the other plain .seg pickers stay instant, as they are not sliders; the spam skip is a copy in AppShell and in segGlide, because a shared module pushed the entry up by 14 B on every public page; a tap counts when the open tab changes, so a tap on the open tab does nothing.
- Owner steps (front end only; no migration, no secret): review the F42 commits; look at the tab bar on a phone (My card, Scan, People, Events, with a quick run of four taps); look at Settings > Appearance and an event's Present or Live tabs; turn on the phone's reduced motion and check the bar jumps. The acceptance checks still open: the bar slides on a real tap in the signed-in app; four quick taps jump to the last tab; a segmented control on the page slides with the overshoot; reduced motion on the page.

Related: [[F40 Motion for sheets panels and tabs]] · back to [[00 Master To-Do]]
