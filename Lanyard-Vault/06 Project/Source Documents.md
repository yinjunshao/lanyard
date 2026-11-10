---
tags: [project, sources]
---
# Source Documents

This vault was built from these files in the project folder. When they disagree with the code, the code wins (especially on prices).

| File | What it holds | Caveat |
| --- | --- | --- |
| `docs/Lanyard Product Summary and Plan.md` | Product, business model, pricing phases, GDPR checklist, design brief, build brief, data model | Some prices are older suggestions |
| `docs/OPPORTUNITY.md` | Competitive brief, wedge, ephemeral-data framing, decision criteria (2026-10-14) | Describes v1 (P2P handshake); market sizes omitted on purpose |
| `docs/ACTIVITY-MODE-STRATEGY.md` | B2B2C reasoning, risks, validation plan (2026-10-16) | Currency and numbers partly for China; projections invented |
| `DEPLOY.md` / `DEPLOY-V2.md` | v1 KV deploy, v2 D1+R2 deploy, manual billing SQL | |
| `worker/plans.js`, `src/views/Hosts.vue` | Current prices and caps | Source of truth |
| `migrations/0001-0013` | Schema | |
| `brag-output/brag-plan.md` | Demo video storyboard | |
| `logo-kit/GUIDELINES.md` | Brand rules | |
| `test/README.md`, `test/baseline-security.txt` | Test suites and an early failing baseline | Baseline is pre-hardening |
| `build-deck.mjs` | Pitch deck generator | Stale |
| git log | Dates of work | |

Not read: `.dev.vars` (secrets), `.wrangler/` build output, `node_modules`, media binaries.
