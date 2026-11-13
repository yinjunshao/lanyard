# Vault formats

How every note in `Lanyard-Vault/` is written. Obsidian links are `[[Note title]]` (no `.md`). Plain words, UK English, no emoji. Dates are absolute (`2026-11-13`), never "today" or "yesterday".

## Master To-Do (`07 Roadmap/00 Master To-Do.md`)

Sections, in this order. Keep them; edit inside them.

1. Frontmatter `tags: [roadmap, todo, moc]`, `created:`.
2. **Rules for agents.** Numbered rules, binding on every agent: before you start, while you work, when a feature is done. Do not weaken them; add to them when the owner sets a new standing rule.
3. **Owner decisions needed.** One checkbox line per open decision, naming the items it blocks:
   ```
   - [ ] Host reset: option **A** ... or **B** ... ([[F10 ...]])
   ```
   When answered: tick it and append the answer in bold with the date:
   ```
   - [x] Host reset: ... ([[F10 ...]]): **B, full wipe** (answered 2026-11-10)
   ```
   Partly answered: leave unticked and say what is answered and what is still open.
4. **Build order.** Phases as `### Phase N: name`, one line per item:
   ```
   - [ ] **F13** [[F13 Connection provenance]] · P1 · M · Needs: none
   ```
   - Claim: append ` (in progress: <who>, <date>)`.
   - Built but a check needs the owner: keep it unticked and change the claim text to say what it waits on, for example `(in progress: Claude subagent, 2026-11-11; all tasks built, waiting on one check that needs a phone: scan the Present QR from 3 m)`.
   - Built past an unticked dependency with the owner's say-so: add `built on F10 as it stands, with the owner's say-so`.
   - Done: tick it and replace the claim with ` (done <date>, last commit <short hash>)`. "Last commit" is the last code commit, not the bookkeeping commit after it (a commit cannot contain its own hash).
   - Sizes: S under half a day, M 1-2 days, L 3-5 days, XL a week or more. Priorities: P0 now, P1 next, P2 after, P3 only if needed.
5. **Dependency map.** A mermaid `graph LR` of Needs. Add edges for new items.
6. **Owner steps outside the code.** A table: When | Step | Note. One row per feature that needs the owner to do something (secrets, domains, migrations, reviews, real-device checks).
7. **Done log.** One line per finished feature: `- 2026-11-10 · F02 · d56a7de · one-line summary`, newest first.

## Plan note (`07 Roadmap/Plans/FNN <Title>.md`)

```
---
tags: [roadmap, feature, <area>]
id: F29
priority: P1
phase: 6
size: M
status: Not started            # Not started | In progress | Done
needs: [F12]
---
# F29 US and world universities

**Priority:** P1 · **Phase:** 6 <phase name> · **Size:** M · **Needs:** [[F12 Institution picker]] · back to [[00 Master To-Do]]

## What the owner asked for
Their words, quoted, with the date. Then any answers to questions you asked, quoted too.

## Current state
What the code does today, with file paths and approximate line numbers. Mark gaps you could not confirm.

## Plan
What to build. Specific: tables, routes, screens, limits, copy. Include privacy, security and performance rules that apply. Name the decisions this changes.

## Tasks
- [ ] F29.1 One commit's worth of work, imperative.
- [ ] F29.2 ...

## Acceptance checks
- [ ] Something a person or a test can verify, with the concrete input and the expected result.

## Log
-

Related: [[...]] · back to [[00 Master To-Do]]
```

Rules for plan notes:
- Task ids are `F<nn>.<n>`. Each task is one commit (or a few small ones). The last task covers the vault notes, tests and browser check.
- Acceptance checks must be checkable. "Works well" is not a check; "typing `MIT` finds Massachusetts Institute of Technology with ', United States' after it" is.
- A check that needs the real world (a phone, production, a real AI key) is written as such, so the agent knows it cannot tick it.
- When an agent ticks a task, it adds an indented line under it saying what was built and how it was verified.
- The Log is newest first. Each entry starts with the date and who: `- 2026-11-13 (Claude subagent): ...` or `- 2026-11-13 (owner decision): ...`. A finished feature's Log has 2-5 lines: what changed, what is left over, the owner steps to ship it.
- Owner decisions recorded after the fact go at the top of the Log and, when they change the plan, as a callout under the frontmatter heading line.

## Callouts

Use Obsidian callouts for anything a reader must not miss:

- `> [!question] ...` an open question for the owner. Agents add these instead of guessing on anything hard to undo.
- `> [!warning] ...` a known risk the owner chose to accept (for example pre-ticked consent boxes), with the rule it breaks.
- `> [!note] Owner decision YYYY-MM-DD: ...` a decision that changes the plan.
- `> [!important]` only in the Master To-Do header.

## Decision notes (`05 Decisions/DNNN <Title>.md`)

Title is the decision in one plain sentence: `D038 Named attendance is per event, shown on the check-in page and pre-ticked by the owner's choice`. Find the next free number by listing the folder.

```
---
tags: [decision, <area>]
status: Accepted        # Proposed | Accepted | Superseded
date: 2026-11-13
---
# D038 <Title>

**Status:** Accepted  ·  **Date:** 2026-11-13  ·  Narrows [[D004 ...]]

## Context
Why this came up, quoting the owner where relevant.

## Decision
Bulleted, bold lead words. Concrete: tables, routes, limits, file names.

## Consequences
What gets easier, harder, riskier. What a later feature must respect.

**Evidence:** tests, measurements, commits.

Related: [[F31 ...]] · back to [[Decision Log]]
```

Then add a row to `Decision Log.md`: `| [[DNNN Title]] | one-line summary | Accepted |`, below the table header separator. If it changes an older decision, add a pointer line in the older note.

## Other notes agents keep up to date

When a feature changes them: `03 Technical/Data Model.md`, `API Surface.md`, `Privacy and Data Retention.md`, `Codebase Map.md`, `Testing.md`, `Security.md`, `01 Product/Features.md`, `Screens and Routes.md`, and the audit note for privacy work. Update facts in place; do not append a changelog.

## Committing vault changes

- Vault notes are committed with the code they describe, in the same commit as the task they belong to.
- The plan note's task tick goes in the same commit as the task's code.
- Never stage `.obsidian/*.json` or notes the owner wrote.
- Bookkeeping-only commits (recording owner decisions, marking done): `Record owner decisions on X, Y and Z` or `F02: Mark logo to My card done; add F28 for the JS budget`.
