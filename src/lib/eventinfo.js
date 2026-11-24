// F63: how an event's practical notes (`events.info`, JSON) are worded for people: the food line, the diet words and the
// rows the check-in page and the event hub print. Public pages import this file, so it is kept small and imports nothing.
// What a host may save, and the cleaning of it, is lib/eventinfoclean.js.

// The six diet options a host can say are covered, in the order they are shown. Each is worded as its id with a capital.
export const DIET_IDS = ["vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free"];
export const dietLabel = (id) => id[0].toUpperCase() + id.slice(1);

// "Pizza. Options: Vegan, Halal", or just the text, or just "Options: Vegan". Empty when there is neither. (The text is
// already trimmed: the Worker and the host's preview both clean it with lib/eventinfoclean.js.)
export function foodLine(i) {
  const names = DIET_IDS.filter((d) => i?.diet?.includes(d)).map(dietLabel).join(", ");
  const t = i?.food || "";
  return names ? `${t ? `${t.replace(/\.+$/, "")}. ` : ""}Options: ${names}` : t;
}

// The rows the check-in page and the event hub print, in order. Access is not among them (hidden since F63).
export const infoRows = (info) => [["Dress code", info?.dress], ["Food and drink", foodLine(info)], ["Good to know", info?.other]].filter((r) => r[1]);
