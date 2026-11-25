// F66 (D061): an organisation's company branding (a display name and a logo) on its paid events.
//   - What a public page gets: brandFor(event, org), only for a paid event with "Use our company branding" on, of an
//     organisation with a name or a logo that a Lanyard admin has not switched off. Otherwise nothing, so a free event
//     answers exactly as before.
//   - The host's own settings: registerBrandHost (the owner changes them; any member of the organisation reads them).
//   - The logo itself: serveLogo, for /media/logo/... (worker/index.js).
// The logo is a PNG, JPEG or WebP, checked by its bytes (worker/media.js), at most 1 MB and 1024 px on its longest side,
// with its metadata removed. It is stored in R2 under the organisation, logo/<org id>/<random>.<ext>, and the old one is
// deleted when it is replaced or removed or the organisation goes (the media_deletes triggers, migration 0044).
import { one, all, run } from "./db.js";
import { HttpError } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";
import { readImage, imageSize, getImage, deleteImage } from "./media.js";
import { isHostSite, loadHost } from "./host-auth.js";
import { cleanWhy } from "../src/lib/collects.js";

export const BRAND_NAME_MAX = 60;
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_MAX_SIDE = 1024;
const LOGO_UPLOADS_PER_HOUR = 20;
export const LOGO_KEY = /^logo\/[0-9a-f]{10}\/[0-9a-f]{20}\.(png|jpg|webp)$/;
// The columns brandFor reads. Every caller selects exactly these.
export const BRAND_COLS = "name, brand_name, brand_logo_key, brand_logo_version, brand_off";

/** The display name, cleaned like F31's why line (control, zero-width and direction characters go), or a 400. */
export function cleanBrandName(v) {
  const t = cleanWhy(typeof v === "string" ? v : "");
  if ([...t].length > BRAND_NAME_MAX) throw new HttpError(400, `Keep the name to ${BRAND_NAME_MAX} characters or fewer.`, "name_long");
  return t;
}

export const logoUrl = (org) => (org?.brand_logo_key ? `/media/${org.brand_logo_key}?v=${org.brand_logo_version || 1}` : null);

/** { name, logo } for a public page, or null. `org` is a row with BRAND_COLS. */
export function brandFor(ev, org) {
  if (!ev || !ev.is_paid || ev.use_branding === 0 || !org || org.brand_off) return null;
  const logo = logoUrl(org);
  if (!org.brand_name && !logo) return null;
  return { name: org.brand_name || org.name, logo };
}

export async function eventBrand(db, ev) {
  if (!ev?.is_paid || ev.use_branding === 0 || !ev.org_id) return null; // a free event never reads the organisation's branding
  return brandFor(ev, await one(db, `SELECT ${BRAND_COLS} FROM orgs WHERE id = ?`, ev.org_id));
}

/** The host's own view of the settings. */
export const brandSettings = (org, role) => ({
  name: org.brand_name || "", defaultName: org.name, logo: logoUrl(org),
  has: !!(org.brand_name || org.brand_logo_key), off: !!org.brand_off, canEdit: role === "owner",
  nameMax: BRAND_NAME_MAX, logoMaxBytes: LOGO_MAX_BYTES, logoMaxSide: LOGO_MAX_SIDE,
});

/** Deletes R2 objects waiting in media_deletes (a key no organisation points at any more). */
export async function drainMediaDeletes(env, keys = null) {
  const db = env.DB;
  const rows = keys ? keys.map((key) => ({ key })) : await all(db, "SELECT key FROM media_deletes ORDER BY queued_at LIMIT 500");
  let n = 0;
  for (const { key } of rows) {
    if (!key) continue;
    if (await one(db, "SELECT 1 AS x FROM orgs WHERE brand_logo_key = ?", key)) { await run(db, "DELETE FROM media_deletes WHERE key = ?", key); continue; }
    try { await deleteImage(env, key); } catch { continue; } // stays queued for the next run
    await run(db, "DELETE FROM media_deletes WHERE key = ?", key);
    n += 1;
  }
  return n;
}

/** Removes an organisation's logo (the host's Remove, or an admin's). The trigger queues the object; it goes at once. */
export async function removeLogo(env, orgId) {
  const row = await one(env.DB, "SELECT brand_logo_key FROM orgs WHERE id = ?", orgId);
  if (!row?.brand_logo_key) return false;
  await run(env.DB, "UPDATE orgs SET brand_logo_key = NULL WHERE id = ?", orgId);
  await drainMediaDeletes(env, [row.brand_logo_key]);
  return true;
}

/**
 * /media/logo/<org>/<file>: a logo is public by nature once it is on a public page, so it is served to anyone, with a long
 * cache, while it is the current logo of an organisation that shows it on at least one paid event with branding on.
 * Otherwise only the organisation's own hosts, on the host site, get it (the settings preview, Present, the poster),
 * privately. Anything else, a replaced or removed logo or a guessed address, is the same 404.
 */
export async function serveLogo(c, key) {
  const db = c.env.DB;
  const gone = () => c.json({ error: "We couldn't find that picture. It may have been removed." }, 404);
  if (!LOGO_KEY.test(key)) return gone();
  const org = await one(db, "SELECT id, brand_off FROM orgs WHERE brand_logo_key = ?", key);
  if (!org) return gone();
  const shown = !org.brand_off && await one(db, "SELECT 1 AS x FROM events WHERE org_id = ? AND is_paid = 1 AND use_branding = 1 LIMIT 1", org.id);
  if (shown) return (await getImage(c.env, key, { cache: "public, max-age=31536000, immutable" })) || gone();
  if (isHostSite(c)) {
    await loadHost(c);
    const me = c.get("host");
    if (me && await one(db, "SELECT 1 AS x FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, me.id)) {
      return (await getImage(c.env, key, { cache: "private, max-age=3600" })) || gone();
    }
  }
  return gone();
}

/** The routes under /api/host/orgs/:id/brand. The organisation is the host's own (findOrg), or a 404. */
export function registerBrandHost(hostApp, { findOrg }) {
  async function own(c) {
    const me = c.get("host");
    const db = c.env.DB;
    const org = await findOrg(db, me.id);
    if (!org || org.id !== c.req.param("id")) throw new HttpError(404, "We couldn't find that organisation. Reload the page and try again.", "not_found");
    const m = await one(db, "SELECT role FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, me.id);
    return { me, org, role: m?.role || null };
  }
  // Only the owner, the one admin-level role an organisation has (staff and sponsor viewers are not), changes branding.
  async function owner(c, { write = true } = {}) {
    const o = await own(c);
    if (o.role !== "owner") throw new HttpError(403, "Only the organisation's owner can change its branding. Ask them to do it.", "not_owner");
    if (write && o.org.brand_off) throw new HttpError(403, "Lanyard switched off this organisation's branding. Email us if you think that is a mistake.", "brand_off");
    return o;
  }
  const fresh = async (c, id, role) => brandSettings(await one(c.env.DB, "SELECT * FROM orgs WHERE id = ?", id), role);

  hostApp.get("/api/host/orgs/:id/brand", async (c) => {
    const { org, role } = await own(c);
    return c.json(brandSettings(org, role));
  });

  hostApp.put("/api/host/orgs/:id/brand", async (c) => {
    const { org, role } = await owner(c);
    const b = await c.req.json().catch(() => ({}));
    if (typeof b.name !== "string") throw new HttpError(400, "Send the name as text.", "bad_name");
    const name = cleanBrandName(b.name);
    await run(c.env.DB, "UPDATE orgs SET brand_name = ? WHERE id = ?", name || null, org.id);
    return c.json(await fresh(c, org.id, role));
  });

  hostApp.post("/api/host/orgs/:id/brand/logo", async (c) => {
    const { org, role } = await owner(c);
    const db = c.env.DB;
    const tooBig = () => new HttpError(400, "That logo is over 1 MB. Choose a smaller file.", "logo_large");
    // A data URL of 1 MB is about 1.4 MB of text; anything much bigger is refused before it is read.
    if (Number(c.req.header("content-length") || 0) > LOGO_MAX_BYTES * 1.4 + 2048) throw tooBig();
    if ((await bump(db, `brand:logo:${org.id}`, HOUR)) > LOGO_UPLOADS_PER_HOUR) throw new HttpError(429, "That's a lot of logos in an hour. Try again later.", "throttled");
    const b = await c.req.json().catch(() => ({}));
    let img;
    try { img = readImage(b.dataUrl, { strip: true, maxBytes: LOGO_MAX_BYTES }); }
    catch (e) {
      if (e.status === 413) throw tooBig();
      throw new HttpError(400, "Use a PNG, JPEG or WebP picture for the logo. Other files, SVG included, can't be used.", "logo_type");
    }
    const size = imageSize(img.bytes, img.ext);
    if (!size || !size.w || !size.h) throw new HttpError(400, "That picture can't be read. Save it again as a PNG, JPEG or WebP.", "logo_type");
    if (Math.max(size.w, size.h) > LOGO_MAX_SIDE) throw new HttpError(400, `Make the logo ${LOGO_MAX_SIDE} pixels or smaller on its longest side.`, "logo_side");
    const key = `logo/${org.id}/${[...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, "0")).join("")}.${img.ext}`;
    await c.env.MEDIA.put(key, img.bytes, { httpMetadata: { contentType: img.type } });
    const old = await one(db, "SELECT brand_logo_key FROM orgs WHERE id = ?", org.id);
    // The trigger puts the old logo in media_deletes as this runs; it is deleted straight after.
    await run(db, "UPDATE orgs SET brand_logo_key = ?, brand_logo_version = COALESCE(brand_logo_version, 0) + 1 WHERE id = ?", key, org.id);
    if (old?.brand_logo_key) await drainMediaDeletes(c.env, [old.brand_logo_key]);
    return c.json(await fresh(c, org.id, role), 201);
  });

  hostApp.delete("/api/host/orgs/:id/brand/logo", async (c) => {
    const { org, role } = await owner(c, { write: false }); // removing is always allowed, even when switched off
    await removeLogo(c.env, org.id);
    return c.json(await fresh(c, org.id, role));
  });
}

/** For the admin page: organisations with any branding. */
export async function adminBrands(db) {
  const rows = await all(db,
    `SELECT o.id, o.name, o.brand_name, o.brand_logo_key, o.brand_logo_version, o.brand_off,
            (SELECT COUNT(*) FROM events e WHERE e.org_id = o.id AND e.is_paid = 1 AND e.use_branding = 1) AS shown_on
       FROM orgs o WHERE o.brand_name IS NOT NULL OR o.brand_logo_key IS NOT NULL OR o.brand_off = 1
      ORDER BY o.created_at DESC LIMIT 200`);
  return rows.map((o) => ({
    id: o.id, name: o.name, brandName: o.brand_name || null, hasLogo: !!o.brand_logo_key, version: o.brand_logo_version || null,
    off: !!o.brand_off, paidBrandedEvents: o.shown_on,
  }));
}
