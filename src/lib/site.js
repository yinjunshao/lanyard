// Which site are we on? The host portal can run on its own subdomain
// (host.<domain>): only /host/* pages exist there, "/" is the dashboard, and
// attendee pages (cards, events, the app) live on the main site.
export const ON_HOST_SITE = /^host\./.test(location.hostname);
export const MAIN_ORIGIN = ON_HOST_SITE ? location.origin.replace("//host.", "//") : location.origin;
// Where "open the host portal" links point. Empty = same site (workers.dev,
// local dev). Set VITE_HOST_ORIGIN=https://host.yourdomain at build time.
export const HOST_ORIGIN = import.meta.env.VITE_HOST_ORIGIN || "";
