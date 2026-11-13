// F29: putting the institution files (UK, US, world) together for the picker, the Worker
// and the tests. Kept apart from institutions.js so the data chunk shares no code with
// the app chunks: a shared chunk would add its file name to the entry's preload list.

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
