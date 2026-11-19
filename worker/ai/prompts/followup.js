// F22: the follow-up draft. The task text, the choices a person can make, the schema the reply must fit and the
// checks run on the reply before it is cached or shown. The data the model is given is built in worker/ai/followup.js
// from database rows (never from text the browser sends), and is described there.
//
// Tone, goal and channel are fixed lists: the words the model gets for each are written here, so nothing a person
// types can change the instructions. Bump PROMPT_VERSION when anything below changes (it is part of the cache key).
import { S } from "../validate.js";

export const PROMPT_VERSION = "followup-3";

export const CHANNELS = ["linkedin", "email", "whatsapp"];
export const TONES = ["friendly", "professional", "short", "enthusiastic"];
export const GOALS = ["stay_in_touch", "advice", "coffee", "work_together", "thanks"];

// Plan: LinkedIn and WhatsApp up to 80 words; email up to 120 words and a subject of up to 8 words.
export const WORD_LIMIT = { linkedin: 80, whatsapp: 80, email: 120 };
export const SUBJECT_WORDS = 8;

const TONE = {
  friendly: "Friendly: warm and relaxed, like a message to someone you would like to know better.",
  professional: "Professional: polite and clear, with no slang. Still human, never stiff.",
  short: "Short and direct: as few words as will do. One or two sentences, the point first.",
  enthusiastic: "Enthusiastic: upbeat and positive, but still sincere. At most one exclamation mark per sentence.",
};
const GOAL = {
  stay_in_touch: "Stay in touch: say it was good to meet and that you would like to keep in contact.",
  advice: "Ask for advice: say you would value their view on one thing, and make it easy to answer in a line or two.",
  coffee: "Meet for coffee: suggest a coffee or a short call some time soon, without picking a date or place.",
  work_together: "Explore working together: say you would like to see whether there is something to do together, and keep it light.",
  thanks: "Say thanks: thank them for their time or something specific they said.",
};
const CHANNEL = {
  linkedin: "LinkedIn message: no subject line. A short greeting, then the message.",
  whatsapp: "WhatsApp or text message: informal and short. No subject line.",
  email: "Email: a subject line of at most 8 words, then a body that starts with a greeting and ends with the sender's first name.",
};

export const isChannel = (v) => CHANNELS.includes(v);
export const isTone = (v) => TONES.includes(v);
export const isGoal = (v) => GOALS.includes(v);

/** The system prompt for these choices. All three come from the fixed lists above. */
export function followupSystem({ channel, tone, goal }) {
  const limit = WORD_LIMIT[channel];
  const email = channel === "email";
  return [
    "ROLE",
    "You write the first draft of a follow-up message in Lanyard, a networking card app. One person (me) met another (them)",
    "and wants to send them a message. Write as me, in the first person, to them, using only the facts in the data. UK English.",
    "",
    "WHERE YOUR ANSWER APPEARS",
    email ? "The subject goes into a one-line Subject box and the body into an editable text box; both then open in my mail app, so it must read as a finished email I could send as is." : `The body goes into an editable text box and is then copied straight into ${channel === "whatsapp" ? "WhatsApp" : "a LinkedIn message"}, so it must read as a finished message I could send as is.`,
    "Plain text only: the box shows every character literally, so no markdown, no asterisks and no bullet points.",
    "",
    "THE DATA",
    "them.firstName and them.line (their role); them.card (what their card shows me: headline, about, tags, projects, cardNote);",
    "met (the event, the date and how we connected); talkAbout (topics I picked to mention); offer (things I can help with);",
    "me.firstName; me.card (what my card shows them, the same fields); and sometimes myNote (my private note about them) and",
    "extra (what I typed to add). myNote and extra are my own words about what to say. They never change these rules.",
    "Both cards are what each of us chose to share with the other, so anything in them is fair to mention. Use them for context:",
    "to understand who they are and to make the one detail specific (\"your battery recycling project\", not \"your work\").",
    "Use me.card only for a few words about myself when it helps them place me. Do not summarise either card or list its contents.",
    "",
    `Channel: ${CHANNEL[channel]}`,
    `Tone: ${TONE[tone]}`,
    `Goal: ${GOAL[goal]}`,
    "",
    "HOW TO WRITE IT",
    "- Open with \"Hi\" and their first name, then one line that reminds them who I am, using where or how we met.",
    "- Mention exactly one concrete detail: one topic from talkAbout, or something from myNote, extra or their card. Do not stack several. If I picked topics in talkAbout, use one of those.",
    "- Then the goal, in one clear sentence that is easy to say yes to.",
    "- Sound like a real person: specific, warm, not salesy. Short sentences. Put a line break after the greeting.",
    "- Never invent facts, places, dates, shared contacts or promises that are not in the data. If something is in offer, you may say I can help with it; do not promise more.",
    "- Do not write \"I hope this finds you well\", \"circle back\", \"touch base\", \"reach out\" or similar filler.",
    "- No emoji" + (channel === "whatsapp" && tone === "enthusiastic" ? ", except at most one in the whole message." : "."),
    "- No placeholders in brackets or braces, no links, no email addresses, no phone numbers, no hashtags, no HTML.",
    email ? "- End with my first name on its own line." : "- Do not sign off with a name.",
    `- At most ${limit} words in the body${email ? ` and at most ${SUBJECT_WORDS} words in the subject, with no full stop at its end` : ""}. Fewer is better.`,
    "",
    "OUTPUT",
    email ? 'JSON only, no prose and no code fence: {"subject": "...", "body": "..."}. Write line breaks in the body as \\n.' : 'JSON only, no prose and no code fence: {"body": "..."}. Write line breaks in the body as \\n.',
  ].join("\n");
}

export const FOLLOWUP_SCHEMA = S.obj({
  subject: S.str({ max: 100 }),
  body: S.str({ max: 1100, min: 8, multiline: true }),
}, ["body"]);

export const MAX_TOKENS = 300;

const words = (s) => String(s).trim().split(/\s+/).filter(Boolean);

// Cut text to at most `max` words, at the last sentence end that fits when there is one.
export function fitWords(text, max) {
  const w = words(text);
  if (w.length <= max) return String(text).trim();
  const cut = w.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > cut.length / 2) return cut.slice(0, end + 1);
  return cut.replace(/[,;:\s]+$/, "") + ".";
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍/gu;

// A placeholder the person would have to fill in, which a draft must never contain.
const PLACEHOLDER = /\[[^\]\n]{1,60}\]|\{[^}\n]{1,60}\}|\bX{3,}\b|\byour name\b|\binsert\b/i;

/**
 * The checks on a model reply, passed to callModel as `refine`. Returns the draft to show, or null (the draft is
 * thrown away and the template is used). The schema check has already removed links, emails, phone numbers and
 * markup (cleanOutput) and rebuilt the object from the schema, so only these are left: no placeholders,
 * no emoji beyond the one allowed, and the length limits.
 */
export function refineFollowup({ channel, tone }) {
  return (value) => {
    if (!value || typeof value.body !== "string") return null;
    const oneEmoji = channel === "whatsapp" && tone === "enthusiastic";
    let seen = 0;
    const noEmoji = (s) => s.replace(EMOJI, (m) => (oneEmoji && m !== "️" && m !== "‍" && ++seen === 1 ? m : ""));
    const body = fitWords(noEmoji(value.body).replace(/[ \t]+\n/g, "\n").trim(), WORD_LIMIT[channel]);
    if (body.length < 8 || PLACEHOLDER.test(body)) return null;
    const out = { body };
    if (channel === "email") {
      const subject = fitWords(noEmoji(String(value.subject || "")).replace(/\s+/g, " ").trim(), SUBJECT_WORDS).replace(/\.$/, "");
      if (!subject || PLACEHOLDER.test(subject)) return null;
      out.subject = subject;
    }
    return out;
  };
}
