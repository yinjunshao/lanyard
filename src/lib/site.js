// Which site are we on? The host portal runs on its own subdomain (host.<domain>,
// F10) with its own pages at the root; attendee pages (cards, events, the app)
// live on the main site.
export const ON_HOST_SITE = /^host\./.test(location.hostname);
export const MAIN_ORIGIN = ON_HOST_SITE ? location.origin.replace("//host.", "//") : location.origin;
// The host portal's address. Set at build time (vite.config.js: VITE_HOST_ORIGIN,
// https://host.lanyd.fyi for a production build); otherwise host. + this host,
// which is http://host.localhost:5173 in local development.
export const HOST_ORIGIN = __HOST_ORIGIN__ || (ON_HOST_SITE ? location.origin : location.origin.replace("//", "//host."));
// An old /host... address on the main site, as its page on the host site.
export const hostAddress = (fullPath) => HOST_ORIGIN + (fullPath.replace(/^\/host(?=\/|\?|#|$)/, "") || "/").replace(/^(?=[?#])/, "/");
