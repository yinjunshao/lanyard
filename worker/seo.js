// F37: search and link-preview tags for the public pages.
//
// The app is one HTML shell. The Worker hands it out for every page, and passes it through
// HTMLRewriter for the pages people share, so a chat app or search engine that never runs the
// app's JavaScript still sees the right title, description and picture. The same HTML goes to
// people and bots: there is no list of bot names.
//
// What a link to a card or an event may show (owner decisions of 2026-11-15, D042):
//   /c/:cardId  the name, headline and photo exactly as the public card page shows them, nothing
//               else. A card that does not exist, or has no profile, looks the same as a made-up id.
//   /e/:code    the event name and its host. An unknown or ended code gives the generic tags.
// Both pages are `noindex` and neither is in the sitemap.
//
// Every value goes in through HTMLRewriter's setAttribute and setInnerContent, which escape it.
// Nothing here ever builds HTML by joining strings, and `{ html: true }` is never used.
import { one } from "./db.js";
import { bump } from "./ratelimit.js";
import { giveBack, MISS_WINDOW_MS } from "./codes.js";
import { cardFacts } from "../src/lib/cardmerge.js";

const SITE = "Lanyard";
const SITE_TITLE = "Lanyard: a digital card and a memory of everyone you meet";
const SITE_DESC = "Show a digital card, scan to connect, and remember who you met and why. Free for attendees, no app to install. Made in the UK for events.";
const SITE_OG_DESC = "Show a digital card, scan to connect, and remember who you met and why. Free for attendees, no app to install.";
const IMAGE_PATH = "/og-image.png";
const IMAGE_ALT = "Lanyard: show a card, scan to connect, remember who you met";

export const TITLE_MAX = 70;
export const DESC_MAX = 160;

// The pages of the main site that are for search engines. Anything not here is sent with noindex.
const MARKETING = {
  "/": { title: SITE_TITLE, description: SITE_DESC, ogDescription: SITE_OG_DESC },
  "/hosts": {
    title: "Lanyard for hosts: event check-in and networking",
    description: "Run a society night or careers fair with check-in, who-to-meet prompts and a feedback survey. Attendees always use Lanyard for free.",
  },
  "/terms": { title: "Terms of service | Lanyard", description: "The terms for using Lanyard." },
  "/privacy": { title: "Privacy policy | Lanyard", description: "How Lanyard collects, uses and protects your data." },
};
// Public, but not for search: it is a form.
const NOT_INDEXED_PAGES = {
  "/privacy-request": { title: "Privacy request | Lanyard", description: "Ask to see, fix or delete your data." },
};

// ---------------------------------------------------------------------------------------------
// Text

// One line, no control, invisible or direction-changing characters, cut to `max` characters
// (counted as people see them, so a long run of emoji is not cut in the middle of one).
export function cap(text, max) {
  const clean = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2069\ufeff]/g, " ")
    // Angle brackets become look-alikes, so no tag can be written even before HTMLRewriter's own escaping.
    .replace(/</g, "\u2039")
    .replace(/>/g, "\u203a")
    .replace(/\s+/g, " ")
    .trim();
  const chars = [...clean];
  return chars.length <= max ? clean : chars.slice(0, max - 1).join("").trimEnd() + "\u2026";
}

// The address everything links to: the first entry of APP_ORIGIN (the main site, never host.*).
export function siteOrigin(env) {
  for (const raw of String(env?.APP_ORIGIN || "").split(",")) {
    try {
      const u = new URL(raw.trim());
      if ((u.protocol === "https:" || u.protocol === "http:") && !u.hostname.startsWith("host.")) return u.origin;
    } catch { /* try the next entry */ }
  }
  return "https://lanyd.fyi";
}

const isHostSite = (url) => url.hostname.startsWith("host.");

const norm = (path) => (path.length > 1 ? path.replace(/\/+$/, "") : path) || "/";

// ---------------------------------------------------------------------------------------------
// Tags for one page

// `tags`: { title, description, ogTitle, ogDescription, url, canonical, image, imageAlt, card, size }
function genericTags(origin, page) {
  const p = page || MARKETING["/"];
  const url = page ? undefined : `${origin}/`;
  return {
    title: p.title,
    description: p.description,
    ogTitle: p.title,
    ogDescription: p.ogDescription || p.description,
    url,
    image: `${origin}${IMAGE_PATH}`,
    imageAlt: IMAGE_ALT,
    card: "summary_large_image",
    size: true,
  };
}

function pageTags(origin, path) {
  const page = MARKETING[path] || NOT_INDEXED_PAGES[path];
  if (!page) return null;
  const t = genericTags(origin, page);
  t.url = `${origin}${path}`;
  return t;
}

// A person's card: the same fields the public card page draws. `/api/c/:cardId` builds that page
// from cardView(), which takes the headline from cardFacts(card, profile) and the name and photo
// from the profile, so this does too. A hidden or empty headline shows nothing, and a card with no
// photo uses the site picture. Never the email, links, about, tags, notes, projects or any selfie.
const PHOTO_KEY = /^avatar\/[a-z0-9]+\.(webp|jpg|jpeg|png)$/; // what /media/:key serves to anyone
async function cardTags(db, origin, id) {
  // One read: the card and its owner's profile together. No profile (a deleted account has none) is no card.
  const row = await one(
    db,
    `SELECT c.id, c.headline AS card_headline, p.name, p.photo_key, p.headline AS profile_headline
       FROM cards c JOIN profiles p ON p.user_id = c.user_id WHERE c.id = ?`,
    id
  );
  if (!row) return null;
  const card = { id: row.id };
  const profile = { name: row.name, photo_key: row.photo_key };
  const name = cap(profile.name, TITLE_MAX);
  if (!name) return null;
  const headline = cap(cardFacts({ headline: row.card_headline }, { headline: row.profile_headline }).headline, DESC_MAX);
  const photo = typeof profile.photo_key === "string" && PHOTO_KEY.test(profile.photo_key) ? `${origin}/media/${profile.photo_key}` : null;
  const t = genericTags(origin, { title: `${cap(name, TITLE_MAX - SITE.length - 4)} on ${SITE}`, description: headline || `Open this card to connect on ${SITE}.` });
  t.ogTitle = name;
  t.ogDescription = t.description;
  t.url = `${origin}/c/${card.id}`;
  if (photo) {
    // A profile photo is square and its size is not known here: show it as the small card, with no size tags.
    t.image = photo;
    t.imageAlt = cap(`Photo of ${name}`, 100);
    t.card = "summary";
    t.size = false;
  }
  return t;
}

// An event by its join code: the name, and the host's name if the event has one. The same limit as
// GET /api/e/:code puts on wrong codes (F35.4), on the same counter, so these pages cannot be used
// to find live events by guessing: a right code hands its place back, a wrong one stays counted.
const EVENT_CODE = /^[A-Za-z0-9]{2,16}$/;
const EVENT_CODE_MISSES = 30;
async function eventTags(db, origin, code, ip) {
  const key = [`code:ev:${ip}`];
  if ((await bump(db, key[0], MISS_WINDOW_MS)) > EVENT_CODE_MISSES) return null;
  const ev = await one(
    db,
    `SELECT e.code, e.name, e.ends_at, e.ended_at, o.name AS host
       FROM events e LEFT JOIN orgs o ON o.id = e.org_id WHERE e.code = ?`,
    code.toUpperCase()
  );
  if (ev) await giveBack(db, key);
  if (!ev || ev.ended_at || (ev.ends_at && ev.ends_at < Date.now())) return null;
  const name = cap(ev.name, TITLE_MAX);
  if (!name) return null;
  const host = cap(ev.host, 60);
  const description = cap(host ? `Hosted by ${host}. Check in on ${SITE}, show your card and meet people.` : `Check in on ${SITE}, show your card and meet people.`, DESC_MAX);
  const t = genericTags(origin, { title: `${cap(name, TITLE_MAX - SITE.length - 4)} on ${SITE}`, description });
  t.ogTitle = name;
  t.url = `${origin}/e/${ev.code}`;
  return t;
}

// Which tags a path gets. Always an object for a page the Worker rewrites (the generic tags when
// there is nothing to show), null for a page it leaves alone. A failed lookup is the generic tags.
async function tagsFor(c, url, origin) {
  const path = norm(url.pathname);
  const fixed = pageTags(origin, path);
  if (fixed) return fixed; // no database read for these
  const card = /^\/c\/([A-Za-z0-9_-]{1,40})$/.exec(path);
  const event = /^\/e\/([^/]+)$/.exec(path);
  if (!card && !event) return null;
  const generic = genericTags(origin);
  if (event && !EVENT_CODE.test(event[1])) return generic;
  try {
    const ip = c.req.header("cf-connecting-ip") || "local";
    const found = await withTimeout(card ? cardTags(c.env.DB, origin, card[1]) : eventTags(c.env.DB, origin, event[1], ip), 2000);
    return found || generic;
  } catch (e) {
    console.error("seo lookup failed", e?.message || e);
    return generic;
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timed out")), ms); })]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------------------------
// Writing the tags into the page

const attr = (name, value) => ({ element(el) { el.setAttribute(name, value); } });

export function applyTags(res, t) {
  const rw = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(t.title); } })
    .on('meta[name="description"]', attr("content", t.description))
    .on('meta[property="og:title"]', attr("content", t.ogTitle))
    .on('meta[property="og:description"]', attr("content", t.ogDescription))
    .on('meta[property="og:url"]', attr("content", t.url))
    .on('meta[property="og:image"]', attr("content", t.image))
    .on('meta[property="og:image:alt"]', attr("content", t.imageAlt))
    .on('meta[name="twitter:card"]', attr("content", t.card))
    .on('meta[name="twitter:title"]', attr("content", t.ogTitle))
    .on('meta[name="twitter:description"]', attr("content", t.ogDescription))
    .on('meta[name="twitter:image"]', attr("content", t.image))
    .on('link[rel="canonical"]', attr("href", t.url));
  if (!t.size) {
    const drop = { element(el) { el.remove(); } };
    rw.on('meta[property="og:image:width"]', drop).on('meta[property="og:image:height"]', drop);
  }
  return rw.transform(res);
}

// The fallback for every request that no other route answered: the static files, and the app shell (with the tags above written in for the pages that have them).
export async function servePage(c) {
  const url = new URL(c.req.url);
  const get = c.req.method === "GET" || c.req.method === "HEAD";
  if (!get || isHostSite(url)) return c.env.ASSETS.fetch(c.req.raw);

  const origin = siteOrigin(c.env);
  const t = await tagsFor(c, url, origin);
  if (!t) return c.env.ASSETS.fetch(c.req.raw);
  // The page changes with the card or event, so the browser's saved copy and its validators must not be reused.
  const headers = new Headers(c.req.raw.headers);
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
  const res = await c.env.ASSETS.fetch(new Request(c.req.raw, { headers }));
  if (res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  try {
    const out = applyTags(res, t);
    out.headers.delete("etag");
    out.headers.delete("last-modified");
    out.headers.delete("content-length");
    return out;
  } catch (e) {
    console.error("seo rewrite failed", e?.message || e);
    return c.env.ASSETS.fetch(c.req.raw);
  }
}
