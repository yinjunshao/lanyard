// F12: helpers for the institution list (the JSON under src/data). Plain JS
// with no import of the data, so the picker can load the list only when it opens
// and the Worker and the tests can pass the list in.

/** The stable slug for a name. An institution's id is this, fixed when it is first listed. */
export function slugify(name) {
  // Accents are dropped first ("Montréal" is "montreal"); this changes no id made from plain letters.
  return String(name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * The institution whose email domain the address uses, or null. A subdomain
 * matches too (students.example.ac.uk matches example.ac.uk).
 */
export function institutionForDomain(list, domain) {
  const d = String(domain || "").trim().toLowerCase();
  if (!d) return null;
  return list.find((i) => (i.domains || []).some((x) => d === x || d.endsWith(`.${x}`))) || null;
}

/** An institution by exact name or alias (case-insensitive), for the backfill. Null unless exactly one matches. */
export function institutionForText(list, text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const hits = list.filter((i) => i.name.toLowerCase() === t || (i.aliases || []).some((a) => a.toLowerCase() === t));
  return hits.length === 1 ? hits[0] : null;
}

const WEBMAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "msn.com"]);
/** True for a webmail domain, which is never an institution. The editor uses it to skip fetching the list for nothing. */
export const isWebmail = (domain) => WEBMAIL.has(String(domain || "").trim().toLowerCase());
