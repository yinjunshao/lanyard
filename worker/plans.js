// What each plan includes. One paid personal tier ("plus"); hosts buy event
// credits (see HOST_SKUS) or get a plan from us. Change numbers here only —
// the worker and the apps read them from this file / /api/me.
import { now } from "./db.js";

export const USER_PLANS = {
  free: { label: "Free", cards: 3, customStrap: false },
  plus: { label: "Plus", cards: 12, customStrap: true },
};

export const PLUS_PRICE = { monthlyPence: 299, yearlyPence: 2400 };

export function planOf(userRow) {
  const active = userRow?.plan === "plus" && (!userRow.plan_until || userRow.plan_until > now());
  const tier = active ? "plus" : "free";
  return { tier, ...USER_PLANS[tier] };
}

// Event credit packs. 1 credit = 1 event of up to 300 check-ins; bigger events
// use 2 credits, 1,000+ is quoted. `term` passes are "unlimited" for a term
// (modelled as 99 credits that expire), fair use is 300 check-ins per event.
export const HOST_SKUS = {
  society_1:    { label: "1 event",           credits: 1,  days: 365, pence: 500,   audience: "society" },
  society_5:    { label: "5 events",          credits: 5,  days: 365, pence: 2000,  audience: "society" },
  society_term: { label: "Term pass",         credits: 99, days: 120, pence: 2500,  audience: "society" },
  standard_1:   { label: "1 event",           credits: 1,  days: 365, pence: 2500,  audience: "standard" },
  standard_5:   { label: "5 events",          credits: 5,  days: 365, pence: 9900,  audience: "standard" },
  standard_15:  { label: "15 events",         credits: 15, days: 365, pence: 24900, audience: "standard" },
  // Not self-serve: recorded as a request so we can quote.
  quote_service:    { label: "Careers service / students' union plan", credits: 0, days: 0, pence: 0, audience: "quote" },
  quote_enterprise: { label: "Enterprise or university licence",       credits: 0, days: 0, pence: 0, audience: "quote" },
};

export const FREE_EVENTS_FOR_NEW_ORG = 3;
export const FREE_EVENT_DAYS = 365;
