import { createRouter, createWebHistory } from "vue-router";
import { ensureMe } from "../lib/store";
import { ON_HOST_SITE, MAIN_ORIGIN, hostAddress } from "../lib/site";
import { hasSignedInHint } from "../lib/signedin";
import { attendeeRoutes } from "./routes.attendee";
import { hostRoutes } from "./routes.host";

// Two sites, one app: the host portal (host.*) and the main site each get only
// their own pages (F10).
const NotFound = () => import("../views/NotFound.vue");
const routes = ON_HOST_SITE
  ? [...hostRoutes, { path: "/:pathMatch(.*)*", component: NotFound, meta: { mainSite: true } }]
  : [...attendeeRoutes, { path: "/:pathMatch(.*)*", component: NotFound }];

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
  if (link) link.href = ON_HOST_SITE || to.path === "/hosts" ? "/host-icon.svg" : "/favicon.svg";
});

router.beforeEach(async (to) => {
  if (ON_HOST_SITE) {
    // Anything that isn't a host page lives on the main site.
    if (to.meta.mainSite) { window.location.href = MAIN_ORIGIN + to.fullPath; return false; }
    return true; // host pages ask /api/host/me themselves
  }
  // Old portal addresses go to the host site (the Worker answers 301 too).
  if (to.path === "/host" || to.path.startsWith("/host/")) { window.location.replace(hostAddress(to.fullPath)); return false; }
  // Signed in before? Skip the front page. This reads a browser-only hint, so
  // the landing page never waits on /api/me. "/?about=1" still shows it.
  if (to.path === "/" && !to.query.about && hasSignedInHint()) return "/app";
  // Pages that depend on who you are wait for it; public pages (landing, a
  // scanned card, terms) render straight away and fill in when it arrives.
  const needsMe = to.meta.app || ["/claim", "/signin"].includes(to.path) || to.path.startsWith("/redeem");
  if (needsMe) await ensureMe();
  else ensureMe();
  return true;
});
