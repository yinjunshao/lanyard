// F63: what the Worker keeps of the `info` a host sends, and the host's live preview does the same, so the preview shows
// what is saved. Host pages and the Worker only (the public check-in page imports lib/eventinfo.js instead).
import { DIET_IDS } from "./eventinfo.js";

// `access` is hidden in the app since F63 but still stored, accepted and returned, so an old value is kept and the field can come back.
export const INFO_KEYS = ["access", "dress", "food", "other"];

// Food and drink is a tick (`foodOn`), what there is (`food`) and the options covered (`diet`, ids from DIET_IDS).
export function cleanInfo(o) {
  const out = {};
  for (const k of INFO_KEYS) {
    const v = String(o?.[k] || "").trim().slice(0, 200);
    if (v) out[k] = v;
  }
  // `diet` only counts when the food tick is on; unknown ids are dropped, at most six are kept (there are only six).
  if (o?.foodOn === true) {
    out.foodOn = true;
    const diet = Array.isArray(o.diet) ? DIET_IDS.filter((id) => o.diet.includes(id)).slice(0, 6) : [];
    if (diet.length) out.diet = diet;
  }
  return out;
}

// An event saved before the tick existed has food text and no `foodOn`: it still shows and the form opens it ticked.
export const foodTicked = (info) => info?.foodOn === true || !!String(info?.food || "").trim();
