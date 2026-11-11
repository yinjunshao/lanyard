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

const cutWords = (s, n) => s.split(/\s+/).filter(Boolean).slice(0, n).join(" ");

export function templateDraft({ channel = "linkedin", tone = "friendly", goal = "stay_in_touch", themFirst, meFirst, eventName, topic, offer } = {}) {
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
  const ask = ((ASK[goal] || ASK.stay_in_touch)[tone] || ASK.stay_in_touch.friendly)(inAsk ? x : "");
  // An offer is mentioned only when the person chose one, and only as something they can help with.
  const help = can && tone !== "short" ? `I'm happy to help with ${can} if that's useful.` : "";
  const parts = [met, detail, ask, help].filter(Boolean).join(" ");
  const sign = channel === "email" && me ? `\n\n${tone === "professional" ? "Kind regards" : "Best"},\n${me}` : "";
  const body = `${hello}${tone === "short" ? " " : "\n\n"}${parts}${sign}`.trim();
  return channel === "email" ? { subject: cutWords(SUBJECT[goal]?.(event) || SUBJECT.stay_in_touch(event), 8), body } : { body };
}
