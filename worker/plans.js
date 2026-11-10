// What each plan includes. One paid personal tier ("plus"); hosts buy event
// credits (see HOST_SKUS) or get a plan from us. Change numbers here only —
// the worker and the apps read them from this file / /api/me.
import { now } from "./db.js";

export const USER_PLANS = {
  free: { label: "Free", cards: 3, customStrap: false },
  plus: { label: "Plus", cards: 12, customStrap: true },
};

export const PLUS_PRICE = { monthlyPence: 149, yearlyPence: 1199 };

export function planOf(userRow) {
  const active = userRow?.plan === "plus" && (!userRow.plan_until || userRow.plan_until > now());
  const tier = active ? "plus" : "free";
  return { tier, ...USER_PLANS[tier] };
}

// Event credit packs. 1 credit = 1 event of up to 300 check-ins; bigger events
// use 2 credits, 1,000+ is quoted. `term` passes are "unlimited" for a term
// (modelled as 99 credits that expire), fair use is 300 check-ins per event.
export const HOST_SKUS = {
  society_1:    { label: "1 event",           credits: 1,  days: 365, pence: 250,   audience: "society" },
  society_5:    { label: "5 events",          credits: 5,  days: 365, pence: 1000,  audience: "society" },
  society_term: { label: "Term pass",         credits: 99, days: 120, pence: 1250,  audience: "society" },
  standard_1:   { label: "1 event",           credits: 1,  days: 365, pence: 1250,  audience: "standard" },
  standard_5:   { label: "5 events",          credits: 5,  days: 365, pence: 4950,  audience: "standard" },
  standard_15:  { label: "15 events",         credits: 15, days: 365, pence: 12450, audience: "standard" },
  // Universities and other educational institutions: about 40% off standard.
  institution_1:  { label: "1 event",   credits: 1,  days: 365, pence: 750,   audience: "institution" },
  institution_5:  { label: "5 events",  credits: 5,  days: 365, pence: 2950,  audience: "institution" },
  institution_15: { label: "15 events", credits: 15, days: 365, pence: 7450,  audience: "institution" },
  // Not self-serve: recorded as a request so we can quote.
  quote_service:    { label: "Careers service / students' union plan", credits: 0, days: 0, pence: 0, audience: "quote" },
  quote_enterprise: { label: "Enterprise or university licence",       credits: 0, days: 0, pence: 0, audience: "quote" },
};

export const FREE_EVENTS_FOR_NEW_ORG = 3;
export const FREE_EVENT_DAYS = 365;

// Organisation kinds. Societies and institutions apply and wait for an admin;
// companies and individuals pay standard prices straight away.
export const ORG_KINDS = ["society", "institution", "company", "individual"];
export const NEEDS_APPROVAL = new Set(["society", "institution"]);

// Student societies run for free within these limits, and buy packs beyond them.
export const SOCIETY_FREE = { eventsPerWeek: 1, checkinCap: 200 };
export const STANDARD_CHECKIN_CAP = 300;
/** Societies are hard-capped at the door; everyone else is nudged at 300. */
export const checkinCapFor = (orgType) => (orgType === "society" ? SOCIETY_FREE.checkinCap : STANDARD_CHECKIN_CAP);
export const skuAudience = (orgType) => (orgType === "society" ? "society" : orgType === "institution" ? "institution" : "standard");

// AI allowances (F21, "AI Safety and Cost Plan" section 4). One entry per feature; each says what each
// kind of caller may do. A caller with no entry for the feature is refused, so a host cannot call a
// follow-up draft and an attendee cannot call a host summary. Days and months are UTC. perScope is a
// limit per event (who to meet). optOut: the people whose data is in the prompt may have switched off
// AI search, and the foundation then refuses (worker/ai/optout.js). Change numbers here only.
export const AI_LIMITS = {
  followup:         { label: "drafts",      free: { day: 3, month: 15 }, plus: { day: 15, month: 150 } },
  people_search:    { label: "searches",    optOut: true, free: { day: 5 }, plus: { day: 30 } },
  who_to_meet:      { label: "suggestions", optOut: true, free: { perScope: 3 }, plus: { perScope: 10 } },
  // The summary a host asks for again is limited to 3 a day. The one written for them when feedback closes
  // is a separate feature with a high cap that only stops a loop, so it never uses up those 3.
  feedback_summary:      { label: "summaries", host: { day: 3 } },
  feedback_summary_auto: { label: "summaries", host: { day: 30 } },
  // The admin page's "test the connection" button.
  admin_test:       { label: "tests",       admin: { day: 20 } },
};
