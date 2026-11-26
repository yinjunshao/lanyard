// F74 (D063): the admin's profiles for people who are not on Lanyard yet. Registered from admin.js after its middleware,
// so every route is refused without the admin token (401), counts against the try limit and is written to admin_audit.
// No route here takes a claim token, in its path or its query, so a token is never in the audit log; the token is in the
// answer of the two routes that make one (make, and Copy link), once, and nowhere else.
//   GET    /api/admin/premade             { waiting: [...], claimed: { count, recent: [{ id, claimedAt }] } }
//   POST   /api/admin/premade             make one: profile fields as Edit profile takes them, `source`, optional photo
//   GET    /api/admin/premade/:id         one waiting profile, for the edit form
//   PUT    /api/admin/premade/:id         change it (the same checks as Edit profile)
//   POST   /api/admin/premade/:id/link    Copy link: a new link, and the old one stops
//   DELETE /api/admin/premade/:id         erase it and its photo
//   GET    /api/admin/premade/:id/photo   its photo, for the admin page only (never public until claimed)
// Only unclaimed admin-made accounts are reachable here: a claimed one, or anyone else's account, is a 404.
import { newId, now, one, all, run } from "./db.js";
import { putImage, getImage, deleteImage } from "./media.js";
import { readInstitution } from "./institutions.js";
import { validMode, profilePayload, applyInstitution, photoAllowed } from "./profileFields.js";
import { newCardCode } from "./codes.js";
import { publicOrigin } from "./unsub.js";
import { premadeById, readSource, issueClaimLink, newClaimToken, hashClaimToken, claimPath, erasePremade, PREMADE_MAX_AGE, UNCLAIMED } from "./premade.js";

const GONE = { error: "That profile isn't waiting to be claimed. It may have been claimed or deleted." };

const linkOut = (env, token, expiresAt) => ({ link: `${publicOrigin(env)}${claimPath(token)}`, path: claimPath(token), expiresAt });

/** The form's view of a waiting profile. */
function formOf(p) {
  return {
    name: p.name || "", mode: p.mode === "career" ? "career" : "student", company: p.company || "", role: p.role || "",
    uni: p.uni || "", institutionId: p.institution_id || null, course: p.course || "", year: p.year || "",
    headline: p.headline || "", about: p.about || "", tags: p.tags || [], links: p.links || {}, hasPhoto: !!p.photo_key,
  };
}

export function registerPremadeAdmin(app) {
  app.get("/api/admin/premade", async (c) => {
    const db = c.env.DB;
    const waiting = await all(db,
      `SELECT u.id, u.created_at, p.name, l.source, l.expires_at, l.created_at AS link_at,
              (SELECT k.id FROM cards k WHERE k.user_id = u.id ORDER BY k.is_default DESC, k.created_at LIMIT 1) AS card_id
         FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN claim_links l ON l.user_id = u.id
        WHERE ${UNCLAIMED("u")} ORDER BY u.created_at DESC LIMIT 200`);
    const claimed = await one(db, "SELECT COUNT(*) AS n FROM users WHERE admin_made = 1 AND is_guest = 0");
    const recent = await all(db, "SELECT id, claimed_at FROM users WHERE admin_made = 1 AND is_guest = 0 ORDER BY claimed_at DESC LIMIT 20");
    return c.json({
      waiting: waiting.map((w) => ({
        id: w.id, cardId: w.card_id, name: w.name, source: w.source || "", createdAt: w.created_at,
        expiresAt: w.expires_at || w.created_at + PREMADE_MAX_AGE, linkMadeAt: w.link_at || null,
      })),
      claimed: { count: claimed?.n || 0, recent: recent.map((r) => ({ id: r.id, claimedAt: r.claimed_at || null })) },
    });
  });

  app.post("/api/admin/premade", async (c) => {
    const db = c.env.DB;
    const body = await c.req.json().catch(() => ({}));
    const src = readSource(body.source);
    if (src.error) return c.json({ error: src.error }, 400);
    // The same checks as making a card (POST /api/profile) and Edit profile (PUT /api/profile).
    if (typeof body.name !== "string" || !body.name.trim()) return c.json({ error: "Add their name to make the card." }, 400);
    if (!validMode(body)) return c.json({ error: "Choose a mode for the card: student or career." }, 400);
    const pick = readInstitution(body);
    if (pick.error) return c.json({ error: pick.error }, 400);
    const fields = profilePayload({ ...body });
    applyInstitution(fields, pick, null);

    const userId = newId();
    const ts = now();
    let photoKey = null;
    if (body.photoDataUrl) photoKey = await putImage(c.env, await photoAllowed(c, { id: userId }, body.photoDataUrl), "avatar");
    const cardId = newId();
    const cc = await newCardCode(db);
    // The claim link is made in the same write as the account, so a profile never exists without one.
    const token = newClaimToken();
    const expiresAt = ts + PREMADE_MAX_AGE;
    try {
      await db.batch([
        // A guest with no email and no session; admin_made marks it private until claimed.
        db.prepare("INSERT INTO users (id, created_at, is_guest, admin_made) VALUES (?, ?, 1, 1)").bind(userId, ts),
        db.prepare(
          `INSERT INTO profiles (user_id, name, photo_key, uni, institution_id, course, year, mode, company, role, headline, about, links, tags, projects, is_public, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', 1, ?)`
        ).bind(userId, fields.name || body.name.trim(), photoKey, fields.uni || "", fields.institution_id || null, fields.course || "", fields.year || "",
          fields.mode || "student", fields.company || "", fields.role || "", fields.headline || "", fields.about || "",
          fields.links || "{}", fields.tags || "[]", ts),
        db.prepare(
          `INSERT INTO cards (id, user_id, code, code_rotates_at, name, note, visible_links, tags, theme, is_default, created_at)
           VALUES (?, ?, ?, ?, 'General', '', '[]', '[]', 'default', 1, ?)`
        ).bind(cardId, userId, cc.code, cc.rotatesAt, ts),
        cc.registerStmt(cardId),
        db.prepare("INSERT INTO claim_links (user_id, token_hash, source, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
          .bind(userId, await hashClaimToken(token), src.source, ts, expiresAt),
      ]);
    } catch (e) {
      if (photoKey) await deleteImage(c.env, photoKey).catch(() => {});
      throw e;
    }
    return c.json({ ok: true, id: userId, cardId, ...linkOut(c.env, token, expiresAt) }, 201);
  });

  app.get("/api/admin/premade/:id", async (c) => {
    const db = c.env.DB;
    const u = await premadeById(db, c.req.param("id"));
    if (!u) return c.json(GONE, 404);
    const [p, l, card] = await Promise.all([
      one(db, "SELECT * FROM profiles WHERE user_id = ?", u.id),
      one(db, "SELECT source, expires_at FROM claim_links WHERE user_id = ?", u.id),
      one(db, "SELECT id FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", u.id),
    ]);
    if (!p) return c.json(GONE, 404);
    return c.json({ id: u.id, cardId: card?.id || null, createdAt: u.created_at, expiresAt: l?.expires_at || u.created_at + PREMADE_MAX_AGE, source: l?.source || "", profile: formOf(p) });
  });

  app.put("/api/admin/premade/:id", async (c) => {
    const db = c.env.DB;
    const u = await premadeById(db, c.req.param("id"));
    if (!u) return c.json(GONE, 404);
    const current = await one(db, "SELECT * FROM profiles WHERE user_id = ?", u.id);
    if (!current) return c.json(GONE, 404);
    const body = await c.req.json().catch(() => ({}));
    let source = null;
    if (body.source !== undefined) {
      const src = readSource(body.source);
      if (src.error) return c.json({ error: src.error }, 400);
      source = src.source;
    }
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) return c.json({ error: "Add their name to make the card." }, 400);
    // From here on, exactly the Edit profile save (PUT /api/profile).
    if (!validMode(body)) return c.json({ error: "Choose a mode for the card: student or career." }, 400);
    const pick = readInstitution(body);
    if (pick.error) return c.json({ error: pick.error }, 400);
    let photoKey = current.photo_key;
    if (body.photoDataUrl) {
      photoKey = await putImage(c.env, await photoAllowed(c, u, body.photoDataUrl), "avatar");
      if (current.photo_key) await deleteImage(c.env, current.photo_key).catch(() => {});
    } else if (body.removePhoto === true) {
      await deleteImage(c.env, current.photo_key);
      photoKey = null;
    }
    const fields = profilePayload(body);
    applyInstitution(fields, pick, current);
    const sets = Object.keys(fields);
    if (sets.length || photoKey !== current.photo_key) {
      await run(db, `UPDATE profiles SET ${[...sets, "photo_key", "updated_at"].map((k) => `${k} = ?`).join(", ")} WHERE user_id = ?`,
        ...Object.values(fields), photoKey, now(), u.id);
    }
    if (source) await run(db, "UPDATE claim_links SET source = ? WHERE user_id = ?", source, u.id);
    return c.json({ ok: true });
  });

  // Copy link: the only way to see a link again is to make a new one, which stops the old one.
  app.post("/api/admin/premade/:id/link", async (c) => {
    const db = c.env.DB;
    const u = await premadeById(db, c.req.param("id"));
    if (!u) return c.json(GONE, 404);
    if (u.created_at + PREMADE_MAX_AGE <= now()) return c.json({ error: "This profile is past its 30 days and will be deleted tonight. Make a new one instead." }, 409);
    const link = await issueClaimLink(db, u.id, u.created_at);
    if (!link) return c.json(GONE, 404);
    return c.json({ ok: true, ...linkOut(c.env, link.token, link.expiresAt) });
  });

  app.delete("/api/admin/premade/:id", async (c) => {
    const ok = await erasePremade(c.env, c.req.param("id"));
    return ok ? c.json({ ok: true }) : c.json(GONE, 404);
  });

  app.get("/api/admin/premade/:id/photo", async (c) => {
    const db = c.env.DB;
    const u = await premadeById(db, c.req.param("id"));
    const p = u ? await one(db, "SELECT photo_key FROM profiles WHERE user_id = ?", u.id) : null;
    const res = p?.photo_key ? await getImage(c.env, p.photo_key, { noStore: true }) : null;
    return res || c.json({ error: "This profile has no photo." }, 404);
  });
}
