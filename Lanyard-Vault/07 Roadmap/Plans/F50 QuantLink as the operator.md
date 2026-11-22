---
tags: [roadmap, feature, legal, privacy]
id: F50
priority: P1
phase: 9
size: S
status: Not started
needs: [F45, F48, F49]
---
# F50 QuantLink as the operator

**Priority:** P1 · **Phase:** 9 Owner requests (2026-11-22) · **Size:** S · **Needs:** [[F45 Email when someone new connects]], [[F48 Follow-up reminder emails]], [[F49 Profile score and finish-your-profile emails]] (so one Terms and Privacy version bump covers all of their policy changes) · back to [[00 Master To-Do]]

> [!note] Owner decisions 2026-11-22: show the company **name only** and keep the existing `lanyd.fyi` addresses (they are forwarded to QuantLink); no address, no registration number and no person's name anywhere. Keep **England and Wales** law and the UK GDPR framing: "the Hong Kong company is holding the business ... the business still operates in the UK ... nothing is processed in Hong Kong".

> [!warning] For the owner's lawyer, not decided here: a controller that is not established in the UK and offers a service to people in the UK must appoint a UK representative (UK GDPR Article 27) and may need to pay the ICO fee. The owner says the business operates in the UK; whether that makes QuantLink "established" in the UK is a legal question. The open "ICO registration" line in the Master To-Do stays open.

## What the owner asked for (2026-11-22)
"We are now a product of this company called QuantLink, which is based in Hong Kong. The document I attached are all the information based off of it. In the terms of service and privacy and anywhere on the website, obviously we do not want to disclose any specific name of person or any unnecessary information that might be too much. We should only provide completely compulsory information as per compliance. So read through that and then put the relevant information and update it."

Answers (2026-11-22): "Do name and email only, but just use the current email that has lanyd.fyi domains because they get forwarded to QuantLink. just change the name." On governing law: "Just that the Hong Kong company is holding the business, which is allowed. And therefore, the business still operates in the UK. So it is using UK, England, and Wales laws ... nothing is processed in Hong Kong, but it's just the company is registered in Hong Kong."

## What the company document gives (read by the orchestrator, 2026-11-22)
The owner's file is a Hong Kong annual return (form NAR1). The only item used: the registered English name **Quantlink Investment Service Company Limited** (a private company). Hong Kong's Companies (Disclosure of Company Name) Regulation (Cap. 622B) requires a company's registered name, which already shows its limited liability, legibly on its website ([Companies Registry FAQ](https://www.cr.gov.hk/en/faq/companies-ordinance/disclose-company-name-liability.htm)). Nothing else from the document goes on the site: not the address, the business registration number, the share capital, or any director's, secretary's or shareholder's name. Do not copy the document into the repo.

## Current state
- `src/views/Privacy.vue` lines 4-5 and 23: `OPERATOR = "ARCK Softworks"`, `ADDRESS = "WC1E 6BT"`, "... of {{ ADDRESS }} is the controller ... under the UK GDPR and the Data Protection Act 2018".
- `src/views/Terms.vue` lines 5-6 and 27: the same constants; section 14 England and Wales (unchanged).
- `worker/legal.js` `TERMS_VERSION = "2026-11-13"`; tests pin it.
- `src/lib/contact.js`: `help@lanyd.fyi`, `legal@lanyd.fyi` (unchanged).
- No footer names the operator today (check `Landing.vue`, `Hosts.vue`, the host portal and the legal pages).

## Plan
1. Privacy section 1: "Lanyard is run by Quantlink Investment Service Company Limited ("Lanyard", "we"), which is the controller of the personal data described here under the UK GDPR and the Data Protection Act 2018. Contact us at legal@lanyd.fyi …". Remove the address constant. Keep the ICO complaint line.
2. Terms section 1: "It is run by Quantlink Investment Service Company Limited ("Lanyard", "we", "us")." No address. Governing law unchanged.
3. A one-line footer, small and muted, on the public marketing pages (landing, hosts) and the legal pages: "Lanyard is run by Quantlink Investment Service Company Limited." Keep public pages inside the JS budget (it is text in templates, so it should cost bytes only; report numbers).
4. Remove the "Bracketed items are for the operator to fill in" comments where nothing bracketed is left.
5. **One version bump** for F45 to F50: `TERMS_VERSION` to the date of this commit, both `UPDATED` dates; update tests that pin the version. Everyone is asked to agree again on next use (existing flow).
6. Vault: Master To-Do "Legal entity" decision line, [[F27 Lanyard Plus and billing]] (`SELLER_NAME` is the company name; the address question returns when paid plans go live), [[UK GDPR Audit 2026-11-01]] High 3, [[Privacy and Data Retention]].

## Tasks
- [ ] F50.1 Operator name in Privacy, Terms and the footers; the version bump; tests updated; vault notes; browser check of the footer at 375 and 1280 px, light and dark.

## Acceptance checks
- [ ] "ARCK Softworks" and "WC1E 6BT" appear nowhere in `src/` or `worker/` (test guard).
- [ ] The Privacy Policy and Terms name Quantlink Investment Service Company Limited and give only the `lanyd.fyi` addresses; no street address, registration number or person's name appears (test guard for the document's street name, the registration number and the names in it, without writing those names into the repo in plain text: compare hashes or check for a short list kept out of git, the subagent's choice).
- [ ] The landing, hosts, Terms and Privacy pages show the footer line.
- [ ] `TERMS_VERSION` is bumped and a signed-in person who agreed to the old version is asked again.
- [ ] `npm test` passes; public pages within budget.

## Log
-

Related: [[F27 Lanyard Plus and billing]] · [[UK GDPR Audit 2026-11-01]] · back to [[00 Master To-Do]]
