// Response hardening shared by every route: security headers, cache rules and a
// same-origin check on state-changing API calls (CSRF defence on top of the
// SameSite=Lax session cookie).
import { HttpError } from "./session.js";
import { robotsHeader } from "./seo.js";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export async function securityHeaders(c, next) {
  await next();
  const res = new Response(c.res.body, c.res); // responses from fetch() have immutable headers
  const h = res.headers;
  const path = new URL(c.req.url).pathname;
  const https = c.req.url.startsWith("https://");
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("permissions-policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  h.set("cross-origin-opener-policy", "same-origin");
  if (https) h.set("strict-transport-security", "max-age=31536000");
  if (!h.has("content-security-policy")) h.set("content-security-policy", CSP + (https ? "; upgrade-insecure-requests" : ""));
  h.set("x-frame-options", "DENY");
  // Cards, profiles and every app page are for people with the link, not search engines (F37: only the marketing pages, robots.txt and the sitemap are indexable).
  const robots = robotsHeader(new URL(c.req.url));
  if (robots) h.set("x-robots-tag", robots); else h.delete("x-robots-tag");
  if (path.startsWith("/api/")) {
    if (!h.has("cache-control")) h.set("cache-control", "no-store");
  } else if (path.startsWith("/assets/") && res.ok) {
    h.set("cache-control", "public, max-age=31536000, immutable"); // content-hashed file names
  } else if (path === "/sw.js") {
    h.set("cache-control", "no-cache");
    h.set("service-worker-allowed", "/");
  } else if (!path.startsWith("/media/") && (h.get("content-type") || "").includes("text/html")) {
    h.set("cache-control", "no-cache"); // always revalidate the app shell so deploys land
  }
  c.res = res;
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// Origins allowed to call the attendee API. The host portal (host.*) is listed
// in APP_ORIGIN but is left out here: lanyd.fyi and host.lanyd.fyi are the same
// "site" to the browser, so SameSite cookies alone would not keep a host page
// from acting on an attendee account (F10). The host API has its own, stricter
// check (hostGuard in host-auth.js).
const isHostOrigin = (o) => { try { return new URL(o).hostname.startsWith("host."); } catch { return false; } };
export function allowedOrigins(c) {
  return new Set([
    new URL(c.req.url).origin,
    ...String(c.env.APP_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
  ].filter((o) => !isHostOrigin(o)));
}

// Browsers send Origin on cross-origin and same-origin POSTs; Sec-Fetch-Site
// covers the rest. Server-to-server callers (integrations) send neither.
export async function sameOriginWrites(c, next) {
  if (!SAFE.has(c.req.method)) {
    const origin = c.req.header("origin");
    const site = c.req.header("sec-fetch-site");
    if (origin ? !allowedOrigins(c).has(origin) : site === "cross-site") {
      throw new HttpError(403, "Cross-site request blocked.", "bad_origin");
    }
  }
  await next();
}
