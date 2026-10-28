import { createRouter, createWebHistory } from "vue-router";
import { ensureMe } from "../lib/store";
import { ON_HOST_SITE, MAIN_ORIGIN } from "../lib/site";

// Route-level code splitting: public landing/card pages must stay under the
// 50 KB JS budget, so qrcode/passkey/scanner chunks load only where used.
const Landing = () => import("../views/Landing.vue");
const PublicCard = () => import("../views/PublicCard.vue");
const MyCard = () => import("../views/MyCard.vue");
const Cards = () => import("../views/Cards.vue");
const EditProfile = () => import("../views/EditProfile.vue");
const Scan = () => import("../views/Scan.vue");
const People = () => import("../views/People.vue");
const Person = () => import("../views/Person.vue");
const SignIn = () => import("../views/SignIn.vue");
const Claim = () => import("../views/Claim.vue");
const Settings = () => import("../views/Settings.vue");
const Events = () => import("../views/Events.vue");
const EventDetail = () => import("../views/EventDetail.vue");
const EventJoin = () => import("../views/EventJoin.vue");
const Hosts = () => import("../views/Hosts.vue");
const HostDashboard = () => import("../views/HostDashboard.vue");
const HostLive = () => import("../views/HostLive.vue");
const HostAccount = () => import("../views/HostAccount.vue");
const HostBilling = () => import("../views/HostBilling.vue");
const Terms = () => import("../views/Terms.vue");
const Privacy = () => import("../views/Privacy.vue");
const Feedback = () => import("../views/Feedback.vue");
const NotFound = () => import("../views/NotFound.vue");

const routes = [
  { path: "/", component: Landing },
  { path: "/c/:cardId", component: PublicCard },
  { path: "/c/:cardId/connect", redirect: (to) => ({ path: `/c/${to.params.cardId}`, query: to.query }) },
  { path: "/e/:code", component: EventJoin },
  { path: "/e/:code/feedback", component: Feedback, meta: { app: true } },

  { path: "/app", component: MyCard, meta: { app: true } },
  { path: "/app/cards", component: Cards, meta: { app: true } },
  { path: "/app/profile", component: EditProfile, meta: { app: true } },
  { path: "/app/scan", component: Scan, meta: { app: true } },
  { path: "/app/people", component: People, meta: { app: true } },
  { path: "/app/people/:id", component: Person, meta: { app: true } },
  { path: "/app/events", component: Events, meta: { app: true } },
  { path: "/app/events/:id", component: EventDetail, meta: { app: true } },
  { path: "/app/settings", component: Settings, meta: { app: true } },
  { path: "/app/feedback/:eventId", component: Feedback, meta: { app: true } },

  { path: "/terms", component: Terms },
  { path: "/privacy", component: Privacy },
  { path: "/claim", component: Claim },
  { path: "/signin", component: SignIn },
  { path: "/host/signin", component: SignIn },
  { path: "/hosts", component: Hosts },
  { path: "/host", component: HostDashboard },
  { path: "/host/events/:id", component: HostLive },
  { path: "/host/billing", component: HostBilling },
  { path: "/host/account", component: HostAccount },

  { path: "/:pathMatch(.*)*", component: NotFound },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to) => (to.hash ? { el: to.hash, behavior: "smooth" } : { top: 0 }),
});

router.beforeEach(async (to) => {
  if (ON_HOST_SITE) {
    if (to.path === "/") return "/host";
    if (!to.path.startsWith("/host")) {
      window.location.href = MAIN_ORIGIN + to.fullPath;
      return false;
    }
  }
  // Pages that depend on who you are wait for it; public pages (landing, a
  // scanned card, terms) render straight away and fill in when it arrives.
  const needsMe = to.meta.app || to.path.startsWith("/host") || ["/claim", "/signin"].includes(to.path);
  if (needsMe) await ensureMe();
  else ensureMe();
  return true;
});
