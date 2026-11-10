---
tags: [decision]
status: Accepted
date: 2026-11-10
---
# D021 Institution list from knowledge, loaded when the picker opens

**Status:** Accepted (the list itself is to be reviewed by the owner)  ·  **Date:** 2026-11-10

## Context
[[F12 Institution picker]] needs a list of UK higher-education institutions. The plan says to build it from an official list. The agent had no reliable way to download one.

## Decision
- `src/data/institutions-uk.json` was written by an AI agent from its own knowledge (137 entries). Its `_source` field says so. Names, aliases and email domains the agent was not sure of were left out. The owner should review it or replace it with an official source (the Office for Students Register and the lists for the other nations). Ids are slugs of names and are pinned by a test, so a replacement must keep the ids of any institution already saved on a profile.
- A missing institution never blocks anyone: the picker always offers "Not listed? Use ...", which saves the text as typed with no id.
- The list loads only when a picker opens, with a plain `import()` in `EditProfile.vue` and `HostDashboard.vue` (see [[D018 Hand-built pickers outside the shared Vue chunk]]). `UiCombobox` is exported from `UiSelect.vue` so both live in one chunk; a separate chunk added its file names to the router's preload list in the entry every public page loads.
- A listed id sets `uni` to the official name; a change to `uni` alone clears the id, so the two cannot disagree.

## Consequences
Public first-load JS did not grow (see the F12 Log). Aliases and domains in the file affect search and the "Looks like you're at ..." suggestion, so a wrong entry shows wrong help, not wrong data.

**Evidence:** `src/data/institutions-uk.json`, `worker/institutions.js`, `test/institutions.mjs`

Related: [[F12 Institution picker]] · back to [[Decision Log]]
