# Review and report

A subagent's report is its claim, not proof. Check before you tell the owner anything is done.

## Re-check (every item)

```bash
cd /d/Hackathons/ClaudeBuildersClub/lanyard
git status --short                      # only the owner's own files should show
git log --oneline -1                    # matches the report's last commit
npm test 2>&1 | grep -E "^ok +(PublicCard|PrivacyRequest)|budget:|[1-9][0-9]* failed"; echo "test ${PIPESTATUS[0]}"
```

Add, by budget level (see SKILL.md):
- **standard:** `npm run build`; read the new migration (`grep -v '^--' migrations/<new>.sql`) and confirm it only adds, or that anything destructive copies data first; confirm local servers are stopped (`netstat -ano | grep -E ':(8787|5173)\s.*LISTEN'`).
- **thorough:** also read the diff hunks for auth, money, deletion and privacy (`git diff <before>..HEAD -- worker/<file>`), and try one acceptance check yourself.

Fix small things yourself in a separate commit: a Master To-Do tick left unticked with "done" text, a stray line-ending-only change (`git checkout -- <file>` after checking `git diff --ignore-cr-at-eol` is empty), a flaky test (reproduce, find the cause, fix it). Stop processes a subagent left running (find them by command line, e.g. `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'wrangler dev' }`), but only ones your subagents started.

## Report to the owner

Lead with the outcome in one sentence: what finished, whether it is fully done or waiting on something, and what is running next. Then:

- **What it changed:** bullets in the owner's terms (screens, behaviour), not file names, unless they need to act on a file.
- **How it was checked:** what tests and browser checks actually ran.
- **Not verified:** a short list (real phone, screen reader, a page not opened in a browser). Never omit this.
- **Decisions for you:** each decision the subagent made without the owner that the owner may want to reverse, and each open question. Give your recommendation and the reason in one line. If a question has a one-line change, say so.
- **Things to know:** risks, limits, numbers that matter (budget headroom, migrations production is behind on, an untested destructive path).

Use a table when comparing items or numbers (budget before/after, roadmap status). Keep each bullet to one idea. UK English, plain words.

Close with the `wrap_up` box: a two-or-three-sentence recap (what is now true, what is not done or not verified), and, when the next move is the owner's, one short question with one or two buttons.

## Roadmap status table

When everything buildable is done, or the owner asks where things stand:

| Status | Items |
| --- | --- |
| Done | F01–F09, ... |
| Built, waiting on your production rollout | F10, F19 |
| Built, waiting on a real AI key | F21–F25 |
| Blocked on your details | F26, F27 |

Then the owner's ordered steps to ship it (push, migrations, secrets, deploy, real-world checks), each one line.

## Recurring owner decisions to raise, never to make

- Terms and Privacy version bumps when a feature changes the policy (batch them: one bump after several changes, since none is live until deploy).
- Retention periods for new stored data.
- Anything that narrows or overrides an existing decision note.
- Consent design, especially pre-ticked boxes.
- Prices, legal identity, what a paid plan includes.
- Production steps: secrets, domains, destructive scripts, the order of migrate and deploy.
