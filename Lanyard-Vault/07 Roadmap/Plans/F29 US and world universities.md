---
tags: [roadmap, feature, data]
id: F29
priority: P1
phase: 6
size: M
status: In progress
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
- [ ] F29.5 Check in a browser, measure the chunk sizes, write the vault and Log.

## Acceptance checks
- [ ] Typing `MIT`, `Stanford`, `UCLA`, `Toronto`, `ETH` and `NUS` each finds the right institution in the picker, with the country shown for non-UK ones.
- [ ] A saved UK institution from F12 still shows and saves unchanged.
- [ ] No public page gets heavier ([[F28 Public-page JS budget]]); the data loads only when a picker opens.

## Log
-

Related: [[F12 Institution picker]], [[Data Model]] · back to [[00 Master To-Do]]
