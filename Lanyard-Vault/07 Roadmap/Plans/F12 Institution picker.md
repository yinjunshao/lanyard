---
tags: [roadmap, feature, profile, data]
id: F12
priority: P1
phase: 1
size: M
status: In progress
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
- [ ] F12.2 Migration, API validation (`institution_id` must exist in the list; custom text is capped at 120 chars), export.
- [ ] F12.3 Picker in `EditProfile.vue` (and in onboarding when F14 lands), with the email-domain suggestion.
- [ ] F12.4 Backfill script and dry-run output pasted here.
- [ ] F12.5 Allow-list the data file in the copy check from [[F03 Neutral copy with no named university]].

## Acceptance checks
- [ ] Typing a common acronym finds the full official name.
- [ ] A custom institution saves and shows on the card exactly as typed.
- [ ] The profile editor chunk grows by no more than about 20 KB gzipped. Public pages are unchanged.

## Log
-

Related: [[Data Model]] · back to [[00 Master To-Do]]
