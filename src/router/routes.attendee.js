// Pages of the main site (lanyd.fyi). Route-level code splitting: public
// landing and card pages must stay small, so each page loads only where used.
// The host portal is on its own site (routes.host.js); /host addresses here are
// sent there by the router guard and by the Worker (301).
const Landing = () => import("../views/Landing.vue");
const PublicCard = () => import("../views/PublicCard.vue");
const Feedback = () => import("../views/Feedback.vue");
const Redeem = () => import("../views/Redeem.vue");

export const attendeeRoutes = [
  { path: "/", component: Landing },
  { path: "/c/:cardId", component: PublicCard },
  { path: "/c/:cardId/connect", redirect: (to) => ({ path: `/c/${to.params.cardId}`, query: to.query }) },
  { path: "/e/:code", component: () => import("../views/EventJoin.vue") },
  { path: "/e/:code/feedback", component: Feedback, meta: { app: true } },

  { path: "/app", component: () => import("../views/MyCard.vue"), meta: { app: true } },
  { path: "/app/cards", component: () => import("../views/Cards.vue"), meta: { app: true } },
  // The welcome steps (F14). Not meta.app: no tab bar or Terms pop-up over the question; the page waits for /api/me itself.
  { path: "/app/welcome", component: () => import("../views/Welcome.vue") },
  { path: "/app/profile", component: () => import("../views/EditProfile.vue"), meta: { app: true } },
  { path: "/app/scan", component: () => import("../views/Scan.vue"), meta: { app: true } },
  { path: "/app/people", component: () => import("../views/People.vue"), meta: { app: true } },
  { path: "/app/people/:id", component: () => import("../views/Person.vue"), meta: { app: true } },
  { path: "/app/events", component: () => import("../views/Events.vue"), meta: { app: true } },
  { path: "/app/events/:id", component: () => import("../views/EventDetail.vue"), meta: { app: true } },
  // Settings and its pages (/app/settings/account and so on) are one route: the list-and-page
  // layout in Settings.vue loads the page, so the pages add nothing to this file, which every
  // public page loads (F09, D018).
  { path: "/app/settings/:page?", component: () => import("../views/Settings.vue"), meta: { app: true } },
  { path: "/app/feedback/:eventId", component: Feedback, meta: { app: true } },

  { path: "/terms", component: () => import("../views/Terms.vue") },
  { path: "/privacy-request", component: () => import("../views/PrivacyRequest.vue") },
  { path: "/privacy", component: () => import("../views/Privacy.vue") },
  { path: "/claim", component: () => import("../views/Claim.vue") },
  // F74: a card the admin made for someone, claimed by its link. Lazy, and no public page imports it.
  { path: "/claim/p/:token", component: () => import("../views/ClaimProfile.vue") },
  { path: "/redeem", component: Redeem },
  { path: "/redeem/:code", component: Redeem },
  { path: "/signin", component: () => import("../views/SignIn.vue") },
  { path: "/hosts", component: () => import("../views/Hosts.vue") },
  { path: "/admin", component: () => import("../views/Admin.vue") },
  { path: "/admin/profiles", component: () => import("../views/AdminProfiles.vue") }, // F74
  // F08 test page for checking the pickers by eye. `import.meta.env.DEV` is false
  // in a production build, so this entry (and the page's chunk) is dropped.
  ...(import.meta.env.DEV ? [{ path: "/ui-test", component: () => import("../views/UiTest.vue") }] : []),
];
