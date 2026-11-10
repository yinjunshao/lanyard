---
tags: [technical, security, auth]
---
# Auth and Sessions

## Guest first
Anyone scanning a card can connect with a name and a selfie. No account, no email. A guest is minted only on an action, not by page views or bots (a test checks this). New guests are rate-limited per IP.

## Session
- Cookie `lanyard_session`: HttpOnly, SameSite=Lax, Secure on https, 365 days.
- The database stores only the **SHA-256** of the token, so a leaked backup cannot be replayed.

## Claiming an account
At home the guest finishes their profile and adds a **passkey** (Face ID / fingerprint). Optional methods: email sign-in code, authenticator app (TOTP, secrets encrypted with `TOTP_KEY`), recovery code.

## What was dropped
The v1 login (birthday + 4-char hex code) was guessable (65,536 combinations) and birthdays are public. See [[D003 Guest first with passkeys]].

## Passkey scope
`RP_ID` is tied to the hostname. Passkeys made on the workers.dev address stay on that address; `RP_DOMAIN` (lanyd.fyi) covers the custom domain. A parent-domain RP_ID would let one passkey work on both main and `host.` sites. See [[Deployment]].

## Student verification
University email domain (ac.uk first) gives a verified-student flag; only domain + flag are public. See [[Customers and Buyers]].

Related: [[Security]], [[Privacy and Data Retention]]
