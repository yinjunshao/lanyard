// F49: how complete a profile is, out of six. One rule for the Edit profile bar and for the emails the Worker
// sends (worker/profilenudge.js imports this file too), so the page and the email never disagree.
// It has no imports and is loaded only by Edit profile and the Worker, never by a public page.
//
// One point each: name; photo; university (student) or company (career); course (student) or role (career);
// what you do (the profile's headline, the one line under the name on a badge); at least one link.
// A value of only spaces counts as empty. Either mode's other fields are ignored (a career profile with an old
// university scores on company and role).

export const SCORE_MAX = 6;

// `field` is the id of the input on Edit profile, so a missing item can link to it (#photo, #course, ...).
const ITEMS = {
  name: { label: "Your name", field: "name" },
  photo: { label: "A photo", field: "photo" },
  uni: { label: "Your university", field: "uni" },
  course: { label: "Your course", field: "course" },
  company: { label: "Your company", field: "company" },
  role: { label: "Your role", field: "role" },
  headline: { label: "What you do", field: "headline" },
  links: { label: "A link", field: "links" },
};

const has = (v) => typeof v === "string" && v.trim().length > 0;

// Links arrive as the {label: address} object (the app) or as the JSON text the database keeps (the Worker).
function linkCount(links) {
  let obj = links;
  if (typeof obj === "string") { try { obj = JSON.parse(obj); } catch { obj = null; } }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
  return Object.values(obj).filter(has).length;
}

/**
 * profileScore(profile) -> { score, max, items, missing }
 * `profile` may use the app's names (photo) or the database's (photo_key). `items` lists all six in order with
 * `ok`; `missing` is the ones not yet done. A person with no profile at all (null) scores 0 with all six missing.
 */
export function profileScore(p) {
  const x = p || {};
  const career = x.mode === "career";
  const keys = ["name", "photo", career ? "company" : "uni", career ? "role" : "course", "headline", "links"];
  const ok = {
    name: has(x.name), photo: has(x.photo) || has(x.photo_key),
    uni: has(x.uni), course: has(x.course), company: has(x.company), role: has(x.role),
    headline: has(x.headline), links: linkCount(x.links) > 0,
  };
  const items = keys.map((key) => ({ key, ...ITEMS[key], ok: ok[key] }));
  const missing = items.filter((i) => !i.ok);
  return { score: items.length - missing.length, max: SCORE_MAX, items, missing };
}
