// Old links into Settings used one long page with #sections. Each section now has a
// page of its own, so a link like /app/settings#plus goes to /app/settings/plan.
// Anything else (no hash, or an unknown one) stays on the Settings list.
export const SETTINGS_HASHES = {
  "#plus": "/app/settings/plan",
  "#signin": "/app/settings/security",
  "#install": "/app/settings/appearance",
};

export function settingsRedirect(to) {
  if (to.path !== "/app/settings" && to.path !== "/app/settings/") return null;
  const path = SETTINGS_HASHES[to.hash];
  return path ? { path, query: to.query, replace: true } : null;
}
