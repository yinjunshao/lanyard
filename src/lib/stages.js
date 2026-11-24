// Feature stages and tutorials (F59, D055). A stage is a moment when a feature has become useful to someone: it has a trigger
// the app already knows (a count of their connections, an event they checked in to), the page it runs on, and a short
// tutorial of two to four steps that points at the real control. This file is only data and two small functions, with no
// imports: the Worker reads STAGE_IDS from it (the seen route refuses any other id) and the signed-in app reads the rest.
// It is never imported by a public page.
//
// `when(progress, ctx)`: progress is what the Worker returns from GET /api/stages (counts and two yes/no answers, nothing
// about anyone else); ctx is what the page itself knows (for a person's page: whether you met at an event).
// Each step: `tip` is the data-tip="..." attribute of the control it points at; `try: true` on the last step offers
// "Try it", which presses the real control.

export const STAGES = [
  {
    id: "ai_finder", page: "people",
    // The owner's choice (2026-11-24): the tutorial starts after the third connection, and only where AI is on for the person.
    when: (p) => !!p.aiFinder && p.connections >= 3,
    steps: [
      { tip: "ai-ask", title: "Ask who you know", text: "Press this row and say who you need in your own words, like someone who works in finance." },
      { tip: "ai-ask", title: "You see who, and why", text: "You get the people from your connections who fit, each with a short reason." },
      { tip: "ai-ask", title: "Only what cards show", text: "It uses only what each person's card shows you. Try it now.", try: true },
    ],
  },
  {
    id: "followup_reminder", page: "person",
    when: (p) => p.connections >= 1,
    steps: [
      { tip: "followup", title: "Remember to follow up", text: "Pick Tomorrow, In 3 days or a day of your own. If your email is confirmed, we email you then." },
      { tip: "note", title: "Keep a private note", text: "Write where you met and what to follow up on. Only you can see it.", try: true },
    ],
  },
  {
    id: "draft_message", page: "person",
    // Only for someone met at an event, and only where AI is on for the person.
    when: (p, ctx) => !!p.aiDraft && !!ctx?.metAtEvent && p.connections >= 1,
    steps: [
      { tip: "draft", title: "Get a first draft", text: "Make a message for email, LinkedIn or WhatsApp. You edit it and send it yourself." },
      { tip: "draft", title: "Choose the tone", text: "You pick the tone and the goal first. It uses what their card shows and where you met.", try: true },
    ],
  },
  {
    id: "who_to_meet", page: "event",
    when: (p) => p.events >= 1,
    steps: [
      { tip: "who-to-meet", title: "Who to meet here", text: "Up to five people checked in here, with a short reason for each." },
      { tip: "intention", title: "Say what you hope for", text: "Write your intention and the suggestions follow it. It is optional." },
      { tip: "suggest-me", title: "You choose", text: "Untick this and you are not suggested to others, and you do not see suggestions either.", try: true },
    ],
  },
  {
    id: "more_cards", page: "cards",
    when: (p) => p.events >= 2 || p.connections >= 5,
    steps: [
      { tip: "new-card", title: "A card for each place", text: "Make a card for a careers fair or a club, with its own line, tags and colour." },
      { tip: "card-edit", title: "Each card has a code", text: "Edit a card to see its code and link, and to change what it shows.", try: true },
    ],
  },
  {
    id: "add_to_home", page: "home",
    // The panel only shows on a phone that has not added Lanyard, so on any other device the target is missing and this waits.
    when: (p) => p.connections >= 2,
    steps: [
      { tip: "install", title: "Open Lanyard in one tap", text: "Add it to your home screen and it opens straight to your card, with no browser bars." },
    ],
  },
];

export const STAGE_IDS = STAGES.map((s) => s.id);

/** The most steps a tutorial may have (the plan says two to four). */
export const MAX_STEPS = 4;

/**
 * The stage to show now, or null. `state` is what GET /api/stages returned. Nothing is due when the person is not
 * ready (no card, still in the welcome steps, Terms not agreed) or when a stage has already been shown today; a stage
 * already seen never comes back; the first stage in the list wins when two are due on the same page.
 */
export function dueStage(state, page, ctx = {}) {
  if (!state || !state.eligible || state.shownToday) return null;
  const seen = new Set(state.seen || []);
  return STAGES.find((s) => s.page === page && !seen.has(s.id) && s.when(state.progress || {}, ctx)) || null;
}
