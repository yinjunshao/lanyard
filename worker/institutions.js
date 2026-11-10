// F12: the institution list on the server side, to check ids and fill in the
// official name. The same JSON the picker loads in the browser.
import data from "../src/data/institutions-uk.json" with { type: "json" };

const byId = new Map(data.institutions.map((i) => [i.id, i]));

/** The listed institution for an id, or null. */
export const institutionById = (id) => (typeof id === "string" ? byId.get(id) || null : null);

/**
 * Read an institution choice from a request body. `institutionId` (or
 * `institution_id`) is a listed id, or null/"" for none. Returns
 * { present: false } when the body does not mention it, { error } for an id that
 * is not on the list, else { present: true, inst } with inst null or the entry.
 */
export function readInstitution(body) {
  const raw = body.institutionId !== undefined ? body.institutionId : body.institution_id;
  if (raw === undefined) return { present: false };
  if (raw === null || raw === "") return { present: true, inst: null };
  const inst = institutionById(raw);
  if (!inst) return { error: "Choose an institution from the list, or type your own." };
  return { present: true, inst };
}
