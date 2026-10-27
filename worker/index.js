import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { newId, now, one, all, run, uniqueCode } from "./db.js";
import { sessionMiddleware, COOKIE, endSession, requireUser } from "./session.js";
import * as Passkeys from "./passkeys.js";
import * as Auth from "./auth.js";
import { TERMS_VERSION, termsScope, hasConsent, recordConsent, recordConsentStmt } from "./legal.js";
import { putImage, getImage, deleteImage } from "./media.js";
import { eraseUser, purgeExpired } from "./purge.js";
import { eventsApp } from "./events.js";
import { hostApp } from "./hosts.js";
import {
  newCardCode, rotateCardCode, freshenCards, findCardByCode, normaliseCode,
  isThrottled, recordMiss, throttleKeys,
} from "./codes.js";
import { planOf, USER_PLANS, PLUS_PRICE } from "./plans.js";

const app = new Hono();

app.use("*", async (c, next) => {
  await sessionMiddleware("DB")(c, next);
});

/* ----------------------------- shape helpers ----------------------------- */

const TEXT_FIELDS = ["name", "uni", "course", "year", "headline", "about"];

function profilePayload(input) {
  const out = {};
  for (const k of TEXT_FIELDS) if (typeof input[k] === "string") out[k] = input[k].trim().slice(0, 400);
  if (typeof input.links === "object" && input.links) {
    const links = {};
    for (const [label, url] of Object.entries(input.links)) {
      if (/^https?:\/\//.test(String(url)) && label.length <= 40) links[label.slice(0, 40)] = String(url).slice(0, 300);
    }
    out.links = JSON.stringify(links);
  }
  for (const jsonField of ["tags", "projects"]) {
    if (Array.isArray(input[jsonField])) {
      out[jsonField] = JSON.stringify(
        input[jsonField].slice(0, jsonField === "projects" ? 3 : 30).map((x) => String(x).slice(0, 60))
      );
    }
  }
  if (typeof input.is_public === "boolean") out.is_public = input.is_public ? 1 : 0;
  if (typeof input.show_age === "boolean") out.show_age = input.show_age ? 1 : 0;
  return out;
}

async function loadFullUser(db, userId) {
  const user = await one(db, "SELECT * FROM users WHERE id = ?", userId);
  if (!user) return null;
  const profile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", userId);
  const cards = await all(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at", userId);
  await freshenCards(db, cards); // lazy code rotation
  return { user, profile, cards };
}

// Public view of a card = card overlays + underlying profile.
// `forOwner: true` is the card's own user looking at their own card list —
// it must not vanish just because they've switched "Profile is public" off
// (it used to: this returned null for every one of their own cards the
// moment is_public went false, which broke My Card / Cards entirely), and
// it needs the raw link/tag picks, not just the resolved values, so an
// edit screen can show which links are currently selected for this card.
async function cardView(db, card, { forOwner = false, limited = false } = {}) {
  const p = await one(db, "SELECT * FROM profiles WHERE user_id = ?", card.user_id);
  if (!p) return null;
  if (!p.is_public && !forOwner && !limited) return null;
  const links = card.visible_links?.length
    ? Object.fromEntries(card.visible_links.map((k) => [k, p.links?.[k]]).filter(([, v]) => v))
    : p.links || {};
  const tags = card.tags?.length ? card.tags : p.tags || [];
  // `limited` = a private profile seen by someone who shares an event
  // directory with its owner: identity and "come to me for" only.
  return {
    cardId: card.id,
    name: card.name,
    note: card.note,
    theme: card.theme,
    strapColor: card.strap_color,
    eventId: card.event_id,
    ...(limited ? { limited: true } : {}),
    // The code is only ever sent to the card's owner.
    ...(forOwner ? {
      code: card.code,
      codeRotatesAt: card.code_rotates_at || null,
      visibleLinks: card.visible_links || [],
      tagsOverride: card.tags || [],
    } : {}),
    profile: {
      userId: p.user_id,
      name: p.name,
      photo: p.photo_key ? `/media/${p.photo_key}` : null,
      uni: p.uni, course: p.course, year: p.year,
      headline: p.headline, about: limited ? "" : p.about,
      links: limited ? {} : links, tags,
      projects: limited ? [] : (p.projects || []).map((pr) => ({ ...pr, image: pr.image_key ? `/media/${pr.image_key}` : null })),
    },
  };
}

/* --------------------------------- me ------------------------------------ */

app.get("/api/me", async (c) => {
  const u = c.get("user");
  const data = await loadFullUser(c.env.DB, u.id);
  const profile = data.profile
    ? { ...data.profile, photo: data.profile.photo_key ? `/media/${data.profile.photo_key}` : null }
    : null;
  const plan = planOf(data.user);
  const waitlisted = !!(await one(c.env.DB, "SELECT 1 AS x FROM plus_waitlist WHERE user_id = ?", u.id));
  const termsAccepted = await hasConsent(c.env.DB, u.id, termsScope());
  return c.json({
    user: {
      id: u.id, isGuest: u.is_guest, hasPasskey: !!u.has_passkey,
      hasRecovery: !!u.has_recovery, claimed: !!(u.has_passkey || u.has_recovery),
      termsVersion: TERMS_VERSION, termsAccepted,
      // Anyone with a profile must have accepted the current Terms and Privacy Policy.
      needsTerms: !!profile && !termsAccepted,
      recoveryEmail: u.recovery_email || null,
      verifiedStudent: !!u.verified_student, over18: !!u.over_18,
    },
    plan: {
      tier: plan.tier, label: plan.label, cards: plan.cards, customStrap: plan.customStrap,
      onWaitlist: waitlisted, plusPrice: PLUS_PRICE, freeCards: USER_PLANS.free.cards,
    },
    profile,
    cards: await Promise.all(data.cards.map((card) => cardView(c.env.DB, card, { forOwner: true }).catch(() => null))),
  });
});

// Guest completes their profile the first time. Creates profile + default card.
app.post("/api/profile", async (c) => {
  const u = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.name || !body.name.trim()) return c.json({ error: "name required" }, 400);

  const db = c.env.DB;
  const existing = await one(db, "SELECT user_id FROM profiles WHERE user_id = ?", u.id);
  if (existing) return c.json({ error: "profile exists; use PUT" }, 409);
  // Creating a profile is signing up: it needs the Terms / Privacy Policy and the 18+ confirmation.
  if (body.acceptTerms !== true || body.over18 !== true) {
    return c.json({ error: "Please confirm you're 18 or over and agree to the Terms and Privacy Policy.", code: "terms_required" }, 400);
  }

  let photoKey = null;
  if (body.photoDataUrl) photoKey = await putImage(c.env, body.photoDataUrl, "avatar");
  await run(db, "UPDATE users SET over_18 = 1, age_confirmed_at = ? WHERE id = ?", now(), u.id);
  await recordConsent(db, u.id, termsScope());

  const fields = profilePayload({ ...body });
  const ts = now();
  if (photoKey) fields.photo_key = photoKey;
  await db.batch([
    db.prepare(
      `INSERT INTO profiles (user_id, name, photo_key, uni, course, year, headline, about, links, tags, projects, is_public, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    ).bind(
      u.id, fields.name || body.name.trim(), photoKey,
      fields.uni || "", fields.course || "", fields.year || "",
      fields.headline || "", fields.about || "",
      fields.links || "{}", fields.tags || "[]", fields.projects || "[]", ts
    ),
  ]);

  const cardId = newId();
  const cc = await newCardCode(db);
  await db.batch([
    db.prepare(
      `INSERT INTO cards (id, user_id, code, code_rotates_at, name, note, visible_links, tags, theme, is_default, created_at)
       VALUES (?, ?, ?, ?, 'General', ?, '[]', '[]', 'default', 1, ?)`
    ).bind(cardId, u.id, cc.code, cc.rotatesAt, body.note?.slice?.(0, 300) || "", ts),
    cc.registerStmt(cardId),
  ]);
  await run(db, "UPDATE users SET is_guest = 0 WHERE id = ? AND has_passkey = 0", u.id);

  const data = await loadFullUser(db, u.id);
  return c.json({ ok: true, profile: data.profile, cards: data.cards }, 201);
});

// Existing accounts accept the current Terms / Privacy Policy (and confirm 18+).
app.post("/api/terms/accept", async (c) => {
  const u = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  if (body.accept !== true || body.over18 !== true) {
    return c.json({ error: "Please confirm you're 18 or over and agree to continue.", code: "terms_required" }, 400);
  }
  await run(c.env.DB, "UPDATE users SET over_18 = 1, age_confirmed_at = COALESCE(age_confirmed_at, ?) WHERE id = ?", now(), u.id);
  await recordConsent(c.env.DB, u.id, termsScope());
  return c.json({ ok: true, version: TERMS_VERSION });
});

app.put("/api/profile", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const current = await one(db, "SELECT * FROM profiles WHERE user_id = ?", u.id);
  if (!current) return c.json({ error: "create profile first" }, 404);
  const body = await c.req.json().catch(() => ({}));

  let photoKey = current.photo_key;
  if (body.photoDataUrl) {
    photoKey = await putImage(c.env, body.photoDataUrl, "avatar");
  } else if (body.removePhoto === true) {
    await deleteImage(c.env, current.photo_key);
    photoKey = null;
  }
  const fields = profilePayload(body);
  const sets = Object.keys(fields);
  const vals = Object.values(fields);
  if (sets.length || photoKey !== current.photo_key) {
    const sql = `UPDATE profiles SET ${[...sets, "photo_key", "updated_at"].map((k) => `${k} = ?`).join(", ")} WHERE user_id = ?`;
    await run(db, sql, ...vals, photoKey, now(), u.id);
  }
  return c.json({ ok: true });
});

/* ------------------------------- recovery -------------------------------- */

app.post("/api/account/email", async (c) => {
  const u = requireUser(c);
  const { email } = await c.req.json();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return c.json({ error: "bad email" }, 400);
  await run(c.env.DB, "UPDATE users SET recovery_email = ?, email_domain = ? WHERE id = ?",
    email.toLowerCase(), email.split("@")[1].toLowerCase(), u.id);
  return c.json({ ok: true });
});

/* ------------------------------- passkeys -------------------------------- */

app.get("/api/passkey/register/options", async (c) =>
  c.json(await Passkeys.registerOptions(c, c.env.DB)));
app.post("/api/passkey/register/verify", async (c) => {
  const body = await c.req.json();
  await Passkeys.registerVerify(c, c.env.DB, body);
  return c.json({ ok: true });
});
app.get("/api/passkey/login/options", async (c) =>
  c.json(await Passkeys.loginOptions(c, c.env.DB)));
app.post("/api/passkey/login/verify", async (c) => {
  const body = await c.req.json();
  const { sid } = await Passkeys.loginVerify(c, c.env.DB, body);
  setCookie(c, COOKIE, sid, {
    httpOnly: true, sameSite: "Lax", path: "/",
    secure: c.req.url.startsWith("https://"), maxAge: 365 * 24 * 3600,
  });
  return c.json({ ok: true });
});

/* --------------------- sign-in on other devices / recovery --------------------- */

app.post("/api/auth/link", (c) => Auth.createLinkCode(c, c.env.DB));
app.post("/api/auth/redeem", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return Auth.redeemLinkCode(c, c.env.DB, body.code);
});
app.post("/api/auth/recovery", (c) => Auth.createRecoveryKey(c, c.env.DB));
app.post("/api/auth/recovery/redeem", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return Auth.redeemRecoveryKey(c, c.env.DB, body.key);
});
app.post("/api/logout", async (c) => {
  endSession(c, c.env.DB);
  return c.json({ ok: true });
});

/* --------------------------- GDPR: data / delete ------------------------- */

app.get("/api/account/export", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const q = (sql, ...a) => all(db, sql, ...a);
  const [profile, cards, connections, notes, messages, consents, checkins, orgs, reports, blocks, passkeys] = await Promise.all([
    one(db, "SELECT * FROM profiles WHERE user_id = ?", u.id),
    q("SELECT * FROM cards WHERE user_id = ?", u.id),
    q("SELECT * FROM connections WHERE user_a = ? OR user_b = ? ORDER BY created_at", u.id, u.id),
    q("SELECT connection_id, text, updated_at FROM notes WHERE user_id = ?", u.id),
    q(`SELECT m.connection_id, m.from_id, m.text, m.photo_key, m.created_at FROM messages m
        JOIN connections c ON c.id = m.connection_id WHERE c.user_a = ? OR c.user_b = ? ORDER BY m.created_at`, u.id, u.id),
    q("SELECT scope, created_at FROM consents WHERE user_id = ?", u.id),
    q("SELECT event_id, answers, sponsor, created_at FROM checkins WHERE user_id = ?", u.id),
    q(`SELECT o.id, o.name, o.org_type, om.role FROM org_members om JOIN orgs o ON o.id = om.org_id WHERE om.user_id = ?`, u.id),
    q("SELECT target_id, reason, created_at FROM reports WHERE reporter_id = ?", u.id).catch(() => []),
    q("SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ?", u.id).catch(() => []),
    q("SELECT id, created_at FROM webauthn_credentials WHERE user_id = ?", u.id).catch(() => []),
  ]);
  const media = (k) => (k ? `/media/${k}` : null);
  return c.json({
    exportedAt: now(),
    note: "Image links need you to be signed in to open them. Passkey keys, recovery keys and session tokens are not included for security.",
    user: { id: u.id, isGuest: !!u.is_guest, plan: u.plan || "free", recoveryEmail: u.recovery_email || null,
            verifiedStudent: !!u.verified_student, createdAt: u.created_at },
    profile: profile && { ...profile, photo: media(profile.photo_key) },
    cards,
    connections: connections.map((x) => ({
      id: x.id, otherUserId: x.user_a === u.id ? x.user_b : x.user_a, cardId: x.card_id,
      eventId: x.event_id, metAt: x.created_at, sharedSelfie: media(x.selfie_key),
    })),
    privateNotes: notes,
    messages: messages.map((m) => ({ ...m, photo: media(m.photo_key) })),
    eventCheckins: checkins,
    organisations: orgs,
    consents,
    reportsMade: reports,
    blocked: blocks,
    passkeys,
  }, 200, {
    "content-disposition": `attachment; filename="lanyard-data.json"`,
    "cache-control": "no-store",
  });
});

// Full erasure: profile, cards, connections (both sides), notes, messages
// cascade via FK. Images in R2 and sole-owner organisations are removed too.
app.delete("/api/account", async (c) => {
  const u = requireUser(c);
  await eraseUser(c.env, u.id);
  endSession(c, c.env.DB);
  return c.json({ ok: true });
});

/* --------------------------------- cards --------------------------------- */

app.post("/api/cards", async (c) => {
  const u = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;

  // Plan limit: Free keeps a few cards, Plus a lot more.
  const plan = planOf(await one(db, "SELECT plan, plan_until FROM users WHERE id = ?", u.id));
  const have = (await one(db, "SELECT COUNT(*) AS n FROM cards WHERE user_id = ?", u.id))?.n || 0;
  if (have >= plan.cards) {
    return c.json({
      error: plan.tier === "plus"
        ? `You've reached the ${plan.cards}-card limit.`
        : `Free accounts can have ${plan.cards} cards. Lanyard Plus raises that to ${USER_PLANS.plus.cards}.`,
      code: "plan_limit",
    }, 402);
  }

  const id = newId();
  const cc = await newCardCode(db);
  await db.batch([
    db.prepare(
      `INSERT INTO cards (id, user_id, code, code_rotates_at, name, note, visible_links, tags, theme, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, u.id, cc.code, cc.rotatesAt,
      String(body.name || "Card").slice(0, 60),
      String(body.note || "").slice(0, 300),
      JSON.stringify(Array.isArray(body.visibleLinks) ? body.visibleLinks.slice(0, 20) : []),
      JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 30) : []),
      ["default", "formal", "night", "host"].includes(body.theme) ? body.theme : "default",
      now()
    ),
    cc.registerStmt(id),
  ]);
  return c.json({ ok: true, id, code: cc.code }, 201);
});

app.put("/api/cards/:id", async (c) => {
  const u = requireUser(c);
  const card = await one(c.env.DB, "SELECT * FROM cards WHERE id = ? AND user_id = ?", c.req.param("id"), u.id);
  if (!card) return c.json({ error: "not found" }, 404);
  const b = await c.req.json().catch(() => ({}));
  const fields = {};
  for (const k of ["name", "note", "theme"]) {
    if (b[k] !== undefined) fields[k] = String(b[k]).slice(0, k === "note" ? 300 : 60);
  }
  // Custom strap colour is a Plus personalisation. "" / null clears it.
  const strap = b.strap_color ?? b.strapColor;
  if (strap !== undefined) {
    if (strap === "" || strap === null) fields.strap_color = null;
    else if (!/^#[0-9a-fA-F]{6}$/.test(String(strap))) return c.json({ error: "colour must look like #D9502B" }, 400);
    else {
      const plan = planOf(await one(c.env.DB, "SELECT plan, plan_until FROM users WHERE id = ?", u.id));
      if (!plan.customStrap) return c.json({ error: "Custom colours are part of Lanyard Plus.", code: "plan_limit" }, 402);
      fields.strap_color = String(strap);
    }
  }
  if (Array.isArray(b.visibleLinks)) fields.visible_links = JSON.stringify(b.visibleLinks.slice(0, 20));
  if (Array.isArray(b.tags)) fields.tags = JSON.stringify(b.tags.slice(0, 30));
  const sets = Object.keys(fields);
  if (sets.length) {
    await run(c.env.DB, `UPDATE cards SET ${sets.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
      ...Object.values(fields), card.id);
  }
  return c.json({ ok: true });
});

app.delete("/api/cards/:id", async (c) => {
  const u = requireUser(c);
  const card = await one(c.env.DB, "SELECT * FROM cards WHERE id = ? AND user_id = ?", c.req.param("id"), u.id);
  if (!card) return c.json({ error: "not found" }, 404);
  if (card.is_default) return c.json({ error: "can't delete your default card" }, 400);
  await run(c.env.DB, "DELETE FROM cards WHERE id = ?", card.id);
  return c.json({ ok: true });
});

// Public card page data. Also tells the viewer where they stand: is this
// their own card, have they already connected (and is there a shared selfie
// to show), and — if the URL carries a valid per-person note token (?n=) —
// the note waiting for them. Peeking does NOT redeem the note; that happens
// once, inside POST /api/connect.
app.get("/api/c/:cardId", async (c) => {
  const db = c.env.DB;
  const me = c.get("user");
  const card = await one(db, "SELECT * FROM cards WHERE id = ?", c.req.param("cardId"));
  if (!card) return c.json({ error: "not found" }, 404);
  const isOwner = card.user_id === me.id;
  let view = await cardView(db, card, { forOwner: isOwner });
  // A private profile is still reachable by someone who is checked in to the
  // same event, where its owner opted into the attendee directory — but only
  // the identity the room already shows (no links, about or projects).
  if (!view && !isOwner && (await sharesDirectory(db, me.id, card.user_id))) {
    view = await cardView(db, card, { limited: true });
  }
  // Someone you've already connected with stays viewable even if they later
  // made their profile private (identity and "come to me for" only).
  if (!view && !isOwner && (await findConnection(db, me.id, card.user_id))) {
    view = await cardView(db, card, { limited: true });
  }
  if (!view) return c.json({ error: "not found" }, 404);

  let connection = null;
  if (!isOwner) {
    const cn = await findConnection(db, me.id, card.user_id);
    if (cn) {
      const mine = await one(db, "SELECT text FROM notes WHERE user_id = ? AND connection_id = ?", me.id, cn.id);
      const msgs = await all(db,
        "SELECT id, from_id, text, created_at FROM messages WHERE connection_id = ? ORDER BY created_at", cn.id);
      const cev = cn.event_id ? await one(db, "SELECT id, name FROM events WHERE id = ?", cn.event_id) : null;
      connection = {
        id: cn.id,
        metAt: cn.created_at,
        selfie: cn.selfie_key ? `/media/${cn.selfie_key}` : null,
        note: mine?.text || "",
        messages: msgs.map((m) => ({ id: m.id, mine: m.from_id === me.id, text: m.text, at: m.created_at })),
        event: cev ? { id: cev.id, name: cev.name } : null,
      };
    }
  }

  let incomingNote = null;
  const token = c.req.query("n");
  if (token && !isOwner) {
    const n = await peekNote(db, card.id, token);
    if (n) incomingNote = { text: n.text };
  }

  // The event this connection would be filed under, if both of you checked in.
  let event = null;
  if (!isOwner) {
    const hint = /^[0-9a-f]{10}$/.test(c.req.query("event") || "") ? c.req.query("event") : null;
    const evId = await eventForConnection(db, me.id, card.user_id, hint);
    if (evId) {
      const ev = await one(db, "SELECT id, name FROM events WHERE id = ?", evId);
      if (ev) event = { id: ev.id, name: ev.name };
    }
  }

  return c.json({ ...view, viewer: { isOwner, connection, event }, incomingNote });
});

/* ------------------------------ event helpers ----------------------------- */

// Both people checked in to an event whose attendee directory the owner joined.
async function sharesDirectory(db, viewerId, ownerId) {
  const row = await one(
    db,
    `SELECT 1 AS ok FROM checkins v
       JOIN checkins o ON o.event_id = v.event_id
       JOIN events e ON e.id = v.event_id AND e.directory_on = 1
       JOIN consents cs ON cs.user_id = o.user_id AND cs.scope = 'event_directory:' || o.event_id AND cs.granted = 1
     WHERE v.user_id = ? AND o.user_id = ? LIMIT 1`,
    viewerId, ownerId
  );
  return !!row;
}

// Which event (if any) does a connection between these two belong to? Only an
// event BOTH of them checked in to counts, so a client can't file connections
// under someone else's event. With no hint, it's the most recent shared event
// you checked in to within the last 18 hours — i.e. "the thing happening now".
async function eventForConnection(db, meId, peerId, hinted) {
  const rows = await all(
    db,
    `SELECT a.event_id, a.created_at FROM checkins a
       JOIN checkins b ON b.event_id = a.event_id
     WHERE a.user_id = ? AND b.user_id = ? ORDER BY a.created_at DESC LIMIT 10`,
    meId, peerId
  );
  if (hinted && rows.some((r) => r.event_id === hinted)) return hinted;
  const recent = rows.find((r) => r.created_at > now() - 18 * 60 * 60 * 1000);
  return recent ? recent.event_id : null;
}

/* ----------------------- per-person notes (QR tokens) ---------------------- */

const NOTE_TTL_MS = 24 * 60 * 60 * 1000;
const NOTE_MAX = 200;
const NOTE_TOKEN_RE = /^[0-9a-f]{16}$/;

// Valid = right card, unredeemed, not expired. Does not consume.
async function peekNote(db, cardId, token) {
  if (!NOTE_TOKEN_RE.test(String(token || ""))) return null;
  const row = await one(db, "SELECT * FROM card_notes WHERE id = ? AND card_id = ?", token, cardId);
  if (!row || row.redeemed_at || row.created_at < now() - NOTE_TTL_MS) return null;
  return row;
}

// Single use. The UPDATE ... WHERE redeemed_at IS NULL is the atomic claim,
// so two people scanning the same screen at once can't both receive it.
async function redeemNote(db, cardId, token, userId) {
  const row = await peekNote(db, cardId, token);
  if (!row) return null;
  const res = await run(
    db,
    "UPDATE card_notes SET redeemed_by = ?, redeemed_at = ? WHERE id = ? AND redeemed_at IS NULL",
    userId, now(), row.id
  );
  return res?.meta?.changes ? row : null;
}

async function ownCard(c) {
  const u = requireUser(c);
  return one(c.env.DB, "SELECT * FROM cards WHERE id = ? AND user_id = ?", c.req.param("id"), u.id);
}

// Attach a note to this card's QR for the next person. Replaces any note
// that hasn't been picked up yet.
app.post("/api/cards/:id/personal-note", async (c) => {
  const card = await ownCard(c);
  if (!card) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text || "").trim().slice(0, NOTE_MAX);
  if (!text) return c.json({ error: "write a note first" }, 400);
  const token = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM card_notes WHERE card_id = ? AND redeemed_at IS NULL").bind(card.id),
    c.env.DB.prepare("INSERT INTO card_notes (id, card_id, text, created_at) VALUES (?, ?, ?, ?)")
      .bind(token, card.id, text, now()),
  ]);
  return c.json({ ok: true, token, text });
});

// What's waiting on the QR, and who last picked one up.
app.get("/api/cards/:id/personal-note", async (c) => {
  const card = await ownCard(c);
  if (!card) return c.json({ error: "not found" }, 404);
  const db = c.env.DB;
  const active = await one(
    db,
    "SELECT id, text FROM card_notes WHERE card_id = ? AND redeemed_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1",
    card.id, now() - NOTE_TTL_MS
  );
  const last = await one(
    db,
    `SELECT n.text, n.redeemed_at, p.name AS by_name FROM card_notes n
     LEFT JOIN profiles p ON p.user_id = n.redeemed_by
     WHERE n.card_id = ? AND n.redeemed_at IS NOT NULL ORDER BY n.redeemed_at DESC LIMIT 1`,
    card.id
  );
  return c.json({
    active: active ? { token: active.id, text: active.text } : null,
    last: last ? { text: last.text, at: last.redeemed_at, by: last.by_name || null } : null,
  });
});

app.delete("/api/cards/:id/personal-note", async (c) => {
  const card = await ownCard(c);
  if (!card) return c.json({ error: "not found" }, 404);
  await run(c.env.DB, "DELETE FROM card_notes WHERE card_id = ? AND redeemed_at IS NULL", card.id);
  return c.json({ ok: true });
});

// Typed or scanned short code -> card or event. Wrong guesses are counted
// (per IP and per session); too many in a few minutes locks lookups.
app.get("/api/code/:code", async (c) => {
  const db = c.env.DB;
  const keys = throttleKeys(c);
  if (await isThrottled(db, keys)) {
    return c.json({ error: "Too many wrong codes. Wait a few minutes and try again.", code: "throttled" }, 429);
  }
  const code = normaliseCode(c.req.param("code"));
  if (code.length >= 4 && code.length <= 12) {
    const card = await findCardByCode(db, code);
    if (card) return c.json({ kind: "card", cardId: card.id });
    // Event join codes live in the same short-code space (5 characters).
    const event = await one(db, "SELECT id FROM events WHERE code = ?", code);
    if (event) return c.json({ kind: "event", eventCode: code });
  }
  await recordMiss(db, keys);
  return c.json({
    error: "That code isn't valid. Card codes change every few days, so ask them for their current one.",
    code: "bad_code",
  }, 404);
});

// "New code now": the owner replaces the code immediately (old one dies too).
app.post("/api/cards/:id/rotate-code", async (c) => {
  const card = await ownCard(c);
  if (!card) return c.json({ error: "not found" }, 404);
  const r = await rotateCardCode(c.env.DB, card, { immediate: true });
  return c.json({ ok: true, code: r.code, codeRotatesAt: r.rotatesAt });
});

// Interest in Plus (pricing validation until payments exist).
app.post("/api/plan/waitlist", async (c) => {
  const u = requireUser(c);
  await run(c.env.DB, "INSERT OR IGNORE INTO plus_waitlist (user_id, created_at) VALUES (?, ?)", u.id, now());
  return c.json({ ok: true });
});

/* ------------------------------ connections ------------------------------ */

async function findConnection(db, a, b) {
  return one(db, "SELECT * FROM connections WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)",
    a, b, b, a);
}

// Every profile needs a default card so it always has a /c/<id> page. Guests
// who connect get a stub profile without one; create it on demand.
async function ensureDefaultCard(db, userId) {
  const have = await one(db, "SELECT id FROM cards WHERE user_id = ? AND is_default = 1", userId);
  if (have) return have.id;
  const any = await one(db, "SELECT id FROM cards WHERE user_id = ? ORDER BY created_at LIMIT 1", userId);
  if (any) return any.id;
  const cardId = newId();
  const cc = await newCardCode(db);
  await db.batch([
    db.prepare(
      `INSERT INTO cards (id, user_id, code, code_rotates_at, name, note, visible_links, tags, theme, is_default, created_at)
       VALUES (?, ?, ?, ?, 'General', '', '[]', '[]', 'default', 1, ?)`
    ).bind(cardId, userId, cc.code, cc.rotatesAt, now()),
    cc.registerStmt(cardId),
  ]);
  return cardId;
}

app.post("/api/connect", async (c) => {
  const me = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  const card = await one(db, "SELECT * FROM cards WHERE id = ?", body.cardId);
  if (!card) return c.json({ error: "card not found" }, 404);
  const peerId = card.user_id;
  if (peerId === me.id) return c.json({ error: "that's your own card" }, 400);

  // Guests must at least have a name. If they have no profile, make a stub one
  // they can finish at home (the /claim flow).
  let myProfile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", me.id);
  if (!myProfile) {
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "name required" }, 400);
    await run(
      db,
      `INSERT INTO profiles (user_id, name, uni, course, headline, about, links, tags, projects, is_public, updated_at)
       VALUES (?, ?, '', '', '', '', '{}', '[]', '[]', 0, ?)`,
      me.id, name.slice(0, 80), now()
    );
    myProfile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", me.id);
  }
  await ensureDefaultCard(db, me.id);

  // Agreement happens here for people who haven't given it yet (e.g. guests
  // connecting for the first time): 18+, Terms and Privacy Policy.
  if (!(await hasConsent(db, me.id, termsScope()))) {
    if (body.acceptTerms !== true || body.over18 !== true) {
      return c.json({ error: "Please confirm you're 18 or over and agree to the Terms and Privacy Policy.", code: "terms_required" }, 400);
    }
    await recordConsent(db, me.id, termsScope());
    await run(db, "UPDATE users SET over_18 = 1 WHERE id = ?", me.id);
  }

  const existing = await findConnection(db, me.id, peerId);
  let connId = existing?.id;
  let selfieKey = existing?.selfie_key || null;

  // Shared selfie: consent is an explicit tick from the person capturing.
  // We record consent for the capturer; the other person consents via the
  // "accept/remove" affordance on their People screen (consent_b defaults 0
  // until they first view/keep it; deleting at any time removes it for both).
  if (body.selfieDataUrl) {
    if (!body.consent) return c.json({ error: "consent required for selfie" }, 400);
    selfieKey = await putImage(c.env, body.selfieDataUrl, "selfie");
  }

  const ts = now();
  // File the connection under an event only if you BOTH checked in to it.
  const eventId = await eventForConnection(
    db, me.id, peerId, typeof body.eventId === "string" ? body.eventId : null
  );
  if (!existing) {
    connId = newId();
    await run(
      db,
      `INSERT INTO connections (id, user_a, user_b, event_id, selfie_key, consent_a, consent_b, card_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      connId, me.id, peerId, eventId, selfieKey, body.consent ? 1 : 0, card.id, ts
    );
    await run(db,
      `INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES (?, ?, 'selfie', 1, ?)
       ON CONFLICT(user_id, scope) DO UPDATE SET granted = 1, created_at = ?`,
      newId(), me.id, ts, ts);
  } else if (selfieKey) {
    await run(db, "UPDATE connections SET selfie_key = ?, consent_a = 1 WHERE id = ?", selfieKey, connId);
  }
  if (eventId && !existing?.event_id) {
    await run(db, "UPDATE connections SET event_id = ? WHERE id = ?", eventId, connId);
  }

  if (body.note) {
    await run(
      db,
      `INSERT INTO notes (user_id, connection_id, text, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, connection_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      me.id, connId, String(body.note).slice(0, 600), ts
    );
  }

  // The owner's per-person note: validated against THIS card, redeemed once,
  // and kept on the scanner's side as a message from the owner.
  let receivedNote = null;
  if (body.noteToken) {
    const n = await redeemNote(db, card.id, String(body.noteToken), me.id);
    if (n) {
      await run(db,
        "INSERT INTO messages (id, connection_id, from_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
        newId(), connId, peerId, n.text, ts);
      receivedNote = n.text;
    }
  }

  // The scanner's note back, visible to the card owner.
  const reply = String(body.message || "").trim().slice(0, 300);
  if (reply) {
    await run(db,
      "INSERT INTO messages (id, connection_id, from_id, text, created_at) VALUES (?, ?, ?, ?, ?)",
      newId(), connId, me.id, reply, ts + 1);
  }

  const ev = eventId ? await one(db, "SELECT id, name FROM events WHERE id = ?", eventId) : null;
  return c.json({ ok: true, connectionId: connId, receivedNote, event: ev ? { id: ev.id, name: ev.name } : null });
});

app.get("/api/connections", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const rows = await all(
    db,
    `SELECT cn.id AS connection_id, cn.selfie_key, cn.event_id, cn.created_at,
            CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END AS peer_id,
            p.name AS peer_name, p.photo_key AS peer_photo_key, p.course, p.uni, p.headline,
            cd.name AS card_name,
            COALESCE((SELECT c2.id FROM cards c2 WHERE c2.id = cn.card_id
                      AND c2.user_id = CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END), cd.id) AS card_id,
            n.text AS my_note, ev.name AS event_name
     FROM connections cn
     JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END
     LEFT JOIN notes n ON n.connection_id = cn.id AND n.user_id = ?
     LEFT JOIN cards cd ON cd.user_id = p.user_id AND cd.is_default = 1
     LEFT JOIN events ev ON ev.id = cn.event_id
     WHERE cn.user_a = ? OR cn.user_b = ?
     ORDER BY cn.created_at DESC`,
    me.id, me.id, me.id, me.id, me.id, me.id
  );
  for (const r of rows) if (!r.card_id) r.card_id = await ensureDefaultCard(db, r.peer_id);
  // Same card-scoped view as GET /api/connections/:id, so search only ever
  // sees what the person's card shares with this viewer.
  const views = await Promise.all(rows.map(async (r) => {
    const card = r.card_id ? await one(db, "SELECT * FROM cards WHERE id = ?", r.card_id) : null;
    return card ? cardView(db, card, { forOwner: true }) : null;
  }));
  return c.json({
    connections: rows.map((r, i) => {
      const v = views[i];
      return {
        id: r.connection_id,
        peer: {
          id: r.peer_id, name: r.peer_name,
          photo: r.peer_photo_key ? `/media/${r.peer_photo_key}` : null,
          course: r.course, uni: r.uni, headline: r.headline,
          year: v?.profile.year || "", about: v?.profile.about || "",
          tags: v?.profile.tags || [], links: v?.profile.links || {},
          projects: (v?.profile.projects || []).map((pr) => ({ title: pr.title || "", line: pr.line || "" })),
          cardName: v?.name || "", cardNote: v?.note || "",
        },
        selfie: r.selfie_key ? `/media/${r.selfie_key}` : null,
        cardId: r.card_id || null,
        eventId: r.event_id, eventName: r.event_name || "",
        metAt: r.created_at, note: r.my_note || "",
      };
    }),
  });
});

app.get("/api/connections/:id", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const cn = await one(db, "SELECT * FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)",
    c.req.param("id"), me.id, me.id);
  if (!cn) return c.json({ error: "not found" }, 404);
  const peerId = cn.user_a === me.id ? cn.user_b : cn.user_a;
  const p = await one(db, "SELECT * FROM profiles WHERE user_id = ?", peerId);
  const note = await one(db, "SELECT text FROM notes WHERE user_id = ? AND connection_id = ?", me.id, cn.id);
  const msgs = await all(db,
    "SELECT id, from_id, text, created_at FROM messages WHERE connection_id = ? ORDER BY created_at", cn.id);

  // Show only what the scanned card permits (its chosen links / tags), not
  // the whole profile. card_id is the card the SCANNER opened, so it only
  // describes the peer when the peer is the card's owner; otherwise (and for
  // older connections with no card_id) use the peer's default card.
  let card = null;
  if (cn.card_id) card = await one(db, "SELECT * FROM cards WHERE id = ? AND user_id = ?", cn.card_id, peerId);
  if (!card) card = await one(db, "SELECT * FROM cards WHERE user_id = ? AND is_default = 1", peerId);
  if (!card) card = await one(db, "SELECT * FROM cards WHERE id = ?", await ensureDefaultCard(db, peerId));
  const view = card ? await cardView(db, card, { forOwner: true }) : null;

  return c.json({
    id: cn.id,
    cardId: card?.id || null,
    peer: {
      id: peerId,
      name: p.name,
      photo: p.photo_key ? `/media/${p.photo_key}` : null,
      uni: p.uni, course: p.course, year: p.year,
      headline: p.headline, about: p.about,
      links: view?.profile.links || {},
      tags: view?.profile.tags || p.tags || [],
      projects: view?.profile.projects || [],
      cardName: card?.name || null,
      cardNote: card?.note || "",
    },
    selfie: cn.selfie_key ? `/media/${cn.selfie_key}` : null,
    eventId: cn.event_id, metAt: cn.created_at, note: note?.text || "",
    messages: msgs.map((m) => ({ id: m.id, mine: m.from_id === me.id, text: m.text, at: m.created_at })),
  });
});

app.put("/api/connections/:id/note", async (c) => {
  const me = requireUser(c);
  const { text } = await c.req.json();
  const cn = await one(c.env.DB, "SELECT id FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)",
    c.req.param("id"), me.id, me.id);
  if (!cn) return c.json({ error: "not found" }, 404);
  await run(c.env.DB,
    `INSERT INTO notes (user_id, connection_id, text, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, connection_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    me.id, cn.id, String(text || "").slice(0, 600), now());
  return c.json({ ok: true });
});

// Either side removes: deletes connection rows + selfie for both (GDPR right).
app.delete("/api/connections/:id", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const cn = await one(db, "SELECT * FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)",
    c.req.param("id"), me.id, me.id);
  if (!cn) return c.json({ error: "not found" }, 404);
  if (cn.selfie_key) await deleteImage(c.env, cn.selfie_key);
  await run(db, "DELETE FROM connections WHERE id = ?", cn.id); // cascades notes/messages
  return c.json({ ok: true });
});

/* -------------------------------- media ---------------------------------- */

app.get("/media/:key{.+}", async (c) => {
  // Keys are prefix/hex.ext — block traversal.
  const key = c.req.param("key");
  if (!/^(avatar|selfie|project|event)\/[a-z0-9]+\.(webp|jpg|jpeg|png)$/.test(key)) {
    return c.json({ error: "bad key" }, 400);
  }
  const res = await getImage(c.env, key);
  return res || c.json({ error: "not found" }, 404);
});

/* -------------------------------- health --------------------------------- */
app.get("/api/health", (c) => c.json({ ok: true, t: now() }));

/* --------------------------- report / block ------------------------------ */

// Report the other person in a connection to us, and optionally block them
// (blocking removes the connection, notes and shared selfie for both sides).
app.post("/api/connections/:id/report", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const cn = await one(db, "SELECT * FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)", c.req.param("id"), u.id, u.id);
  if (!cn) return c.json({ error: "not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const target = cn.user_a === u.id ? cn.user_b : cn.user_a;
  const reason = String(body.reason || "").slice(0, 500);
  if (!body.block && !reason.trim()) return c.json({ error: "Tell us what happened" }, 400);
  if (reason.trim()) {
    await run(db, "INSERT INTO reports (id, reporter_id, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
      newId(), u.id, target, reason, now());
  }
  if (body.block) {
    await run(db, "INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", u.id, target, now());
    if (cn.selfie_key) await deleteImage(c.env, cn.selfie_key).catch(() => {});
    await run(db, "DELETE FROM connections WHERE id = ?", cn.id);
  }
  return c.json({ ok: true, blocked: !!body.block });
});

/* ------------------------------- Events ---------------------------------- */
app.route("/", eventsApp);
app.route("/", hostApp);

/* ------------------------------- SPA fallback ----------------------------- */
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Daily retention clean-up (see [triggers] in wrangler.toml).
  scheduled: (_event, env, ctx) => { ctx.waitUntil(purgeExpired(env)); },
};
