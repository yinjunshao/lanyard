---
tags: [roadmap, feature, ai, onboarding, privacy]
id: F62
priority: P1
phase: 10
size: L
status: Not started
needs: [F21, F14]
---
# F62 Fill your profile from LinkedIn or a CV

**Priority:** P1 · **Phase:** 10 Owner requests (2026-11-24) · **Size:** L · **Needs:** [[F21 AI foundation]], [[F14 Onboarding revamp]] · back to [[00 Master To-Do]]

> [!note] Owner decisions 2026-11-24: the browser reads the text out of the PDF and only that text goes to the AI, so the file never leaves the device; it accepts a LinkedIn "Save to PDF" file and any CV; it is offered on the first welcome step and on Edit profile; everyone, Free and Plus, gets 3 AI imports a month, and past that a plain parser that needs no AI fills what it can.

## What the owner asked for
2026-11-24: "how does builderbase.com scrape linkedin data of a user? i want that for lanyard."

We looked first. Builderbase's privacy policy (updated 2026-10-12, section 1.9 and 3.5) says it does not scrape LinkedIn itself: a person pastes their LinkedIn link and a data vendor, Reverse Contact, fetches the public profile. It also reads an uploaded CV with an AI model. We advised against a scraping vendor: LinkedIn's terms forbid scraping and LinkedIn sued the vendor Proxycurl in 2025, which then shut down; a vendor costs money per lookup and adds a processor; LinkedIn's own sign-in gives only name, email and photo. The owner agreed to plan the safer route instead: "Yes, plan it" (2026-11-24), then answered the four questions in the callout above.

## Current state
- Profile fields are in `profiles` ([[Data Model]]): name, mode `student`|`career`, company and role (80 each), uni and `institution_id`, course, year, headline (80), about (600), links JSON, tags JSON, projects JSON (up to 3). The Worker trims headline and about at `worker/index.js` about lines 631 and 676.
- Welcome steps are in `src/components/welcome/`: `StepYou` (name, photo), `StepMode`, `StepFor` (headline at about line 29), `StepLinks`, `StepSave`, `StepDone` ([[F14 Onboarding revamp]]). Edit profile is `src/views/EditProfile.vue` (234 lines).
- `src/lib/links.js` already labels a pasted `linkedin.com` address "LinkedIn".
- The AI layer is `worker/ai/` ([[F21 AI foundation]]): OpenRouter, default model `google/gemini-2.5-flash-lite` (`config.js`), quotas from `AI_LIMITS` in `worker/plans.js`, usage counted per feature string in `ai_usage` (`store.js` `addUsage`, `usedBy`), so a new feature needs **no migration**. Friendly fallback copy is `worker/ai/messages.js`. There is a stub model for tests (`stub.js`). F21 is built but its real-key check is still open.
- Nothing reads PDFs today. No PDF library is installed.

## Plan
**Flow.** "Fill from LinkedIn or a CV" opens a small sheet: a help line ("On LinkedIn, open your profile, tap More, then Save to PDF"), a file picker for PDF only, and one privacy line ("Your file stays on this device. We send only its text to our AI provider to read it, and keep nothing."). After a file is picked: "Reading your file" (loading state from [[F38 Loading states]]), then a review list of what was found. Each field shows what is there now and what was found, with a tick. Empty fields are ticked, fields that already have a value are not. **Apply** copies the ticked values into the form. Nothing is saved until the person presses Save as they do today.

**Reading the PDF, in the browser.**
- `pdfjs-dist`, exact version pinned, at least 4.2.67 (CVE-2024-4367), opened with `isEvalSupported: false`. Its worker file is served from our own origin, no CDN.
- A lazy chunk, loaded only after a file is picked. It must not appear on any public page and must not change the [[F28 Public-page JS budget]] numbers. Edit profile and the welcome steps load it on demand.
- Limits: file at most 5 MB, first 6 pages, text cut to 12,000 characters. No text found (a scanned file) means a plain message and no AI call.

**Two readers, one result shape.** Both return `{ name, mode, headline, about, company, role, uni, course, year, tags[], links[] }`, any field may be missing.
- **Plain parser** `src/lib/cvParse.js`, pure, no AI: finds LinkedIn's headings (Contact, Top Skills, Languages, Certifications, Summary, Experience, Education), takes the name and the line under it as headline, the first Experience entry as role and company, the first Education entry as uni, course and years, Top Skills as tags, and any `linkedin.com/in/` or `github.com/` address as links. On a CV with no LinkedIn headings it fills only the links. It runs when AI is off, out of allowance, opted out or fails.
- **AI reader** `POST /api/ai/profile-import`, feature `profile_import`. Only for a signed-in person, about their own profile. Body `{ text }`, refused over 12,000 characters. Text is cleaned by `worker/ai/sanitize.js` and fenced in `<data>` as untrusted content (Rules 2 and 3 of [[AI Safety and Cost Plan]]). Prompt in `worker/ai/prompts/profileImport.js`. Output is strict JSON, checked by `worker/ai/validate.js`: every field trimmed to the profile limits, mode only `student` or `career` (guess from whether the latest entry is a degree in progress), year in the same form the profile uses, tags run through the [[F53 Tag boxes and new suggestions]] tag rules, links only `https`, and only addresses that appear literally in the text sent (the model cannot add a link). Uni is matched to the institution list in the browser with the existing picker search, otherwise kept as typed text.
- **No text is kept.** This feature writes no `ai_cache` row (the text is a person's CV, and a cache hit is useless here). `ai_usage` keeps counts only, as for every feature. Nothing is logged with the text.
- **Allowance** in `AI_LIMITS`: `profile_import: { label: "imports", free: { month: 3 }, plus: { month: 3 } }`. Past it, the plain parser result is shown with `friendly("quota_month", "profile_import")`.

**Where it appears.** A quiet button at the top of `StepYou` ("Have a LinkedIn PDF or a CV? Fill from it") and on Edit profile beside the heading buttons ([[F06 Edit profile and Cards buttons]] layout). On the welcome steps, applied values prefill the later steps (mode, headline, tags, links) through the existing onboarding state; the person still sees each step. No photo is taken from the file.

**Copy and law.** UK English, no named university in examples ([[F03 Neutral copy with no named university]]). The Privacy Policy's AI features section gains one purpose: reading the text of a file you choose to fill your own profile, text sent to the AI provider, nothing kept. Whether that needs a Terms and Privacy version bump is an owner decision at the end. LinkedIn is named only as the source of the file the person saves themselves; we never fetch anything from LinkedIn.

**Decision to write when built:** `D053 A profile import reads a PDF's text on the device, and keeps nothing` (Accepted 2026-11-24 by the owner's answers).

## Tasks
- [ ] F62.1 Add the on-device PDF text reader as a lazy chunk, with the size, page and text limits and the no-text message.
- [ ] F62.2 Add the plain parser `src/lib/cvParse.js` and its tests on made-up LinkedIn-shaped and CV-shaped text (no real person's data in fixtures).
- [ ] F62.3 Add `POST /api/ai/profile-import`: allowance, prompt, strict output checks, no cache, stub reply; extend `test/ai-injection.mjs`.
- [ ] F62.4 Add the review sheet and put it on Edit profile and the first welcome step; Apply fills the form only.
- [ ] F62.5 Privacy Policy line, D053, [[API Surface]], [[Features]], [[Screens and Routes]], [[Privacy and Data Retention]], [[Codebase Map]], [[Testing]]; wire `test/profile-import.mjs` into `npm test`; browser check at 375 and 1280 px, light, dark and Midnight.

## Acceptance checks
- [ ] On Edit profile, picking the made-up LinkedIn-format fixture PDF with the stub model shows name, headline, role and company, uni, course and year, three skills and the LinkedIn link in the review list.
- [ ] In the network log, the PDF's bytes are never sent. The only request is `POST /api/ai/profile-import` with JSON `{ text }` of at most 12,000 characters.
- [ ] A PDF with no text (an image only) shows the no-text message and makes no request.
- [ ] A 6 MB PDF is refused before it is read.
- [ ] With `AI_ENABLED` unset, the same fixture still fills name, headline, role, company, education, skills and link from the plain parser.
- [ ] A fourth AI import in one month gets the plain parser's result and the line "You've used this month's AI imports. They're back next month."
- [ ] A stubbed model that returns a link not in the text, a headline of 300 characters and mode "admin" gets the link dropped, the headline cut to 80 and the mode dropped.
- [ ] With a headline already filled, its row in the review list is not ticked. Apply changes only ticked fields, and leaving the page without Save keeps the old profile.
- [ ] No `ai_cache` row is written for `profile_import`; its `ai_usage` row holds counts only.
- [ ] `test/budget.mjs` numbers for every public page are unchanged, and the PDF reader chunk is fetched only after a file is picked.
- [ ] On the welcome steps, applying a found headline and tags shows them already filled on the `StepFor` step.
- [ ] Owner check, needs the real world: the owner's own LinkedIn "Save to PDF" file and one real two-column CV, read with the real model, fill the right fields.

## Owner steps
- After F21 is on (no migration): `npm run deploy`. Then do the real-file check above with your own address on the allow-list.
- Decide whether the new Privacy Policy line needs a Terms and Privacy version bump.

## Log
- 2026-11-24 (owner decision): text read on the device only; LinkedIn PDF and any CV; welcome steps and Edit profile; 3 AI imports a month for everyone, plain parser past that.
- 2026-11-24 (Claude): planned from the owner's request after looking at how Builderbase does it. Needs F21 ticked, or the owner's say-so to build on F21 as it stands, as F22 to F25 were.

Related: [[F21 AI foundation]], [[F14 Onboarding revamp]], [[AI Safety and Cost Plan]], [[Competitors]] · back to [[00 Master To-Do]]
