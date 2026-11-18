// Pages of the host portal, at the root of the host site (F10): host.lanyd.fyi/,
// /signin, /events/:id, /billing, /redeem, /account, /signout. Only the host router
// loads this file; the attendee app never sees these pages and the reverse.
const HostDashboard = () => import("../views/HostDashboard.vue");
// Billing and the promo-code page are one component (F20): a new route file would add a name to the
// chunk list in the entry, which every public page loads (D024).
const HostBilling = () => import("../views/HostBilling.vue");
// The live page, /present, /print and the voucher scanner (F40) are one component, which loads the screen (D024).
const HostEvent = () => import("../views/HostEvent.vue");

export const hostRoutes = [
  { path: "/", component: HostDashboard },
  { path: "/signin", component: HostDashboard },
  // The live page, /present and /print: HostEvent picks the screen (F19).
  { path: "/events/:id/:screen(present|print)?", component: HostEvent },
  { path: "/billing", component: HostBilling },
  { path: "/redeem/:code?", component: HostBilling },
  { path: "/account", component: () => import("../views/HostAccount.vue") },
  { path: "/signout", component: () => import("../views/HostSignOut.vue") },
  // F40: the voucher scanner staff open from the link the host sent them. No account: the token is the key.
  { path: "/scan/:token", component: HostEvent },
  // Old addresses from before F10 (host.lanyd.fyi/host/events/abc and so on).
  { path: "/host/:rest(.*)*", redirect: (to) => ({ path: "/" + [].concat(to.params.rest || []).join("/"), query: to.query }) },
];
