---
tags: [decision]
status: Accepted
date: 2026-11-13
---
# D036 Institution list in three files, loaded as one chunk when a picker opens

**Status:** Accepted (the lists themselves are to be reviewed by the owner)  ·  **Date:** 2026-11-13

## Context
[[F29 US and world universities]] adds US and world institutions to the UK list of [[D021 Institution list from knowledge, loaded when the picker opens]]. Public pages have almost no JS headroom ([[D024 Signed-in frame and heavy pieces load only where used]]): the card page had about 190 B and the privacy request page about 670 B.

## Decision
- Three files, `institutions-uk.json`, `institutions-us.json` (355 entries) and `institutions-world.json` (548 entries in 94 countries), all written by an AI agent from its own knowledge on 2026-11-13 (UK on 2026-11-10), none checked against an official register. Each says so in `_source` and asks the owner to review it. Names, short names and email domains were left out when not certain; a short name two institutions use was left out too.
- Every entry has `country` (ISO 3166-1 alpha-2; the UK entries gained `GB`, their `nation` stays) and each file has a `countries` map of code to English name. Ids are global slugs of the name; where two institutions share a name the id gains the country code (`lincoln-university-us`, `lincoln-university-nz`). Existing UK ids did not change; a test pins a sample and the hash of all 137.
- One lazy chunk: `src/data/institutions.js` puts the three files together and the two pickers fetch it with one plain `import()` when a picker opens. All three together are 25.5 KB gzip (UK 3.7, US 8.0, world 14.5 on their own), which is why they were not split: a second or third lazy chunk adds its file name to the entry's preload list on every page, and the entry cannot spare it. The merge code (`src/lib/institutionList.js`) is kept out of the code the app chunks share, so the data chunk shares nothing and no extra chunk appears.
- The Worker imports the three files and checks ids against all of them (Worker bundle 1,265 to 1,388 KiB, gzip 257 to 279 KiB). The backfill reads every `institutions-*.json`; a name that two institutions share matches none.
- The picker shows the country after a non-UK name (", Canada"), through a `suffix` on the option. The name stored on the card is still the official name alone. The email suggestion fetches the list for any verified email that is not webmail, and matches the domains in every file.

## Consequences
A missing institution is still never a problem (free text works). A wrong alias or domain shows wrong help, not wrong data. The first open of a picker fetches 25 KB instead of 4 KB, on the in-app editor only. Adding more files later has the same trade-off.

**Evidence:** `src/data/institutions*.json`, `src/data/institutions.js`, `src/lib/institutionList.js`, `worker/institutions.js`, `test/institutions-world.mjs`

Related: [[D021 Institution list from knowledge, loaded when the picker opens]], [[F29 US and world universities]] · back to [[Decision Log]]
