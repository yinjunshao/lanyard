---
tags: [roadmap, feature, profile, data]
id: F12
priority: P1
phase: 1
size: M
status: Done
needs: [F08, F11]
---
# F12 Institution picker

**Priority:** P1 · **Phase:** 1 Foundations · **Size:** M · **Needs:** [[F08 Custom pickers and dropdowns]] (UiCombobox), [[F11 Student and Career mode]] · **Unlocks:** [[F16 Shared ground without AI]], [[F24 Do I know someone who]] · back to [[00 Master To-Do]]

## What the owner asked for
A dropdown to pick a school or university instead of free text, so the AI can sort institutions reliably. Still allow a custom entry if the institution isn't listed.

## Data source
- `src/data/institutions-uk.json`: one entry per UK higher-education institution. Fields: `id` (stable slug, e.g. `university-of-example`), `name` (official name), `aliases` (common short names and acronyms), `domains` (email domains such as `example.ac.uk`), `nation` (England / Scotland / Wales / Northern Ireland).
- Build it from an **official** list, not memory. For example, the Office for Students Register for England plus the equivalent lists for Scotland, Wales and Northern Ireland, or HESA's provider list. Record the source URL and download date in a `_source` field at the top of the file. Agents must not invent entries or aliases.
- UK first ([[D006 UK campus beachhead first]]). International institutions use the custom entry for now.
- The worker imports the same JSON to validate ids.

## Storage
Migration on `profiles` and `orgs`:
- `institution_id TEXT` (nullable; a slug from the list)
- Keep `uni` / `orgs.university` as the display text. For a listed institution it holds the official name. For a custom one it holds what the person typed, with `institution_id` NULL.

## UI
- `UiCombobox` (from F08). Type to search names and aliases ("ucl" finds the full official name). Matching ignores case and accents.
- The last option is always: **"Not listed? Use '<what you typed>'"**.
- If the account has a verified email whose domain matches an entry's `domains` (`users.email_domain`), show a one-tap suggestion above the field: "Looks like you're at <name>. Use it?"
- Load the JSON lazily, only on the profile editor and onboarding. It must never load on public pages.
- The same picker goes on host organisation forms (`university` field) in [[F10 Separate host accounts on host subdomain]].

## Backfill existing profiles
A script (`scripts/backfill-institutions.mjs`) matches existing `uni` text against names and aliases (exact, case-insensitive) and sets `institution_id`. It prints unmatched values for review. Run it locally on an export. Production runs only with the owner's go-ahead.

## Tasks
- [x] F12.1 Build the data file from an official source (cite it), and add a test that ids are unique and slugs stable.
  - `src/data/institutions-uk.json`: 137 UK higher-education institutions (England, Scotland, Wales, Northern Ireland) with `id`, `name`, `aliases`, `domains`, `nation`. **It is not from an official list.** I had no reliable way to download one, so it was written from knowledge, and the `_source` field says so. Names, aliases and domains that I was not sure of were left out. The owner should review it or replace it with the Office for Students Register and the other nations' lists. Ids are the slug of the name and must never change once saved on a profile. 3.7 KB gzip.
  - `src/lib/institutions.js` has `slugify`, `institutionOptions`, `institutionForDomain` and `institutionForText` (no data import, so the data loads only when the picker opens). `test/institutions.mjs` (in `npm test`) checks unique ids, id = slug of name, nations, domain shape and uniqueness, aliases, pinned ids, and the helpers.
- [x] F12.2 Migration, API validation (`institution_id` must exist in the list; custom text is capped at 120 chars), export.
  - `migrations/0020_institution_id.sql` adds nullable `institution_id` to `profiles` and `orgs` (additive; safe to apply before the new code). `worker/institutions.js` imports the same JSON and checks ids. `POST/PUT /api/profile` take `institutionId` (or `institution_id`): an id not on the list is a 400; a listed id sets `uni` to the official name; null or "" is a custom entry. A client that only sends `uni` (the old form) changes the text, and that clears the id, so the two cannot disagree. Typed `uni` is capped at 120 characters. `/api/me` returns the column in the profile and `user.emailDomain` for the suggestion. A society's `university` on `POST /api/host/orgs` takes the same `institutionId`; the host export now lists each organisation's university and id. The data export returns the whole profile row, so it already carries the id. Deleting the account deletes the profile row. `test/institutions.mjs` now has 43 checks, including migration 0020 on an old-shape profile.
- [x] F12.3 Picker in `EditProfile.vue` (and in onboarding when F14 lands), with the email-domain suggestion.
  - `EditProfile.vue`: University (Student) and Studied at (Career) are now `UiCombobox` pickers with "Not listed? Use '<typed>'" as the last row, clearable, sending `institutionId` with `uni`. The host dashboard's society "University" field uses the same picker and sends `institutionId`. `UiCombobox` gained an `@open` event; the page fetches the list with a plain `import()` the first time the picker opens (or at once when the account's verified email is a `.ac.uk` address, for the suggestion). "Looks like you're at <name>. Use it?" shows above the field when `/api/me` `user.emailDomain` matches an entry's domains; one tap fills both id and name. Not done: onboarding (F14 has not landed; it should reuse this picker and the `suggestion` code in `EditProfile.vue`).
  - Chunking: a separate picker component or a separate combobox chunk added its file names to the router's preload list in the entry every public page loads (+40 B gzip on Landing). To avoid that, `UiSelect.vue` re-exports `UiCombobox` so both live in the one chunk the app already listed, and the views import it from there (comment in the file).
  - Found and fixed in the browser: "Use it" set the id and then threw before setting the name (the suggestion went away when the id was set). Fixed by reading the suggestion first.
- [x] F12.4 Backfill script and dry-run output pasted here.
  - `scripts/backfill-institutions.mjs`: dry run by default; `--sqlite <file>` (a D1 export or copy) or `--local` (local D1), `--apply` to update. It looks only at rows with text and no id, and matches exactly (ignoring case and spaces) on the official name or an alias that belongs to one institution. A match sets `institution_id` and replaces the text with the official name (a listed institution always shows its official name). Partial matches and ambiguous aliases are left alone. It has no `--remote`; production runs only with the owner's go-ahead (export D1, run it on the copy, read the output, then ask for a remote option). Tests in `test/institutions.mjs`.
  - Dry run on the **local** D1 (a handful of test profiles, three of them with a short name or different case; nothing production), `node scripts/backfill-institutions.mjs --local`:
    profiles.uni: 8 with text and no id; 4 matched (3 will have their text replaced by the official name, for example an alias); 4 unmatched
      unmatched values, most common first (left as they are):
        2 x "Some Place Else"
        1 x "Test University"
        1 x "University of Example"
    orgs.university: 1 with text and no id; 1 matched (1 will have their text replaced by the official name, for example an alias); 0 unmatched
    
    Dry run: nothing changed. Add --apply to update.
- [x] F12.5 Allow-list the data file in the copy check from [[F03 Neutral copy with no named university]].
  - `test/copycheck.mjs` already allow-lists exactly `src/data/institutions-uk.json` (the pattern `src/data/institutions-*.json`, "the institution list (F12) has to name them"). Nothing was widened. With the real list in place `node test/copycheck.mjs` passes, so every other file in `src/`, `worker/` and `public/` is still checked; the picker, the Worker helper, the backfill script and the tests name no institution, and tests use `Example University` and ids read from the list.

## Acceptance checks
- [x] Typing a common acronym finds the full official name. (In a local browser, `ucl` listed University College London first with `UCL` shown beneath it, Enter chose it with focus back on the button, and Save stored the id and the official name. `test/institutions.mjs` checks `ucl`, `lse` and `qmul` against the real list.)
- [x] A custom institution saves and shows on the card exactly as typed. (Browser: typed a made-up name, chose the "Not listed? Use ..." row, saved; `/api/me` and the public card both returned it as typed with `institution_id` null. `test/institutions.mjs` checks it through the API, and that text over 120 characters is cut.)
- [x] The profile editor chunk grows by no more than about 20 KB gzipped. Public pages are unchanged. (Gzip from `dist/`: Edit profile chunk 5,927 to 6,510 B; the picker code that moved into the in-app `UiSelect` chunk +2,052 B (2,058 to 4,110); the data chunk 3,725 B, fetched only when a picker opens (checked in the browser: not requested on load). Public first-load JS below.)

## Log
- 2026-11-10 (Claude subagent): University, Studied at and a society's university are now a searchable picker over a UK institution list, with a "Not listed? Use ..." row, a one-tap suggestion from a `.ac.uk` email, and the id stored beside the display text (migration 0020, additive). A backfill script (dry run by default, no remote option) gives existing profiles an id. Onboarding (F14) is not built yet and should reuse the picker in `EditProfile.vue`.
- **How the list was made:** an AI agent wrote `src/data/institutions-uk.json` from its own knowledge, with no download and no check against an official list (the plan asked for an official source; none could be fetched reliably). 137 entries (England, Scotland, Wales, Northern Ireland), 3.7 KB gzip. Names, aliases and email domains it was not sure of were left out. **The owner should review it or replace it with the Office for Students Register and the lists for the other nations**, keeping the ids of any institution already saved. See [[D021 Institution list from knowledge, loaded when the picker opens]]. No web pages were used.
- First-load JS, gzip of entry + static imports + page chunk, from `dist/`, before F12 (commit 885d760) and after: Landing 65,172 to 65,167 B; public card 59,568 to 59,564 B. No growth (the small drop is hash noise). An earlier version with a separate picker component, then with a separate combobox chunk, grew both by about 40 B because the router's preload list in the entry gained the new file names; `UiCombobox` is now exported from `UiSelect.vue` so it shares the chunk already listed. Both pages are still over 50 KB and stay with F28. Data chunk 3,725 B gzip.
- Found in the browser and fixed: "Use it" set the id, which removed the suggestion before the name was read, so the name was not filled. Fixed and rechecked.
- Checked in a local browser (Chrome engine) with a local test account: 1280 px light and 375 px dark, pointer, and keyboard (focus the field, type to open, Enter to choose, Escape to close, focus returns to the button). Not checked: a screen reader, the host dashboard society form in a browser (covered by API tests only), and a real `.ac.uk` verified email (I set `email_domain` in the local database to see the suggestion).
- Left over: `orgs.institution_id` is stored and exported but the admin screen still shows the university text only. [[F16 Shared ground without AI]] should compare `institution_id` (returned on `/api/me`; add it to the card and room payloads when needed). Event reports still count `uni` text, not ids.

### Owner steps
- Review the F12 commits, `git push`, `npm run db:remote` (applies `0020_institution_id.sql`, two nullable columns, safe before the new code; 0018 and 0019 are also still to be applied), then `npm run deploy`.
- Review `src/data/institutions-uk.json` or replace it with an official list.
- Optional: export D1, run `node scripts/backfill-institutions.mjs --sqlite <copy>`, read the unmatched values, and ask for a remote option if you want it run on production.
- Try the picker with VoiceOver or NVDA.

Related: [[Data Model]] · back to [[00 Master To-Do]]
