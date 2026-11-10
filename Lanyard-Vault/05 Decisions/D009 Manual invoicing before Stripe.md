---
tags: [decision]
status: Accepted
date: 2026-10-28
---
# D009 Manual invoicing before Stripe

**Status:** Accepted  ·  **Date:** 2026-10-28

## Context
Billing system is premature before anyone has paid. Universities and careers services often pay by invoice or purchase order anyway.

## Decision
Hosts submit billing requests; admin invoices and grants credits by hand (SQL documented). Stripe comes later.

## Consequences
No payment code to secure now; manual work per sale; fine for the first handful of customers.

**Evidence:** migrations/0003, DEPLOY-V2.md

Related: [[Host Portal and Billing]] · back to [[Decision Log]]
