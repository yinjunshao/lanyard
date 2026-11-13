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

/**
 * F29: put the institution files together (UK, US, world) into one list, each
 * entry with a country code. Every id must be unique across all the files; a
 * repeat throws, so a bad edit cannot ship. The UK file's entries keep their ids.
 * Returns { institutions, countries } where countries maps a code to its name.
 */
export function mergeInstitutions(files) {
  const institutions = [];
  const countries = {};
  const seen = new Set();
  for (const f of files) {
    Object.assign(countries, f.countries || {});
    for (const i of f.institutions) {
      if (seen.has(i.id)) throw new Error("Institution id used twice: " + i.id);
      seen.add(i.id);
      institutions.push(i);
    }
  }
  return { institutions, countries };
}

/** The country shown after a name: nothing for the UK, else the country's name. */
export const countryLabel = (inst, countries) => (inst.country && inst.country !== "GB" ? countries[inst.country] || inst.country : "");

/** Picker options for UiCombobox: the country goes after the name, so same-name institutions can be told apart. */
export const pickerOptions = (list, countries) => list.map((i) => ({ value: i.id, label: i.name, aliases: i.aliases, suffix: countryLabel(i, countries) }));

const WEBMAIL = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk", "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com", "msn.com"]);
/** True for a webmail domain, which is never an institution. The editor uses it to skip fetching the list for nothing. */
export const isWebmail = (domain) => WEBMAIL.has(String(domain || "").trim().toLowerCase());
