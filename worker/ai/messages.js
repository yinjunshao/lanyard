// What a person is told when an AI feature falls back. Friendly and short; never an error, never a
// dollar figure, never a reason that helps someone probe the limits. The non-AI result is shown beside it.
import { AI_LIMITS } from "../plans.js";

const label = (feature) => AI_LIMITS[feature]?.label || "features";

export function friendly(reason, feature) {
  const l = label(feature);
  switch (reason) {
    case "quota_day": return `You've used today's AI ${l}. They're back tomorrow.`;
    case "quota_month": return `You've used this month's AI ${l}. They're back next month.`;
    case "quota_scope": return `You've used your AI ${l} for this event.`;
    case "budget_day": case "budget_month": return `AI ${l} are back tomorrow.`;
    case "burst": return "Give it a few seconds, then try again.";
    case "ip_limit": return "There have been a lot of requests from your network. Try again in a little while.";
    case "ineligible": return "Save your card and confirm your email to use AI features.";
    case "not_allowed": return "AI features aren't open to your account yet.";
    case "opted_out": case "blocked": return "This can't be done with AI. The standard version is shown instead.";
    default: return `AI ${l} aren't available right now. The standard version is shown instead.`;
  }
}
