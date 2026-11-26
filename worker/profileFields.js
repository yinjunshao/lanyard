// What a profile save may write, and how each field is checked. One copy, used by making a card
// (POST /api/profile), Edit profile (PUT /api/profile) and the admin's profiles for people (F74,
// worker/premadeAdmin.js), so a profile the admin makes is held to exactly the same rules.
import { bump, HOUR } from "./ratelimit.js";
import { HttpError } from "./session.js";

const TEXT_FIELDS = ["name", "uni", "course", "year", "headline", "about"];
// A custom institution (typed in) is capped at 120 characters (F12).
const UNI_MAX = 120;
// Student and Career mode (F11). `mode` is a whitelist; company and role are short.
const MODES = ["student", "career"];
const SHORT_FIELDS = ["company", "role"];
export const validMode = (input) => input.mode === undefined || MODES.includes(input.mode);

export function profilePayload(input) {
  const out = {};
  for (const k of TEXT_FIELDS) if (typeof input[k] === "string") out[k] = input[k].trim().slice(0, 400);
  for (const k of SHORT_FIELDS) if (typeof input[k] === "string") out[k] = input[k].trim().slice(0, 80);
  if (typeof out.uni === "string") out.uni = out.uni.slice(0, UNI_MAX);
  if (MODES.includes(input.mode)) out.mode = input.mode;
  if (typeof input.links === "object" && input.links) {
    const links = {};
    for (const [label, url] of Object.entries(input.links)) {
      if (/^https?:\/\//.test(String(url)) && label.length <= 40) links[label.slice(0, 40)] = String(url).slice(0, 300);
    }
    out.links = JSON.stringify(links);
  }
  for (const jsonField of ["tags", "projects"]) {
    if (Array.isArray(input[jsonField])) {
      out[jsonField] = JSON.stringify(
        input[jsonField].slice(0, jsonField === "projects" ? 3 : 30)
          .map((x) => (jsonField === "projects" && x && typeof x === "object"
            ? { title: String(x.title || "").slice(0, 80), line: String(x.line || "").slice(0, 160),
                url: /^https?:\/\//.test(String(x.url || "")) ? String(x.url).slice(0, 300) : "" }
            : String(x).slice(0, 60)))
      );
    }
  }
  // The app sends camelCase (showAge); accept both spellings.
  const showAge = input.showAge ?? input.show_age;
  if (typeof showAge === "boolean") out.show_age = showAge ? 1 : 0;
  return out;
}

// Institution picker (F12). A listed institution sets institution_id and makes
// `uni` its official name. Anything else (custom text, or an old client that only
// sends `uni`) leaves institution_id empty when the text no longer matches.
export function applyInstitution(fields, pick, current) {
  if (pick.present) {
    fields.institution_id = pick.inst ? pick.inst.id : null;
    if (pick.inst) fields.uni = pick.inst.name;
  } else if (current && typeof fields.uni === "string" && fields.uni !== current.uni) {
    fields.institution_id = null;
  }
}

// Each new profile photo is a storage write, so changes are limited per account (F35.7).
export async function photoAllowed(c, u, dataUrl) {
  if ((await bump(c.env.DB, `photo:u:${u.id}`, HOUR)) > 20) throw new HttpError(429, "That's a lot of new photos in an hour. Try again later.", "throttled");
  return dataUrl;
}
