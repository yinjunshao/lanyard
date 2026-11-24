---
tags: [roadmap, feature, ui, onboarding]
id: F52
priority: P1
phase: 10
size: S
status: In progress
needs: []
---
# F52 Rotating examples and better link examples

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** S · **Needs:** none · back to [[00 Master To-Do]]

## What the owner asked for (2026-11-24)
"The suggested thing in the text box, for example, what you do in one line, make it so there's like a pool of examples for them to put in, and there should be a smooth animation for that."
"The suggested add your links, there are currently 2. Both of them are LinkedIn as an example. So maybe have one LinkedIn and one be like Instagram."
And on tone (about the tag suggestions, which applies here too): "It shouldn't be that hackathon focused... this could be anyone that uses the platform. This includes regular students that are not doing hackathons, people that are interested in finance or already working in finance."

## Current state
- `src/components/welcome/StepFor.vue` line 28: headline placeholder "e.g. Building robots and Roblox games".
- `src/components/CardForm.vue` line 40: card headline placeholder falls back to "e.g. Building robots".
- Edit profile's headline field (`src/views/EditProfile.vue`; confirm where).
- `src/components/EventPresence.vue` line 204: "I want to meet someone who..." placeholder "is into robotics, or works in design".
- `src/components/welcome/StepLinks.vue` line 37: every link row's placeholder is `linkedin.com/in/you`; line 33 help says "LinkedIn, GitHub, a portfolio".

## Plan
- A small component `src/components/ui/RotatingHint.vue` (or a directive) that, while its input is empty, shows an example over the input in the placeholder's colour and swaps it every 3.5 s: the old example slides up and fades out, the new one slides up from below and fades in (transform and opacity only, tokens from [[D045 Motion is CSS tokens and a few lines of script, never a library or Vue Transition]]). It hides at once when the person types; it is `aria-hidden` and the input keeps a real, static `placeholder` for screen readers ("e.g. " plus the first example). Clicks pass through it to the input. Under reduced motion it swaps with a short fade. It pauses when the tab is hidden. Starts at a random example.
- Pools live in one file `src/lib/examples.js`, general and not hackathon-heavy, each under the field's limit, no named universities or societies ([[F03 Neutral copy with no named university]]), UK English, no emoji. About 10-12 each, a mix of students (not only tech), finance, design, health, law, marketing, research, founders, career people. Different pools by mode where it helps (Student / Career). Suggested headline pool, to refine:
  - Student: "Second-year economics, into markets and investing", "Studying law, interested in tech policy", "Nursing student who loves running", "Maths student learning to code", "Into product design and photography", "Medic, interested in health tech", "History student and debate team captain", "Engineering student building a solar car"
  - Career: "Equity analyst covering European banks", "Product designer at a fintech", "Marketing lead, growing consumer brands", "Software engineer, payments and APIs", "Founder building tools for small shops", "Recruiter for graduate roles in finance", "Data scientist in healthcare", "Accountant helping start-ups"
  - Wish pool for "I want to meet someone who..." (also used by [[F60 Intention at check-in and who to meet for everyone]]): "works in finance", "is hiring interns", "knows about start-ups", "is into investing", "studies something different from me", "works in design", "could mentor me", "is looking for a co-founder".
- Use it on: welcome headline, Edit profile headline, card headline (only when the profile has no headline to show as the placeholder), and the presence wish field.
- Links: the first row's placeholder is `linkedin.com/in/you`, the second `instagram.com/you`, a third (if shown) `yourwebsite.com`. Help text: "LinkedIn, Instagram, a portfolio. People tap them straight from your card. You can skip this."
- No public-page JS change (none of these fields is on a public page; if one is, keep it within budget).

## Tasks
- [x] F52.1 Add `RotatingHint` and `src/lib/examples.js`; use them on the four fields; change the link placeholders and help; guard in `test/` (pools under limits, no named university via `test/copycheck.mjs`, no "hackathon" in the headline pools, link placeholders differ); browser check at 375 and 1280 px, light and dark, and with reduced motion.

## Acceptance checks
- [x] On welcome step 3, the empty headline field shows an example that changes about every 3.5 s with a slide and fade; typing one letter hides it at once; clearing the field brings it back.
- [ ] With reduced motion on, examples swap with a fade and nothing slides.
- [x] A screen reader reads the input's static placeholder, not the rotating text (the overlay is `aria-hidden`).
- [x] Clicking on the example focuses the input.
- [x] On the links step the first row shows `linkedin.com/in/you` and the second `instagram.com/you`.
- [x] No example names a university or society, and none is over the field's maximum length (test).
- [x] `npm test` passes; public pages within budget.

## Log
- 2026-11-24 · Claude subagent (F52.1): `src/lib/examples.js` holds the pools (10 student headlines, 10 career, 10 wishes, general, none says hackathon) and `linkPlaceholder(i)`; `src/components/ui/RotatingHint.vue` draws an `aria-hidden` overlay over an input that keeps a real static placeholder ("e.g. " plus the first example, handed through the slot and drawn clear only while the overlay is up). It starts at a random example, swaps every 3.5 s (the old line rises 12 px and fades out in 140 ms, the new one rises in from 12 px below in 200 ms: `m-hint-out` and `m-hint-in`, `--shift`, `--dur`, `--dur-out`, transform and opacity only, so under reduced motion `--shift` is 0 and it is a fade), pauses while the tab is hidden, and is gone at the first keystroke (back when the field is cleared). Used on the welcome headline, Edit profile's headline, a card's headline (only when the profile has no headline; otherwise the profile's line stays the placeholder) and the presence wish; links: row 1 `linkedin.com/in/you`, row 2 `instagram.com/you`, later rows `yourwebsite.com`, on the welcome step and on Edit profile; the help line now says "LinkedIn, Instagram, a portfolio."
- Tests: new `test/examples.mjs` (35 checks) before the budget check; no existing guard changed. Public pages: only non-public screens import the new files; PublicCard 48,793 to 48,830 B, PrivacyRequest 51,090 to 51,125 B (75 B left), Landing 45,522 B, Privacy 50,828 B (the few bytes more come from the shared chunk, not these files).
- Browser (local servers, signed in as a local test person): welcome step 3 at 375 px light and dark and 1280 px light (the example swaps with a slide and fade, caught mid-swap; long examples end in an ellipsis; typing a letter removed the overlay at once and clearing brought it back; the overlay is `aria-hidden` with `pointer-events: none`, so a point over the example hits the input; the input's real placeholder is the static first example), the links step (placeholders as above), Edit profile (headline example, links), and a card's editor in My cards (headline example with no profile headline). **Not looked at:** reduced motion in a browser (the pane cannot emulate it; guarded in `test/examples.mjs` that no rule of its own is needed and the global block sets `--shift: 0px`), the presence wish field (no live local event), a card whose profile has a headline (source guard only), and 1280 px in dark. The "reduced motion" acceptance check stays unticked for that reason.
- Owner steps: none beyond the usual push and deploy.

Related: [[F14 Onboarding revamp]] · [[F53 Tag boxes and new suggestions]] · back to [[00 Master To-Do]]
