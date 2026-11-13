---
tags: [roadmap, feature, data]
id: F29
priority: P1
phase: 6
size: M
status: Done
needs: [F12]
---
# F29 US and world universities

**Priority:** P1 · **Phase:** 6 Owner requests 2026-11-13 · **Size:** M · **Needs:** [[F12 Institution picker]] · back to [[00 Master To-Do]]

## What the owner asked for
"Also support US universities and notable universities around the world." (2026-11-13)

## Current state
[[F12 Institution picker]] ships `src/data/institutions-uk.json`: 137 UK entries with `id`, `name`, `aliases`, `domains`, `nation`, written from the model's own knowledge and not checked against an official register. `worker/institutions.js` imports that one file to check ids; the picker (`UiCombobox`) loads it lazily when it opens. `test/copycheck.mjs` allows named institutions only in `src/data/institutions-*.json`.

## Plan
- Add `src/data/institutions-us.json` (US universities and colleges with a recognisable national name: the Ivy League, flagship state universities, large private research universities, well-known liberal arts colleges, HBCUs and so on) and `src/data/institutions-world.json` (notable universities elsewhere: by country, the national flagships and the ones a UK or US student would recognise). Same fields as the UK file, with `country` (ISO 3166-1 alpha-2) in place of `nation` for non-UK entries; the UK file keeps `nation` and gains `country: "GB"`.
- Accuracy rule, as in F12: names must be correct; leave out an alias, domain or whole entry rather than guess. Each file has a `_source` line saying how it was made and that the owner should review it. Free text ("Not listed? Use ...") must keep working.
- Ids stay globally unique slugs. Existing UK ids must not change (people have saved them).
- The picker searches all three files. Load lazily, only when a picker opens. Measure the gzip size of each file and decide whether to load all three at once or the extra files only when needed; write the numbers and the reason in the Log. Show the country after non-UK names ("Example University, Canada") so same-name institutions are told apart.
- The `.ac.uk` email suggestion from F12 extends to `.edu` and to the domains in the new files.
- The Worker validates ids against all three files.
- `scripts/backfill-institutions.mjs` matches against all three files.
- Shared ground ([[F16 Shared ground without AI]]) keeps matching by id.

## Tasks
- [x] F29.1 Add `country` to the UK file and a loader and validator for several files; tests that every id is unique across files and existing UK ids are unchanged.
  - `country: "GB"` on all 137 UK entries and a `countries` map in the file; no id touched. `src/lib/institutions.js` gained `mergeInstitutions` (throws on a repeated id), `countryLabel`, `pickerOptions`, `isWebmail`, and `slugify` now drops accents. `test/institutions-world.mjs` (in `npm test` after `institutions.mjs`) reads every `src/data/institutions-*.json` and checks unique ids, the UK ids (sample plus a hash of all 137), country names, id = slug (country suffix only for same-name pairs), domain and short-name rules.
- [x] F29.2 Write `institutions-us.json`.
  - 355 entries (Ivy League and other private research universities, state flagships and large publics, liberal arts colleges, HBCUs, some others), written by the agent from its own knowledge; each with the official name as commonly used, a short name only where well established, and an email domain only where sure. `lincoln-university-us` is the one id with a country code added (a Lincoln University also exists in New Zealand, in the world file). Gzip 8.0 KB. The owner should review it.
- [x] F29.3 Write `institutions-world.json`.
  - 548 entries in 94 countries (national flagships and well-known universities, institutes of technology and business schools, grouped by country), written by the agent from its own knowledge. A `countries` map names each code. Gzip 14.5 KB. The one same-name pair across the files, Lincoln University (US and New Zealand), has `-us` and `-nz` ids. The owner should review it.
- [x] F29.4 Picker searches all files and shows the country; `.edu` and other domain suggestions; Worker and backfill accept the new ids.
  - `src/data/institutions.js` puts the three files together; the two pickers (`ModeFields.vue`, `HostDashboard.vue`) fetch it with one plain `import()` when a picker opens, one lazy chunk (25.5 KB gzip) that loads nowhere else. `UiCombobox` shows an option's `suffix` after the name (", Canada"; nothing for UK ones). The domain suggestion now fetches the list at once for any verified email that is not webmail, and `institutionForDomain` already covers every file's domains. `worker/institutions.js` validates against all three; `scripts/backfill-institutions.mjs` reads every `institutions-*.json` (a name that two institutions share, such as Lincoln University, is left alone). The merge code is in `src/lib/institutionList.js`, apart from `institutions.js`, so the data chunk shares no code with the app chunks (a shared chunk added a file name to the entry's preload list). The "Toronto" search put Toronto Metropolitan University first, so the University of Toronto has the short name "Toronto". `test/institutions.mjs` source guard updated (the combined module is the one importer of the JSON files, the two pickers the only fetchers); `test/institutions-world.mjs` has the acceptance searches, domains, backfill and Worker checks.
- [x] F29.5 Check in a browser, measure the chunk sizes, write the vault and Log.
  - Checked in a local browser (Chrome engine), signed in with a local test account: 1280 px dark and light, 375 px light and dark. Chunk sizes and the vault notes are in the Log and D036.

## Acceptance checks
- [x] Typing `MIT`, `Stanford`, `UCLA`, `Toronto`, `ETH` and `NUS` each finds the right institution in the picker, with the country shown for non-UK ones. (In the browser each was typed into the University picker and the right institution came first, with ", United States", ", Canada", ", Switzerland" or ", Singapore" after it; also checked by `test/institutions-world.mjs`. `Toronto` first put Toronto Metropolitan University on top, so the University of Toronto got the short name "Toronto".)
- [x] A saved UK institution from F12 still shows and saves unchanged. (Browser: a profile saved with University of Oxford showed it in the picker; the API test saves an old UK id and reads back the same id and official name. Stanford University and then a typed name were also saved and read back from `/api/me` in the browser.)
- [x] No public page gets heavier ([[F28 Public-page JS budget]]); the data loads only when a picker opens. (`test/budget.mjs` passes: card page 51,010 to 51,020 B gzip and privacy request page 50,530 to 50,569 B, a few dozen bytes each, about 180 B and 630 B under the limit; the data is one lazy chunk that `index.html` does not preload. In the browser, no institution file was requested on `/app` and the three files were fetched when the picker opened.)

## Log
- 2026-11-13 (Claude subagent): the University and Studied at pickers (and a society's university) now search about 1,040 institutions: the UK list, 355 US and 548 from 94 other countries, with the country shown after a non-UK name. Every entry has a `country`; ids are global slugs and the UK ids did not change (a test pins a sample and the hash of all 137). No migration. See [[D036 Institution list in three files, loaded as one chunk when a picker opens]].
- **How the lists were made:** an AI agent wrote `institutions-us.json` (355) and `institutions-world.json` (548, 94 countries) from its own knowledge, with no web pages and no check against an official register; each file's `_source` says so. Names are the official English name as commonly used; a short name only where well established (MIT, UCLA, NUS, ETH, UBC, HKU); an email domain only where the agent was sure; a short name two institutions use was left out (for example USC for South Carolina, UCD for Davis). **The owner should review both files** (or replace them with an official source, keeping saved ids). The one same-name pair, Lincoln University (US and New Zealand), has the country in both ids.
- **Sizes (gzip):** the three files on their own, UK 3.7 KB, US 8.0 KB, world 14.5 KB. Built, they are one lazy chunk of 25.5 KB (`institutions-<hash>.js`), fetched with one plain `import()` when a picker opens, not on any page's first load. I did not split them: each extra lazy chunk adds its file name to the entry's preload list, and the card page had under 200 B spare. First-load JS before and after (from `test/budget.mjs`): card page 51,010 to 51,020 B (limit 51,200), privacy request page 50,530 to 50,569 B; the other six pages grew by 7 to 11 B each (the entry carries the new chunk name). The privacy request page loads the `UiSelect` chunk, which holds the picker, so its extra 39 B includes the country text in `UiCombobox`. The Worker bundle (wrangler dry run) grew from 1,264.73 KiB (gzip 257.04) to 1,388.19 KiB (gzip 279.37) because it imports the three files to check ids.
- Changed: `UiCombobox` options take an optional `suffix`; the email suggestion now fetches the list for any verified email that is not webmail (so `name@students.example.edu` or a world domain suggests an institution at once; before it did so only for `.ac.uk`); `slugify` drops accents. `test/institutions.mjs`'s source guard was updated, not weakened (the combined `src/data/institutions.js` is the only file that names the data files; `ModeFields.vue` and `HostDashboard.vue` are the only ones that fetch it, with a plain `import()`).
- Found in the browser: opening a picker for the first time shows "No matches" for a moment until the 25 KB chunk arrives (the same as F12 on its smaller chunk). Not fixed; a loading line would be a small follow-up. Not checked: a screen reader, the host dashboard society form in a browser (covered by tests only), a real `.edu` verified email (the suggestion is checked in tests only).
- Left over: event reports and the admin screen still count `uni` text, not ids (as in F12).

### Owner steps
- Review the F29 commits and `git push`, then `npm run deploy`. There is no migration.
- Review `src/data/institutions-us.json` and `src/data/institutions-world.json` (and the UK file from F12), or replace them with official lists, keeping the ids of any institution already saved.
- Optional: run the backfill on a D1 export (`node scripts/backfill-institutions.mjs --sqlite <copy>`) to give existing profiles that typed a US or world name an id; it now matches all three files.

Related: [[F12 Institution picker]], [[Data Model]] · back to [[00 Master To-Do]]
