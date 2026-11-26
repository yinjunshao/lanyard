// F75 (D064): the admin's side of suggested details ("Suggest details for someone" on /admin/profiles). Registered from
// admin.js after its middleware, so every route is refused without the admin token (401), counts against the try limit
// and is written to admin_audit (method, path and the search words).
//   GET    /api/admin/suggest/people?q=&low=1   find people: by name, institution, company, email or card code;
//                                               low=1 keeps only cards scoring 2 of 6 or under (scored here, in pages)
//   GET    /api/admin/suggest                   the open suggestions, and how suggestions ended in the last 30 days
//   GET    /api/admin/suggest/:id               one person's card fields now, and their open suggestion
//   POST   /api/admin/suggest/:id               make (or replace) their suggestion: card fields, `source`, optional photo
//   DELETE /api/admin/suggest/:id               withdraw it (and its photo)
//   GET    /api/admin/suggest/:id/photo         the suggested photo, for the admin page only (never public)
// Only accounts with a profile that are not admin-made profiles waiting to be claimed (those are edited on the same
// page, F74): anyone else is a 404.
import { all, one } from "./db.js";
import { getImage, deleteImage } from "./media.js";
import { profileScore } from "../src/lib/profileScore.js";
import { readSource, UNCLAIMED } from "./premade.js";
import { readSuggestion, writeSuggestion, endSuggestion, openSuggestion, offeredKeys, parseFields, putSuggestedPhoto,
  suggestionTotals, labelOf, LOW_SCORE } from "./suggestedEdits.js";

const GONE = { error: "We couldn't find that person. They may have deleted their account." };
const PAGE = 500; // profiles scored at a time
const MAX_PAGES = 40; // at most 20,000 profiles read for one low-score list
const PROFILE_COLS = "p.user_id, p.name, p.photo_key, p.uni, p.institution_id, p.course, p.year, p.company, p.role, p.headline, p.about, p.links, p.tags, p.mode";

/** A person with a profile, not an admin-made one waiting to be claimed. */
function personById(db, id) {
  return one(db, `SELECT u.id, u.email_verified, ${PROFILE_COLS} FROM users u JOIN profiles p ON p.user_id = u.id
    WHERE u.id = ? AND NOT ${UNCLAIMED("u")}`, String(id || ""));
}

const row = (r, open) => {
  const s = profileScore(r);
  return { id: r.user_id, name: r.name || "", mode: r.mode === "career" ? "career" : "student", place: (r.mode === "career" ? r.company : r.uni) || "",
    score: s.score, max: s.max, emailVerified: !!r.email_verified, open: !!open };
};

/** The card fields as they are now, for the form (the person's own photo is public at /media). */
const formOf = (p) => ({
  name: p.name || "", mode: p.mode === "career" ? "career" : "student", company: p.company || "", role: p.role || "",
  uni: p.uni || "", institutionId: p.institution_id || null, course: p.course || "", year: p.year || "",
  headline: p.headline || "", about: p.about || "", tags: p.tags || [], links: p.links || {},
  photo: p.photo_key ? `/media/${p.photo_key}` : null,
});

const suggestionOut = (s) => s && ({
  id: s.id, source: s.source, createdAt: s.created_at, expiresAt: s.expires_at, emailedAt: s.emailed_at || null,
  fields: parseFields(s), hasPhoto: !!s.photo_key, offered: offeredKeys(s).map((k) => ({ key: k, label: labelOf(k) })),
});

export function registerSuggestedEditsAdmin(app) {
  app.get("/api/admin/suggest/people", async (c) => {
    const db = c.env.DB;
    const q = String(c.req.query("q") || "").trim().slice(0, 60);
    const low = c.req.query("low") === "1";
    const keep = (r) => !low || profileScore(r).score <= LOW_SCORE;
    let found = [];
    if (q.length >= 2) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const rows = await all(db,
        `SELECT u.email_verified, ${PROFILE_COLS} FROM users u JOIN profiles p ON p.user_id = u.id
          WHERE (p.name LIKE ? OR p.uni LIKE ? OR p.company LIKE ? OR u.recovery_email LIKE ? OR u.id = ?
             OR EXISTS (SELECT 1 FROM cards k WHERE k.user_id = u.id AND k.code = ?))
            AND NOT ${UNCLAIMED("u")}
          ORDER BY u.created_at DESC LIMIT 200`, like, like, like, like, q.toLowerCase(), q.toUpperCase());
      found = rows.filter(keep).slice(0, 20);
    } else if (low) {
      // Scored here, a page at a time, as the platform metrics do (F70): the score is not stored anywhere.
      let last = "";
      for (let i = 0; i < MAX_PAGES && found.length < 50; i++) {
        const rows = await all(db,
          `SELECT u.email_verified, ${PROFILE_COLS} FROM profiles p JOIN users u ON u.id = p.user_id
            WHERE p.user_id > ? AND NOT ${UNCLAIMED("u")} ORDER BY p.user_id LIMIT ${PAGE}`, last);
        for (const r of rows) if (found.length < 50 && keep(r)) found.push(r);
        if (rows.length < PAGE) break;
        last = rows[rows.length - 1].user_id;
      }
    } else return c.json({ people: [] });
    const open = new Set(found.length ? (await all(db,
      `SELECT user_id FROM profile_suggestions WHERE expires_at > ? AND user_id IN (${found.map(() => "?").join(",")})`, Date.now(), ...found.map((r) => r.user_id))).map((r) => r.user_id) : []);
    return c.json({ people: found.map((r) => row(r, open.has(r.user_id))) });
  });

  app.get("/api/admin/suggest", async (c) => {
    const db = c.env.DB;
    const open = await all(db,
      `SELECT s.*, p.name FROM profile_suggestions s JOIN profiles p ON p.user_id = s.user_id
        WHERE s.expires_at > ? ORDER BY s.created_at DESC LIMIT 200`, Date.now());
    return c.json({
      open: open.map((s) => ({ userId: s.user_id, name: s.name || "", status: "waiting", ...suggestionOut(s) })),
      totals: await suggestionTotals(db),
    });
  });

  app.get("/api/admin/suggest/:id", async (c) => {
    const db = c.env.DB;
    const p = await personById(db, c.req.param("id"));
    if (!p) return c.json(GONE, 404);
    const [card, s] = await Promise.all([
      one(db, "SELECT id FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", p.id),
      openSuggestion(db, p.id),
    ]);
    return c.json({ id: p.id, cardId: card?.id || null, emailVerified: !!p.email_verified, score: profileScore(p).score, profile: formOf(p), suggestion: suggestionOut(s) || null });
  });

  app.post("/api/admin/suggest/:id", async (c) => {
    const db = c.env.DB;
    const p = await personById(db, c.req.param("id"));
    if (!p) return c.json(GONE, 404);
    const body = await c.req.json().catch(() => null);
    const read = readSuggestion(body, p);
    if (read.error) return c.json({ error: read.error, ...(read.code ? { code: read.code } : {}) }, 400);
    const src = readSource(body.source);
    if (src.error) return c.json({ error: src.error }, 400);
    if (!Object.keys(read.fields).length && !body.photoDataUrl) return c.json({ error: "There is nothing to suggest: their card already says all of this." }, 400);
    const photoKey = body.photoDataUrl ? await putSuggestedPhoto(c.env, body.photoDataUrl) : null;
    let made;
    try { made = await writeSuggestion(c.env, { userId: p.id, fields: read.fields, source: src.source, photoKey }); }
    catch (e) {
      if (photoKey) await deleteImage(c.env, photoKey).catch(() => {});
      if (/FOREIGN KEY/i.test(String(e?.message || e))) return c.json(GONE, 404); // erased in the meantime
      throw e;
    }
    return c.json({ ok: true, ...made }, 201);
  });

  app.delete("/api/admin/suggest/:id", async (c) => {
    const ok = await endSuggestion(c.env, String(c.req.param("id") || ""));
    return ok ? c.json({ ok: true }) : c.json({ error: "There is no open suggestion for this person." }, 404);
  });

  app.get("/api/admin/suggest/:id/photo", async (c) => {
    const s = await openSuggestion(c.env.DB, c.req.param("id"));
    const res = s?.photo_key ? await getImage(c.env, s.photo_key, { noStore: true }) : null;
    return res || c.json({ error: "This suggestion has no photo." }, 404);
  });
}
