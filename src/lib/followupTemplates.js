// F22: the follow-up draft without AI. A starting point built from the same choices the AI version uses (tone, goal,
// channel, the first topic, the event), shown when AI is off, out of allowance, not open to the account, or when
// the reply did not pass the checks. Plain text only; nothing here is sent anywhere. No imports, so the Worker's
// tests can load it from here and the composer chunk stays small.
//
//   templateDraft({ channel, tone, goal, themFirst, meFirst, eventName, topic, offer })  ->  { subject?, body }
//
// Word limits match the AI version (worker/ai/prompts/followup.js): LinkedIn and WhatsApp 80, email 120 and a subject of 8.

export const CHANNELS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp or text" },
];
export const TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "short", label: "Short and direct" },
  { id: "enthusiastic", label: "Enthusiastic" },
];
export const GOALS = [
  { id: "stay_in_touch", label: "Stay in touch" },
  { id: "advice", label: "Ask for advice" },
  { id: "coffee", label: "Meet for coffee" },
  { id: "work_together", label: "Explore working together" },
  { id: "thanks", label: "Say thanks" },
];

// ---- F44: your own tone, goal and points ----
// The rule for what may be typed lives here, once: the page uses it to warn early, the Worker uses it as the real check.
export const CUSTOM_MAX = { tone: 15, goal: 40, point: 40 };
export const MAX_CUSTOM_POINTS = 3;
const LABEL = { tone: "Your own tone", goal: "Your own goal", point: "Your own point" };
// Invisible characters Unicode counts as marks or letters (variation selectors, joiners, fillers) or that reorder text. The
// other zero-width, direction and control characters are removed as \p{Cf} and \p{Cc} below.
const HIDDEN = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]|[\u{1D173}-\u{1D17A}]|[\u{E0000}-\u{E0FFF}]/gu;
const LINE_BREAK = /[\n\r\u000B\u000C\u0085\u2028\u2029]/;
const ALLOWED = /^[\p{L}\p{M}\p{Nd}' \-,.!?]+$/u;

/**
 * Typed text made safe and checked. NFC; control, zero-width and direction characters removed; spaces collapsed and
 * trimmed; a curly apostrophe made plain. Then only letters (any script), marks, digits, spaces and ' - , . ! ? are
 * allowed, on one line, 1 to the limit for `kind` ("tone", "goal" or "point") counted after all that. A line break is
 * refused, not turned into a space. Returns { ok: true, text } or { ok: false, why, message }.
 */
export function normaliseCustom(raw, kind) {
  const max = CUSTOM_MAX[kind];
  const label = LABEL[kind];
  const no = (why, message) => ({ ok: false, why, message });
  if (typeof raw !== "string") return no("type", `${label} must be text.`);
  if (raw.length > 400) return no("long", `${label} can be up to ${max} characters.`);
  let s = raw.normalize("NFC");
  if (LINE_BREAK.test(s)) return no("lines", `${label} must be on one line.`);
  s = s.replace(HIDDEN, "").replace(/\s+/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\u2019/g, "'").replace(/ {2,}/g, " ").trim();
  if (!s) return no("empty", kind === "point" ? "Type your point, or remove it." : `Type your own ${kind}, or pick one from the list.`);
  if (!ALLOWED.test(s)) return no("chars", `${label} can use letters, numbers, spaces and ' - , . ! ? only.`);
  if ([...s].length > max) return no("long", `${label} can be up to ${max} characters.`);
  return { ok: true, text: s };
}

const t = (v) => (typeof v === "string" ? v.trim() : "");

// What is said about the goal, by tone. `x` is the topic ("robotics") or "" when there is none.
const ASK = {
  stay_in_touch: {
    friendly: () => "I'd like to keep in touch.",
    professional: () => "I would like to stay in touch.",
    short: () => "Let's keep in touch.",
    enthusiastic: () => "I'd love to keep in touch.",
  },
  advice: {
    friendly: (x) => `Could I ask your advice on something${x ? ` to do with ${x}` : ""}? A line or two back would be great.`,
    professional: (x) => `I would value your advice${x ? ` on ${x}` : ""}, if you have a moment to share it.`,
    short: (x) => `Can I ask your advice${x ? ` on ${x}` : ""}?`,
    enthusiastic: (x) => `I'd really value your advice${x ? ` on ${x}` : ""}, if you have a minute.`,
  },
  coffee: {
    friendly: () => "Would you fancy a coffee or a quick call some time soon?",
    professional: () => "Would you be open to a coffee or a short call in the coming weeks?",
    short: () => "Coffee or a quick call soon?",
    enthusiastic: () => "Would you be up for a coffee or a quick call soon? I'd really enjoy it.",
  },
  work_together: {
    friendly: (x) => `I think we could do something good together${x ? ` around ${x}` : ""}. Would you be up for a chat about it?`,
    professional: (x) => `I would like to explore whether we could work together${x ? ` on ${x}` : ""}. Would you be open to a conversation?`,
    short: () => "Open to a chat about working together?",
    enthusiastic: (x) => `I'd love to see whether we could work together${x ? ` on ${x}` : ""}. Would you be up for a chat?`,
  },
  thanks: {
    friendly: () => "Thank you for your time. I really appreciated it.",
    professional: () => "Thank you for your time. I appreciated the conversation.",
    short: () => "Thanks for your time.",
    enthusiastic: () => "Thank you so much for your time. I really appreciated it.",
  },
};

const SUBJECT = {
  stay_in_touch: (e) => (e ? `Good to meet you at ${e}` : "Good to meet you"),
  advice: (e) => (e ? `A quick question after ${e}` : "A quick question"),
  coffee: (e) => (e ? `Coffee after ${e}?` : "Coffee some time?"),
  work_together: (e) => (e ? `Working together, after ${e}` : "Working together?"),
  thanks: (e) => (e ? `Thank you, from ${e}` : "Thank you"),
};

const SUBJECT_CUSTOM = (e) => (e ? `Following up after ${e}` : "Following up");
// What a custom goal says, by tone: neutral, nothing taken from what was typed.
const NEUTRAL = {
  friendly: "I'd like to keep the conversation going.",
  professional: "I would like to continue our conversation.",
  short: "Let's keep talking.",
  enthusiastic: "I'd love to keep the conversation going.",
};

// How the typed points are brought in, by tone. They are listed as written.
const OWN_POINTS = {
  friendly: (x) => `It would be good to talk about ${x}.`,
  professional: (x) => `I would welcome a conversation about ${x}.`,
  short: (x) => `Let's talk about ${x}.`,
  enthusiastic: (x) => `I'd love to talk about ${x}.`,
};

const cutWords = (s, n) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");

// Typed points are listed as written: "a", "a and b", "a, b and c".
const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

// F44: a custom tone ({ custom }) uses the friendly words; a custom goal uses one neutral line; `points` are typed topics.
export function templateDraft({ channel = "linkedin", tone = "friendly", goal = "stay_in_touch", themFirst, meFirst, eventName, topic, offer, points } = {}) {
  if (typeof tone !== "string" || !ASK.stay_in_touch[tone]) tone = "friendly";
  const customGoal = typeof goal !== "string" || !ASK[goal];
  const typed = (Array.isArray(points) ? points : []).map(t).filter(Boolean).slice(0, MAX_CUSTOM_POINTS);
  const them = t(themFirst), me = t(meFirst), event = t(eventName), x = t(topic), can = t(offer);
  const hello = tone === "professional" ? `Hello ${them || "there"},` : tone === "enthusiastic" ? `Hi ${them || "there"}!` : `Hi ${them || "there"},`;
  const nice = tone === "enthusiastic" ? "great" : "good";
  const met = event
    ? tone === "professional" ? `It was a pleasure to meet you at ${event}.` : `It was ${nice} to meet you at ${event}.`
    : tone === "professional" ? "It was a pleasure to meet you." : `It was ${nice} to meet you.`;
  // One concrete detail, as in the AI version. The topic goes into the ask when the goal uses it, otherwise into its own
  // sentence (not at all in the short tone). The event is already in the opening line.
  const inAsk = !!x && (goal === "advice" || goal === "work_together");
  const detail = x && !inAsk && tone !== "short" ? (tone === "professional" ? `I enjoyed our conversation about ${x}.` : `I enjoyed hearing about ${x}.`) : "";
  const ask = customGoal ? NEUTRAL[tone] : ASK[goal][tone](inAsk ? x : "");
  const own = typed.length ? OWN_POINTS[tone](listed(typed)) : "";
  // An offer is mentioned only when the person chose one, and only as something they can help with.
  const help = can && tone !== "short" ? `I'm happy to help with ${can} if that's useful.` : "";
  const parts = [met, detail, own, ask, help].filter(Boolean).join(" ");
  const sign = channel === "email" && me ? `\n\n${tone === "professional" ? "Kind regards" : "Best"},\n${me}` : "";
  const body = `${hello}${tone === "short" ? " " : "\n\n"}${parts}${sign}`.trim();
  return channel === "email" ? { subject: cutWords((customGoal ? SUBJECT_CUSTOM : SUBJECT[goal])(event), 8), body } : { body };
}
