import { createRouter, createWebHistory } from "vue-router";
import { ensureMe } from "../lib/store";
import { ON_HOST_SITE, MAIN_ORIGIN } from "../lib/site";
import { hasSignedInHint } from "../lib/signedin";
import { settingsRedirect } from "./settingsRedirect";

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
const SettingsPick = () => import("../views/settings/SettingsPick.vue");
const SettingsAccount = () => import("../views/settings/SettingsAccount.vue");
const SettingsSecurity = () => import("../views/settings/SettingsSecurity.vue");
const SettingsNotifications = () => import("../views/settings/SettingsNotifications.vue");
const SettingsPrivacy = () => import("../views/settings/SettingsPrivacy.vue");
const SettingsPlan = () => import("../views/settings/SettingsPlan.vue");
const SettingsAppearance = () => import("../views/settings/SettingsAppearance.vue");
const SettingsHelp = () => import("../views/settings/SettingsHelp.vue");
const Events = () => import("../views/Events.vue");
const EventDetail = () => import("../views/EventDetail.vue");
const EventJoin = () => import("../views/EventJoin.vue");
const Hosts = () => import("../views/Hosts.vue");
const HostDashboard = () => import("../views/HostDashboard.vue");
const HostLive = () => import("../views/HostLive.vue");
const HostAccount = () => import("../views/HostAccount.vue");
const HostSignOut = () => import("../views/HostSignOut.vue");
const HostBilling = () => import("../views/HostBilling.vue");
const Admin = () => import("../views/Admin.vue");
const Terms = () => import("../views/Terms.vue");
const Privacy = () => import("../views/Privacy.vue");
const PrivacyRequest = () => import("../views/PrivacyRequest.vue");
const Feedback = () => import("../views/Feedback.vue");
const Redeem = () => import("../views/Redeem.vue");
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
  // Settings: a list of categories, each its own page. A page's `title` is what the
  // list-and-page layout in Settings.vue shows above it. Later features add rows
  // inside these pages (F11 mode, F21 AI and privacy, F26 mailing list, F27 plan).
  {
    path: "/app/settings", component: Settings, meta: { app: true, wide: true },
    children: [
      { path: "", component: SettingsPick },
      { path: "account", component: SettingsAccount, meta: { title: "Account" } },
      { path: "security", component: SettingsSecurity, meta: { title: "Sign-in and devices" } },
      { path: "notifications", component: SettingsNotifications, meta: { title: "Email and notifications" } },
      { path: "privacy", component: SettingsPrivacy, meta: { title: "Privacy and data" } },
      { path: "plan", component: SettingsPlan, meta: { title: "Plan" } },
      { path: "appearance", component: SettingsAppearance, meta: { title: "Appearance and app" } },
      { path: "help", component: SettingsHelp, meta: { title: "Help and legal" } },
    ],
  },
  { path: "/app/feedback/:eventId", component: Feedback, meta: { app: true } },

  { path: "/terms", component: Terms },
  { path: "/privacy-request", component: PrivacyRequest },
  { path: "/privacy", component: Privacy },
  { path: "/claim", component: Claim },
  { path: "/redeem", component: Redeem },
  { path: "/redeem/:code", component: Redeem },
  { path: "/signin", component: SignIn },
  { path: "/host/signin", component: SignIn },
  { path: "/host/signout", component: HostSignOut },
  { path: "/hosts", component: Hosts },
  { path: "/host", component: HostDashboard },
  { path: "/host/events/:id", component: HostLive },
  { path: "/host/billing", component: HostBilling },
  { path: "/host/account", component: HostAccount },
  { path: "/admin", component: Admin },
  // F08 test page for checking the pickers by eye. `import.meta.env.DEV` is false
  // in a production build, so this entry (and the page's chunk) is dropped.
  ...(import.meta.env.DEV ? [{ path: "/ui-test", component: () => import("../views/UiTest.vue") }] : []),

  { path: "/:pathMatch(.*)*", component: NotFound },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  // Pages load lazily, so give a #section a moment to exist before scrolling to it.
  scrollBehavior: (to) => (to.hash
    ? new Promise((resolve) => setTimeout(() => resolve(document.querySelector(to.hash) ? { el: to.hash, top: 80, behavior: "smooth" } : { top: 0 }), 200))
    : { top: 0 }),
});

router.afterEach((to) => {
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = to.path.startsWith("/host") ? "/host-icon.svg" : "/favicon.svg";
});

router.beforeEach(async (to) => {
  // Old #plus, #signin and #install links into Settings go to the page that holds them.
  const moved = settingsRedirect(to);
  if (moved) return moved;
  if (ON_HOST_SITE) {
    if (to.path === "/") return "/host";
    if (!to.path.startsWith("/host")) {
      window.location.href = MAIN_ORIGIN + to.fullPath;
      return false;
    }
  }
  // Signed in before? Skip the front page. This reads a browser-only hint, so
  // the landing page never waits on /api/me. "/?about=1" still shows it.
  if (to.path === "/" && !to.query.about && hasSignedInHint()) return "/app";
  // Pages that depend on who you are wait for it; public pages (landing, a
  // scanned card, terms) render straight away and fill in when it arrives.
  const needsMe = to.meta.app || to.path.startsWith("/host") || ["/claim", "/signin"].includes(to.path) || to.path.startsWith("/redeem");
  if (needsMe) await ensureMe();
  else ensureMe();
  return true;
});
