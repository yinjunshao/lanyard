// F18: the host's event form, turned into what the attendee page shows. Host pages only: the
// attendee app and the public pages never import this.
//
// eventFromForm() does to the form what the Worker does when the event is saved, so the
// preview shows what attendees will see after Save (test/preview.mjs saves real events and
// compares the two). createBody() is the request the "Create event" button sends; the
// dashboard sends it and the preview reads the same body, so they cannot disagree.

import { noticeOf } from "./collects.js";
import { cleanInfo } from "./eventinfoclean.js";
import { perkLines } from "./perkrows.js";

export const THEME_OPTIONS = [
  { value: "default", label: "Default — Persimmon" },
  { value: "formal", label: "Formal — navy strap" },
  { value: "night", label: "Night — dark" },
];
const THEMES = THEME_OPTIONS.map((o) => o.value);
export const HEX = /^#[0-9a-fA-F]{6}$/;

// F60: the help line under the host's "Suggest people to each other" switch (Create event step 3 and Details).
export const SUGGEST_HOST_HELP = "People checked in see up to five others to go and meet, from what their cards show and what they hope to get from the event. Each person can say no on the check-in page or later. You only see counts.";

const time = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

// F31: what the host switched on under "What this event collects", as the request carries it.
// `f` is the Create form or the Details form (they share these four keys). Null when the list is
// off, so an event without it sends and reads exactly what it did before F31.
export function collectBody(f) {
  if (!f.collectOn) return null;
  return { attendance: true, items: [f.collectEmail && "email", f.collectCard && "card"].filter(Boolean), why: f.collectWhy };
}

// F63: the food tick, its text and the diet ticks, as `info` carries them. Unticked sends no food at all, so ticking it
// off and saving clears the text; `access` is not on the form any more but is sent back unchanged so an old value is kept.
// `f` is the Create form or the Details form.
export function foodBody(f) {
  return f.foodOn ? { food: f.food || "", foodOn: true, diet: Array.isArray(f.diet) ? f.diet : [] } : { food: "" };
}

// The body for creating an event from the dashboard form.
export function createBody(f) {
  return {
    name: f.name,
    venue: f.venue,
    startsAt: f.startsAt,
    endsAt: f.endsAt,
    theme: f.theme,
    strapColor: f.strapColor || "",
    directoryOn: f.directoryOn,
    perks: perkLines(f),
    questions: [
      { key: "extra1", label: f.q1 },
      { key: "extra2", label: f.q2 },
    ].filter((q) => q.label.trim()),
    rsvpCount: f.rsvpCount === "" ? null : Number(f.rsvpCount),
    info: { access: f.access || "", ...foodBody(f) },
    feedbackOn: f.feedbackOn,
    feedbackQuestions: f.feedbackQuestions,
    ...(collectBody(f) ? { collect: collectBody(f) } : {}),
    // F60: only when the host switched suggestions off, so a default form sends exactly what it did before.
    ...(f.suggestOn === false ? { suggestOn: false } : {}),
  };
}

// What the check-in page is given for a create body (`b`) or for the Details form of a saved
// event. `questions` is the event's saved check-in questions, which Details cannot change.
// `organiser` is the organisation's name, for the notice an event with named attendance shows.
export function eventFromBody(b, questions, organiser) {
  const info = cleanInfo(b.info);
  const qs = questions || (Array.isArray(b.questions) ? b.questions : []).slice(0, 3)
    .map((q) => ({ key: String(q.key || "").replace(/[^a-z0-9_]/gi, "").slice(0, 24), label: String(q.label || "").slice(0, 60) }))
    .filter((q) => q.key && q.label);
  return {
    name: String(b.name || "").trim().slice(0, 120),
    venue: String(b.venue || "").slice(0, 120),
    startsAt: time(b.startsAt),
    theme: THEMES.includes(b.theme) ? b.theme : "default",
    strapColor: HEX.test(b.strapColor || "") ? b.strapColor : null,
    perks: (Array.isArray(b.perks) ? b.perks : []).slice(0, 10).map((x) => String(x).slice(0, 300)),
    directoryOn: b.directoryOn !== false,
    questions: qs,
    info,
    feedbackOn: b.feedbackOn !== false,
    ...(b.collect?.attendance === true ? { collects: noticeOf(b.collect, organiser) } : {}),
    // F60: the check-in page asks for an intention and shows the Suggest me tick unless this is false (as the Worker says it).
    ...(b.suggestOn === false ? { suggestOn: false } : {}),
  };
}

// The Details form of a saved event (HostLive) in the same shape.
export function detailsBody(d) {
  return { name: d.name, venue: d.venue, startsAt: d.startsAt, endsAt: d.endsAt, theme: d.theme, strapColor: d.strapColor || "",
    directoryOn: d.directoryOn, suggestOn: d.suggestOn !== false, perks: perkLines(d), rsvpCount: d.rsvpCount === "" ? null : Number(d.rsvpCount),
    info: { access: d.access || "", dress: d.dress, other: d.other, ...foodBody(d) },
    // Sent when the list is on, and once when it was on and is being switched off; an event that never had it sends nothing.
    ...(d.collectWas || d.collectOn ? { collect: collectBody(d) || { attendance: false } } : {}) };
}
