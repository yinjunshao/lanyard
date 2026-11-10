// F15: whether an event is upcoming, ongoing or ended, for one attendee. The Worker
// and the app share this rule; src/lib/eventstatus.js is a byte-for-byte copy and
// test/events-hub.mjs fails if the two drift apart.
//
// ev: { startsAt, endsAt, endedAt } in unix ms (null or missing when not set).
// checkedInAt: when this person checked in. t: the clock, in ms.
export const NO_END_GRACE_MS = 12 * 60 * 60 * 1000;

export function eventStatus(ev, checkedInAt, t = Date.now()) {
  const startsAt = ev?.startsAt || null;
  const endsAt = ev?.endsAt || null;
  // The host ended it, or its end time has come: over.
  if (ev?.endedAt) return "ended";
  if (endsAt && endsAt <= t) return "ended";
  // Not started yet (checked in early).
  if (startsAt && startsAt > t) return "upcoming";
  // No end time: over 12 hours after the later of the start and this person's check-in.
  if (!endsAt && t - Math.max(startsAt || 0, checkedInAt || 0) > NO_END_GRACE_MS) return "ended";
  return "ongoing";
}

export const isLive = (status) => status === "ongoing";
