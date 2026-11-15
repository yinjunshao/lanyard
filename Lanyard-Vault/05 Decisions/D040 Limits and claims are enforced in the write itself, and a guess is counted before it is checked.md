---
tags: [decision, security]
status: Accepted
date: 2026-11-15
---
# D040 Limits and claims are enforced in the write itself, and a guess is counted before it is checked

**Status:** Accepted  ·  **Date:** 2026-11-15

## Context
The F35 audit ([[F35 Security audit against common attacks]], [[Security Audit 2026-11-15]]) sent requests at the same moment, the way an attacker would. Several routes read a count, decided, then wrote, so every request that read before the first write got through: 20 events for one credit, 11 cards on a Free account, six people seated by one invite, and 29 wrong sign-in codes plus the right one all checked. The offline tests had not shown this, because the in-memory database answers at once and a request ran to the end before the next one moved. Real D1 answers over the network, so requests interleave at every query.

## Decision
- **The write is the rule.** Anything limited or handed out is written with one conditional statement (`INSERT ... SELECT ... WHERE <the limit still holds>` or `UPDATE ... WHERE <still allowed>`), and anything that depends on it runs in the same batch only if that row went in. A count or check read before the write is only for a quick, friendly answer. Unique constraints stay as the second lock where they exist. Used now by event credits and the free society week, the Free card limit, team invites, promo codes, drops, vouchers and note tokens.
- **A guess is counted before it is checked.** Every wrong-guess limit (per code, per IP, per email, per account) takes its place in one atomic write that returns the new count (`takeTry` in `worker/codes.js`, or `UPDATE ... attempts < N RETURNING` for one code), and only then is the guess compared. A right guess gives its place back (`giveBack`), so only wrong guesses stay counted. A request over the limit is refused even with the right code.
- **Numbers from the browser are refused, not bent.** A quantity, count or rating that is not a whole number in range is a 400 and nothing is saved. Prices and amounts come only from the server's own tables.
- **Tests prove it at once.** `test/security-audit.mjs` gives every single query one turn of the event loop (a batch still runs alone, as in D1) and sends 10 to 60 requests together. New limits and claims add a case there.

## Consequences
A wrong guess and a right guess each cost one more write than before (the take, and for a right guess the give back). A loser in a race is told the same thing as someone who arrived late (no credits, the limit, an invalid invite). Signed-out card code lookups are counted per IP only. The payment bar in [[F27 Lanyard Plus and billing]] follows the same rule for provider events and credit grants.

**Evidence:** `worker/hosts.js` (`insertEvent`, team join, invite and transfer limits), `worker/index.js` (cards, card code lookup, photos), `worker/codes.js` (`takeTry`, `giveBack`), `worker/email-auth.js`, `worker/host-auth.js`, `worker/totp.js`, `worker/auth.js`, `worker/events.js` (`eventByCode`), `test/security-audit.mjs`

Related: [[D031 Host promo codes are one table, one claim per organisation and one generic refusal]], [[D039 Drops are sealed with a Worker key, given by one conditional write, and vouchers are marked with a staff PIN]] · back to [[Decision Log]]
