// F30: Create event in steps. The pieces the stepper shares, kept out of the components so the
// tests can run them without a browser. Host pages only.
//
// What Create sends has not changed: submitPlan() is the old single form's `create()` choice
// (a copy of an earlier event, or a new one through createBody), and the server's checks stay
// the source of truth. validateStep() is a convenience that stops the host a step early.
import { createBody, THEME_OPTIONS } from "./eventform";

// Basics, Look, At the event, Questions, Review. Step 3 also takes F31's "What this event collects".
export const STEPS = [
  { n: 1, key: "basics", name: "Basics" },
  { n: 2, key: "look", name: "Look" },
  { n: 3, key: "event", name: "At the event" },
  { n: 4, key: "questions", name: "Questions" },
  { n: 5, key: "review", name: "Review" },
];
export const LAST = STEPS.length;

export const blankForm = () => ({
  from: "", name: "", venue: "", startsAt: null, endsAt: null, theme: "default", strapColor: "",
  perksText: "", directoryOn: true, q1: "", q2: "",
  rsvpCount: "", access: "", food: "", feedbackOn: true, feedbackQuestions: [],
});

// A saved draft laid over a blank form: unknown keys are dropped, wrong types fall back, so an
// old or edited draft cannot break the form.
export function formFromDraft(d) {
  const b = blankForm();
  if (!d || typeof d !== "object") return b;
  for (const k of Object.keys(b)) {
    if (!(k in d)) continue;
    const v = d[k], was = b[k];
    if (k === "startsAt" || k === "endsAt") b[k] = Number.isFinite(v) ? v : null;
    else if (k === "rsvpCount") b[k] = typeof v === "number" || typeof v === "string" ? v : "";
    else if (typeof was === "string") b[k] = typeof v === "string" ? v : was;
    else if (typeof was === "boolean") b[k] = typeof v === "boolean" ? v : was;
    else if (Array.isArray(was)) b[k] = Array.isArray(v) ? v.filter((q) => q && typeof q === "object").map((q) => ({ ...q })) : was;
  }
  return b;
}

// What the Create button sends: the old form's choice, unchanged. A copy sends only the
// name and times (the server copies everything else from the earlier event).
export function submitPlan(f) {
  if (f.from) {
    return { copy: true, from: f.from, body: { name: f.name.trim() || undefined, startsAt: f.startsAt, endsAt: f.endsAt } };
  }
  return { copy: false, body: createBody(f) };
}

// Errors for one step: { field: message }. Empty means the step is fine.
export function validateStep(n, f) {
  const e = {};
  if (n === 1) {
    if (!f.from && !f.name.trim()) e.name = "Give the event a name.";
    if (f.startsAt && f.endsAt && f.endsAt <= f.startsAt) e.endsAt = "The end time must be after the start.";
  }
  if (n === 3 && !f.from) {
    const r = f.rsvpCount;
    if (r !== "" && r !== null && !(Number.isInteger(Number(r)) && Number(r) >= 0)) e.rsvpCount = "Use a whole number, or leave it empty.";
    if (String(f.perksText || "").split("\n").map((s) => s.trim()).filter(Boolean).length > 10) e.perksText = "Ten perks at most. Remove a few.";
  }
  if (n === 4 && !f.from && f.feedbackOn) {
    // The server drops a question with no text, or a pick list with fewer than two options, without a word.
    (f.feedbackQuestions || []).forEach((q, i) => {
      if (!String(q.label || "").trim()) e[`feedback${i}`] = `Question ${i + 1} has no text. Write it or remove it.`;
      else if ((q.type === "single" || q.type === "multi") && new Set((q.options || []).map((o) => String(o || "").trim()).filter(Boolean)).size < 2) {
        e[`feedback${i}`] = `Question ${i + 1} needs at least two different options.`;
      }
    });
  }
  return e;
}

// The first step before `upTo` that has a problem (1 if none is found, or 0 when all is well).
export function firstBadStep(upTo, f) {
  for (let n = 1; n < upTo; n += 1) if (Object.keys(validateStep(n, f)).length) return n;
  return 0;
}

// Which step a server message belongs to, and the field in it. The server's wording is the
// source of truth; anything this does not recognise stays on Review next to Create.
export function serverErrorField(message) {
  const m = String(message || "");
  if (/end time/i.test(m)) return { step: 1, field: "endsAt" };
  if (/name/i.test(m) && /required/i.test(m)) return { step: 1, field: "name" };
  return null;
}

export const stepFromQuery = (q) => {
  const n = Number(Array.isArray(q) ? q[0] : q);
  return Number.isInteger(n) && n >= 1 && n <= LAST ? n : 0;
};

// What "Start from an earlier event" copies, for steps 2 to 4 and Review. `s` is the live
// route's answer for that event ({ event, sponsors }). The values are only shown: Create sends
// the name and times, and the server copies the rest.
const themeLabel = (t) => THEME_OPTIONS.find((o) => o.value === t)?.label || "Default";
const yes = (b) => (b ? "Yes" : "No");
export function copyFacts(s) {
  const e = s?.event;
  if (!e) return null;
  const info = e.info || {};
  const qs = (e.questions || []).map((q) => q.label).filter(Boolean);
  const sp = (s.sponsors || []).map((x) => x.name).filter(Boolean);
  return {
    basics: [["Venue", e.venue || "None"]],
    look: [["Theme", themeLabel(e.theme)], ["Brand colour", e.strapColor || "The theme colour"]],
    event: [
      ["Perks", (e.perks || []).join(", ") || "None"],
      ["Access info", info.access || "None"],
      ["Food and drink", info.food || "None"],
      ["Sign-ups so far", e.rsvpCount ?? "None"],
      ["Attendee room", yes(e.directoryOn)],
    ],
    questions: [
      ["Check-in questions", qs.join(", ") || "None"],
      ["Feedback after the event", e.feedbackOn ? "Asked" : "Not asked"],
      ["Sponsors", sp.join(", ") || "None"],
    ],
  };
}
