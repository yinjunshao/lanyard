// Pages of the host portal, at the root of the host site (F10): host.lanyd.fyi/,
// /signin, /events/:id, /billing, /account, /signout. Only the host router
// loads this file; the attendee app never sees these pages and the reverse.
const HostDashboard = () => import("../views/HostDashboard.vue");

export const hostRoutes = [
  { path: "/", component: HostDashboard },
  { path: "/signin", component: HostDashboard },
  // The live page, /present and /print: HostEvent picks the screen (F19).
  { path: "/events/:id/:screen(present|print)?", component: () => import("../views/HostEvent.vue") },
  { path: "/billing", component: () => import("../views/HostBilling.vue") },
  { path: "/account", component: () => import("../views/HostAccount.vue") },
  { path: "/signout", component: () => import("../views/HostSignOut.vue") },
  // Old addresses from before F10 (host.lanyd.fyi/host/events/abc and so on).
  { path: "/host/:rest(.*)*", redirect: (to) => ({ path: "/" + [].concat(to.params.rest || []).join("/"), query: to.query }) },
];
