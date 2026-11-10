// F12: helpers for the institution list (src/data/institutions-uk.json). Plain JS
// with no import of the data, so the picker can load the list only when it opens
// and the Worker and the tests can pass the list in.

/** The stable slug for a name. An institution's id is this, fixed when it is first listed. */
export function slugify(name) {
  return String(name).toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Options for UiCombobox: { value: id, label: official name, aliases }. */
export function institutionOptions(list) {
  return list.map((i) => ({ value: i.id, label: i.name, aliases: i.aliases || [] }));
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
