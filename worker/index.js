import { Hono } from "hono";
import { newId, now, one, all, run, uniqueCode } from "./db.js";
import { sessionMiddleware, ensureSession, endSession, requireUser, HttpError } from "./session.js";
import { securityHeaders, sameOriginWrites } from "./security.js";
import { isHostSite, hostOrigin } from "./host-auth.js";
import { isBlocked } from "./blocks.js";
import { bump, HOUR, DAY } from "./ratelimit.js";
import { feedbackApp, pendingFeedback } from "./feedback.js";
import { integrationsApp } from "./integrations.js";
import * as Passkeys from "./passkeys.js";
import * as Auth from "./auth.js";
import * as Totp from "./totp.js";
import * as EmailAuth from "./email-auth.js";
import { probeBlocker } from "./probes.js";
import { TERMS_VERSION, termsScope, hasConsent, recordConsent, recordConsentStmt, logConsentStmt } from "./legal.js";
import { putImage, getImage, deleteImage } from "./media.js";
import { eraseUser, purgeExpired } from "./purge.js";
import { eventsApp } from "./events.js";
import { myEventsApp } from "./myevents.js";
import { hostApp } from "./hosts.js";
import { adminApp } from "./admin.js";
import { promoApp } from "./promo.js";
import { unsubApp } from "./unsub.js";
import { privacyApp } from "./privacy.js";
import * as Alerts from "./alerts.js";
import { sendEventEmails } from "./eventmail.js";
import {
  newCardCode, rotateCardCode, freshenCards, findCardByCode, normaliseCode,
  isThrottled, recordMiss, throttleKeys, checkCustomCode, setCustomCode, CUSTOM_EVERY_MS,
} from "./codes.js";
import { planOf, USER_PLANS, PLUS_PRICE } from "./plans.js";
import { readInstitution } from "./institutions.js";
import { moveTo } from "./onboarding.js";
import { selfieView } from "./selfie.js";
import { sharedGround } from "./inCommon.js";

const app = new Hono();

// Order matters: headers wrap everything; cross-site writes are refused before
// a session (or guest account) is touched; static assets never hit the database.
app.use("*", probeBlocker);
app.use("*", securityHeaders);
// The two sites keep to their own API (F10): the host site serves only
// /api/host/* (checked again, with the host cookie, in hosts.js), and the
// attendee session is never loaded for host routes.
app.use("/api/*", async (c, next) => {
  const hostRoute = c.req.path.startsWith("/api/host/");
  if (isHostSite(c) && !hostRoute && c.req.path !== "/api/health") {
    return c.json({ error: "Not available on the host portal.", code: "wrong_site" }, 401);
  }
  return hostRoute ? next() : sameOriginWrites(c, next);
});
const withSession = sessionMiddleware("DB");
app.use("/api/*", (c, next) => (c.req.path.startsWith("/api/host/") || c.req.path.startsWith("/api/integrations/") || c.req.path.startsWith("/api/admin/") || c.req.path === "/api/unsubscribe" || c.req.path === "/api/privacy-request" ? next() : withSession(c, next)));
app.use("/media/*", async (c, next) => { await ensureSession(c, c.env.DB); await next(); });

app.onError((err, c) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error(err);
  const body = { error: status >= 500 ? "Something went wrong on our side. Try again in a moment." : err.message };
  if (err?.code) body.code = err.code;
  return c.json(body, status);
});

/* ----------------------------- shape helpers ----------------------------- */

const TEXT_FIELDS = ["name", "uni", "course", "year", "headline", "about"];
// A custom institution (typed in) is capped at 120 characters (F12).
const UNI_MAX = 120;
// Student and Career mode (F11). `mode` is a whitelist; company and role are short.
const MODES = ["student", "career"];
const SHORT_FIELDS = ["company", "role"];
const validMode = (input) => input.mode === undefined || MODES.includes(input.mode);

// Only short strings get into JSON list columns.
const strings = (arr, max, len) =>
  (Array.isArray(arr) ? arr : []).filter((x) => typeof x === "string" && x.trim()).slice(0, max).map((x) => x.trim().slice(0, len));

function profilePayload(input) {
  const out = {};
  for (const k of TEXT_FIELDS) if (typeof input[k] === "string") out[k] = input[k].trim().slice(0, 400);
  for (const k of SHORT_FIELDS) if (typeof input[k] === "string") out[k] = input[k].trim().slice(0, 80);
  if (typeof out.uni === "string") out.uni = out.uni.slice(0, UNI_MAX);
  if (MODES.includes(input.mode)) out.mode = input.mode;
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
        input[jsonField].slice(0, jsonField === "projects" ? 3 : 30)
          .map((x) => (jsonField === "projects" && x && typeof x === "object"
            ? { title: String(x.title || "").slice(0, 80), line: String(x.line || "").slice(0, 160),
                url: /^https?:\/\//.test(String(x.url || "")) ? String(x.url).slice(0, 300) : "" }
            : String(x).slice(0, 60)))
      );
    }
  }
  // The app sends camelCase (showAge); accept both spellings.
  const showAge = input.showAge ?? input.show_age;
  if (typeof showAge === "boolean") out.show_age = showAge ? 1 : 0;
  return out;
}

// Institution picker (F12). A listed institution sets institution_id and makes
// `uni` its official name. Anything else (custom text, or an old client that only
// sends `uni`) leaves institution_id empty when the text no longer matches.
function applyInstitution(fields, pick, current) {
  if (pick.present) {
    fields.institution_id = pick.inst ? pick.inst.id : null;
    if (pick.inst) fields.uni = pick.inst.name;
  } else if (current && typeof fields.uni === "string" && fields.uni !== current.uni) {
    fields.institution_id = null;
  }
}

async function loadFullUser(db, userId) {
  const user = await one(db, "SELECT * FROM users WHERE id = ?", userId);
  if (!user) return null;
  const profile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", userId);
  const cards = await all(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at", userId);
  await freshenCards(db, cards); // every card has a permanent code
  return { user, profile, cards };
}

// Public view of a card = card overlays + underlying profile.
// `forOwner: true` is the card's own user looking at their own card list —
// it must not vanish just because they've switched "Profile is public" off
// (it used to: this returned null for every one of their own cards the
// moment is_public went false, which broke My Card / Cards entirely), and
// it needs the raw link/tag picks, not just the resolved values, so an
// edit screen can show which links are currently selected for this card.
// `shared: true` = the viewer is who this card was shared with (see
// sharedCardId): they see everything the card shares, even on a private profile.
async function cardView(db, card, { forOwner = false, limited = false, shared = false, profile } = {}) {
  const p = profile !== undefined ? profile : await one(db, "SELECT * FROM profiles WHERE user_id = ?", card.user_id);
  if (!p) return null;
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
      codeCustom: !!card.code_custom,
      // When a Plus member can next choose a code (null = now).
      codeNextChangeAt: card.code_changed_at && card.code_changed_at + CUSTOM_EVERY_MS > Date.now()
        ? card.code_changed_at + CUSTOM_EVERY_MS : null,
      visibleLinks: card.visible_links || [],
      tagsOverride: card.tags || [],
      headlineOverride: card.headline || "",
      aboutOverride: card.about || "",
    } : {}),
    profile: {
      userId: p.user_id,
      name: p.name,
      photo: p.photo_key ? `/media/${p.photo_key}` : null,
      uni: p.uni, course: p.course, year: p.year,
      mode: p.mode || "student", company: p.company || "", role: p.role || "",
      headline: card.headline || p.headline,
      about: limited ? "" : (card.about || p.about),
      links: limited ? {} : links, tags,
      projects: limited ? [] : (p.projects || []).map((pr) => ({ ...pr, image: pr.image_key ? `/media/${pr.image_key}` : null })),
    },
  };
}

/* --------------------------------- me ------------------------------------ */

app.get("/api/me", async (c) => {
  const u = c.get("user");
  if (!u) {
    // No session yet: a first-time visitor. Nothing is created until they act.
    return c.json({
      user: null, profile: null, cards: [],
      plan: { tier: "free", label: USER_PLANS.free.label || "Free", cards: USER_PLANS.free.cards, customStrap: false,
              onWaitlist: false, plusPrice: PLUS_PRICE, freeCards: USER_PLANS.free.cards },
    });
  }
  const db = c.env.DB;
  const [data, waitlisted, termsAccepted] = await Promise.all([
    loadFullUser(db, u.id),
    one(db, "SELECT 1 AS x FROM plus_waitlist WHERE user_id = ?", u.id),
    hasConsent(db, u.id, termsScope()),
  ]);
  const profile = data.profile
    ? { ...data.profile, photo: data.profile.photo_key ? `/media/${data.profile.photo_key}` : null }
    : null;
  const plan = planOf(data.user);
  return c.json({
    user: {
      id: u.id, isGuest: u.is_guest, hasPasskey: !!u.has_passkey,
      hasRecovery: !!u.has_recovery, hasTotp: !!u.has_totp, claimed: !!(u.has_passkey || u.has_recovery || u.has_totp || u.email_verified),
      termsVersion: TERMS_VERSION, termsAccepted,
      // Anyone with a profile must have accepted the current Terms and Privacy Policy.
      needsTerms: !!profile && !termsAccepted,
      recoveryEmail: u.recovery_email || null, emailVerified: !!u.email_verified, marketingOptin: !!u.marketing_optin, eventEmails: u.notify_events !== 0,
      verifiedStudent: !!u.verified_student, over18: !!u.over_18,
      emailDomain: u.email_domain || null,
      appInstalled: !!data.user?.app_installed_at,
    },
    plan: {
      tier: plan.tier, label: plan.label, cards: plan.cards, customStrap: plan.customStrap,
      onWaitlist: !!waitlisted, plusPrice: PLUS_PRICE, freeCards: USER_PLANS.free.cards,
    },
    profile,
    // The profile is already loaded: pass it in rather than re-reading it per card.
    cards: await Promise.all(data.cards.map((card) =>
      cardView(db, card, { forOwner: true, profile: data.profile }).catch(() => null))),
  });
});

// Guest completes their profile the first time. Creates profile + default card.
app.post("/api/profile", async (c) => {
  const u = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  if (!body.name || !body.name.trim()) return c.json({ error: "name required" }, 400);
  if (!validMode(body)) return c.json({ error: "mode must be student or career" }, 400);
  const pick = readInstitution(body);
  if (pick.error) return c.json({ error: pick.error }, 400);

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
  applyInstitution(fields, pick, null);
  const ts = now();
  if (photoKey) fields.photo_key = photoKey;
  await db.batch([
    db.prepare(
      `INSERT INTO profiles (user_id, name, photo_key, uni, institution_id, course, year, mode, company, role, headline, about, links, tags, projects, is_public, updated_at, onboarding_step)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      u.id, fields.name || body.name.trim(), photoKey,
      fields.uni || "", fields.institution_id || null, fields.course || "", fields.year || "",
      fields.mode || "student", fields.company || "", fields.role || "",
      fields.headline || "", fields.about || "",
      fields.links || "{}", fields.tags || "[]", fields.projects || "[]", ts,
      body.onboarding === true ? 1 : null // the welcome steps (F14) start here; other clients are not put in them
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
  // Step 1 (name, photo and the Terms tick) was this request: the next step is 2.
  if (body.onboarding === true) await moveTo(db, u.id, 2);

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

// Where the person is in the welcome steps (F14). { step: 1 to 6 } moves them;
// { done: true } finishes. For anyone not in the steps it changes nothing.
app.put("/api/onboarding", async (c) => {
  const u = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  if ((await bump(c.env.DB, `onb:${u.id}`, HOUR)) > 200) return c.json({ error: "Too many steps in an hour. Try again soon.", code: "throttled" }, 429);
  if (body.done !== true && !(Number.isInteger(body.step) && body.step >= 1 && body.step <= 6)) {
    return c.json({ error: "step must be a whole number from 1 to 6, or done: true" }, 400);
  }
  if (!(await one(c.env.DB, "SELECT 1 AS x FROM profiles WHERE user_id = ?", u.id))) return c.json({ error: "create profile first" }, 404);
  const place = await moveTo(c.env.DB, u.id, body.done === true ? null : body.step);
  return c.json({ ok: true, step: place ? place.step : null, inOnboarding: !!place });
});

app.put("/api/profile", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const current = await one(db, "SELECT * FROM profiles WHERE user_id = ?", u.id);
  if (!current) return c.json({ error: "create profile first" }, 404);
  const body = await c.req.json().catch(() => ({}));
  if (!validMode(body)) return c.json({ error: "mode must be student or career" }, 400);
  const pick = readInstitution(body);
  if (pick.error) return c.json({ error: pick.error }, 400);

  let photoKey = current.photo_key;
  if (body.photoDataUrl) {
    photoKey = await putImage(c.env, body.photoDataUrl, "avatar");
    // The old photo is not kept once it's replaced.
    if (current.photo_key) await deleteImage(c.env, current.photo_key).catch(() => {});
  } else if (body.removePhoto === true) {
    await deleteImage(c.env, current.photo_key);
    photoKey = null;
  }
  const fields = profilePayload(body);
  applyInstitution(fields, pick, current);
  const sets = Object.keys(fields);
  const vals = Object.values(fields);
  if (sets.length || photoKey !== current.photo_key) {
    const sql = `UPDATE profiles SET ${[...sets, "photo_key", "updated_at"].map((k) => `${k} = ?`).join(", ")} WHERE user_id = ?`;
    await run(db, sql, ...vals, photoKey, now(), u.id);
  }
  return c.json({ ok: true });
});

/* ------------------------------- recovery -------------------------------- */

// Adding an email takes two steps: we send a code, and the address is only
// saved once the code comes back (so nobody can claim someone else's address).
app.post("/api/account/email", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return EmailAuth.addStart(c, c.env.DB, body.email);
});
app.post("/api/account/email/confirm", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return EmailAuth.addConfirm(c, c.env.DB, body.email, body.code, body.marketing === true);
});
app.post("/api/account/marketing", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return EmailAuth.setMarketing(c, c.env.DB, body.optin === true);
});
app.post("/api/auth/email/start", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return EmailAuth.start(c, c.env.DB, body.email);
});
app.post("/api/auth/email/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return EmailAuth.verify(c, c.env.DB, body.email, body.code);
});

/* ------------------------------- passkeys -------------------------------- */

app.get("/api/passkey/register/options", async (c) => {
  // Saving a passkey is an explicit action, so a first-time visitor gets their
  // account here even though this is a GET.
  if (!c.get("user")) await ensureSession(c, c.env.DB, { create: true });
  return c.json(await Passkeys.registerOptions(c, c.env.DB));
});
app.post("/api/passkey/register/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await Passkeys.registerVerify(c, c.env.DB, body);
  return c.json({ ok: true });
});
app.get("/api/passkey/login/options", async (c) =>
  c.json(await Passkeys.loginOptions(c, c.env.DB)));
app.post("/api/passkey/login/verify", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  await Passkeys.loginVerify(c, c.env.DB, body); // sets the session cookie
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
app.post("/api/auth/totp/setup", (c) => Totp.setup(c, c.env.DB));
app.post("/api/auth/totp/confirm", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return Totp.confirm(c, c.env.DB, body.code);
});
app.delete("/api/auth/totp", (c) => Totp.disable(c, c.env.DB));
app.post("/api/auth/totp/redeem", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return Totp.redeem(c, c.env.DB, body.id, body.code);
});
app.get("/api/account/consents", async (c) => {
  const u = requireUser(c);
  const rows = await all(c.env.DB, "SELECT scope, action, at FROM consent_log WHERE user_id = ? ORDER BY at DESC LIMIT 60", u.id);
  return c.json({ history: rows });
});
app.get("/api/auth/sessions", (c) => Alerts.listSessions(c, c.env.DB));
app.post("/api/auth/signout-others", (c) => Alerts.signOutOthers(c, c.env.DB));
app.delete("/api/auth/sessions/:id", (c) => Alerts.signOutDevice(c, c.env.DB, c.req.param("id")));
app.post("/api/account/event-emails", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return Alerts.setEventEmails(c, c.env.DB, body.on === true);
});
app.post("/api/logout", async (c) => {
  await endSession(c, c.env.DB);
  return c.json({ ok: true });
});

/* --------------------------- GDPR: data / delete ------------------------- */

app.get("/api/account/export", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const q = (sql, ...a) => all(db, sql, ...a);
  const [profile, cards, connections, notes, messages, consents, checkins, reports, blocks, passkeys] = await Promise.all([
    one(db, "SELECT * FROM profiles WHERE user_id = ?", u.id),
    q("SELECT * FROM cards WHERE user_id = ?", u.id),
    q("SELECT * FROM connections WHERE user_a = ? OR user_b = ? ORDER BY created_at", u.id, u.id),
    q("SELECT connection_id, text, tags, remind_at, followed_up_at, updated_at FROM notes WHERE user_id = ?", u.id),
    q(`SELECT m.connection_id, m.from_id, m.text, m.photo_key, m.created_at FROM messages m
        JOIN connections c ON c.id = m.connection_id WHERE c.user_a = ? OR c.user_b = ? ORDER BY m.created_at`, u.id, u.id),
    q("SELECT scope, created_at FROM consents WHERE user_id = ?", u.id),
    q("SELECT event_id, answers, sponsor, created_at FROM checkins WHERE user_id = ?", u.id),
    q("SELECT target_id, reason, created_at FROM reports WHERE reporter_id = ?", u.id).catch(() => []),
    q("SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ?", u.id).catch(() => []),
    q("SELECT id, created_at FROM webauthn_credentials WHERE user_id = ?", u.id).catch(() => []),
  ]);
  const feedbackGiven = await q("SELECT event_id FROM feedback_done WHERE user_id = ?", u.id).catch(() => []);
  const promoCodes = await q("SELECT code, position, granted, created_at FROM promo_claims WHERE user_id = ?", u.id).catch(() => []);
  // Host accounts are separate (F10) and have their own export on the host portal.
  // Invoice requests raised from this account before F10 still name it, so they stay here.
  const [consentHistory, billingRequests, privacyRequests] = await Promise.all([
    q("SELECT scope, action, ref, at FROM consent_log WHERE user_id = ? AND (ref IS NULL OR ref != 'host_account') ORDER BY at", u.id).catch(() => []),
    q("SELECT org_name, sku, quantity, amount_pence, contact_email, po_number, note, status, created_at FROM billing_requests WHERE user_id = ?", u.id).catch(() => []),
    q("SELECT id, kind, message, status, created_at, outcome FROM privacy_requests WHERE user_id = ? OR email = ?", u.id, u.recovery_email || "-").catch(() => []),
  ]);
  const media = (k) => (k ? `/media/${k}` : null);
  return c.json({
    exportedAt: now(),
    note: "Image links need you to be signed in to open them. Passkey keys, recovery keys and session tokens are not included for security.",
    consentHistory, billingRequests, privacyRequests,
    user: { id: u.id, isGuest: !!u.is_guest, plan: u.plan || "free", recoveryEmail: u.recovery_email || null,
            emailVerified: !!u.email_verified, newsEmails: !!u.marketing_optin, eventReminders: u.notify_events !== 0,
            authenticatorApp: !!u.has_totp, passkey: !!u.has_passkey, recoveryKeySet: !!u.has_recovery,
            verifiedStudent: !!u.verified_student, createdAt: u.created_at },
    profile: profile && { ...profile, photo: media(profile.photo_key) },
    cards,
    connections: connections.map((x) => ({
      id: x.id, otherUserId: x.user_a === u.id ? x.user_b : x.user_a, cardId: x.card_id,
      eventId: x.event_id, metAt: x.created_at, via: x.via || null, sharedSelfie: selfieView(x, u.id).selfie || selfieView(x, u.id).selfieRequest, sharedSelfieStatus: selfieView(x, u.id).selfieStatus,
    })),
    privateNotes: notes,
    feedbackGivenFor: feedbackGiven.map((r) => r.event_id),
    promoCodes,
    planUntil: u.plan_until || null,
    feedbackNote: "Event feedback answers are stored without your account, so they can't be listed or returned here.",
    messages: messages.map((m) => ({ ...m, photo: media(m.photo_key) })),
    eventCheckins: checkins,
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
  await endSession(c, c.env.DB);
  await eraseUser(c.env, u.id);
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
      `INSERT INTO cards (id, user_id, code, code_rotates_at, name, note, visible_links, tags, headline, about, theme, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, u.id, cc.code, cc.rotatesAt,
      String(body.name || "Card").slice(0, 60),
      String(body.note || "").slice(0, 300),
      JSON.stringify(strings(body.visibleLinks, 20, 40)),
      JSON.stringify(strings(body.tags, 30, 60)),
      String(body.headline || "").trim().slice(0, 80),
      String(body.about || "").trim().slice(0, 600),
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
  if (b.headline !== undefined) fields.headline = String(b.headline).trim().slice(0, 80);
  if (b.about !== undefined) fields.about = String(b.about).trim().slice(0, 600);
  if (Array.isArray(b.visibleLinks)) fields.visible_links = JSON.stringify(strings(b.visibleLinks, 20, 40));
  if (Array.isArray(b.tags)) fields.tags = JSON.stringify(strings(b.tags, 30, 60));
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
  const me = c.get("user"); // null for a first-time visitor
  const card = await one(db, "SELECT * FROM cards WHERE id = ?", c.req.param("cardId"));
  if (!card) return c.json({ error: "not found" }, 404);
  const isOwner = !!me && card.user_id === me.id;
  if (me && !isOwner && (await isBlocked(db, me.id, card.user_id))) return c.json({ error: "not found" }, 404);
  const cn = me && !isOwner ? await findConnection(db, me.id, card.user_id) : null;
  const shared = !!cn && card.id === (await sharedCardId(db, cn, card.user_id));
  const profile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", card.user_id);
  let view = await cardView(db, card, { forOwner: isOwner, shared, profile });
  // A private profile is still reachable by someone who is checked in to the
  // same event, where its owner opted into the attendee directory — but only
  // the identity the room already shows (no links, about or projects).
  if (!view && me && !isOwner && (await sharesDirectory(db, me.id, card.user_id))) {
    view = await cardView(db, card, { limited: true, profile });
  }
  // Their other cards stay viewable to a connection on a private profile, but
  // only as identity and "come to me for".
  if (!view && cn) view = await cardView(db, card, { limited: true, profile });
  if (!view) return c.json({ error: "not found" }, 404);

  const token = c.req.query("n");
  const hint = /^[0-9a-f]{10}$/.test(c.req.query("event") || "") ? c.req.query("event") : null;
  const [connection, incomingNote, event, inCommon] = await Promise.all([
    cn ? connectionDetail(db, cn, me.id) : null,
    token && !isOwner ? peekNote(db, card.id, token).then((n) => (n ? { text: n.text } : null)) : null,
    // The event this connection would be filed under, if both of you checked in.
    me && !isOwner ? eventForConnection(db, me.id, card.user_id, hint)
      .then((id) => (id ? one(db, "SELECT id, name FROM events WHERE id = ?", id) : null)) : null,
    // F16: what you and this person have chosen to show each other has in common. Signed-in viewers only.
    me && !isOwner ? sharedGround(db, { viewerId: me.id, peerId: card.user_id, cn, peerCard: card }) : [],
  ]);

  return c.json({
    ...view,
    viewer: { isOwner, signedIn: !!me, connection, event: event ? { id: event.id, name: event.name } : null },
    incomingNote,
    inCommon,
  });
});

// Your side of a connection: your private note, follow-up and tags, the thread.
async function connectionDetail(db, cn, meId) {
  const [mine, msgs, cev] = await Promise.all([
    one(db, "SELECT text, tags, remind_at, followed_up_at FROM notes WHERE user_id = ? AND connection_id = ?", meId, cn.id),
    all(db, "SELECT id, from_id, text, created_at FROM messages WHERE connection_id = ? ORDER BY created_at", cn.id),
    cn.event_id ? one(db, "SELECT id, name FROM events WHERE id = ?", cn.event_id) : null,
  ]);
  return {
    id: cn.id,
    metAt: cn.created_at,
    via: cn.via || null,
    ...selfieView(cn, meId),
    note: mine?.text || "",
    tags: mine?.tags || [],
    remindAt: mine?.remind_at || null,
    followedUpAt: mine?.followed_up_at || null,
    messages: msgs.map((m) => ({ id: m.id, mine: m.from_id === meId, text: m.text, at: m.created_at })),
    event: cev ? { id: cev.id, name: cev.name } : null,
  };
}

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
    error: "That code isn't valid. Check it with them, or scan their QR instead.",
    code: "bad_code",
  }, 404);
});

// "Replace with a random code": for a code that got out somewhere it
// shouldn't. The old one stops working at once. Free for everyone, a few a day.
app.post("/api/cards/:id/rotate-code", async (c) => {
  const card = await ownCard(c);
  if (!card) return c.json({ error: "not found" }, 404);
  const db = c.env.DB;
  if ((await bump(db, `code:replace:${card.user_id}`, DAY)) > 3) {
    return c.json({ error: "You've replaced your code a few times today. Try again tomorrow.", code: "throttled" }, 429);
  }
  const r = await rotateCardCode(db, card);
  await run(db, "UPDATE cards SET code_custom = 0 WHERE id = ?", card.id);
  return c.json({ ok: true, code: r.code });
});

// Plus: choose your own code (4 to 8 letters or numbers), once a week.
app.post("/api/cards/:id/custom-code", async (c) => {
  const card = await ownCard(c);
  if (!card) return c.json({ error: "not found" }, 404);
  const db = c.env.DB;
  const plan = planOf(await one(db, "SELECT plan, plan_until FROM users WHERE id = ?", card.user_id));
  if (plan.tier !== "plus") {
    return c.json({ error: "Choosing your own code is part of Lanyard Plus.", code: "plus_required" }, 402);
  }
  const next = card.code_changed_at ? card.code_changed_at + CUSTOM_EVERY_MS : 0;
  if (next > now()) {
    return c.json({ error: "You can choose a new code once a week.", code: "too_soon", nextChangeAt: next }, 429);
  }
  // Stops anyone using this to test which codes exist.
  if ((await bump(db, `code:custom:${card.user_id}`, HOUR)) > 20) {
    return c.json({ error: "Too many tries. Wait an hour and try again.", code: "throttled" }, 429);
  }
  const body = await c.req.json().catch(() => ({}));
  const checked = checkCustomCode(body.code);
  if (checked.error) return c.json({ error: checked.error, code: "bad_code" }, 400);
  const r = await setCustomCode(db, card, checked.code);
  if (r.error) return c.json({ error: r.error, code: "code_taken" }, 409);
  return c.json({ ok: true, code: r.code, nextChangeAt: r.same ? next || null : r.changedAt + CUSTOM_EVERY_MS });
});

// Opened from a home-screen icon: remember it on the account, so the browser
// (a different cookie jar on iPhone) stops showing the "add to home screen" guide.
app.post("/api/me/installed", async (c) => {
  const u = requireUser(c);
  try {
    await run(c.env.DB, "UPDATE users SET app_installed_at = COALESCE(app_installed_at, ?) WHERE id = ?", now(), u.id);
  } catch { /* migration 0016 not applied yet: harmless, the device remembers it too */ }
  return c.json({ ok: true });
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

// The card the owner shared through this connection: the card that was scanned
// if it's theirs, otherwise (they scanned you) their default card.
async function sharedCardId(db, cn, ownerId) {
  if (cn.card_id) {
    const own = await one(db, "SELECT id FROM cards WHERE id = ? AND user_id = ?", cn.card_id, ownerId);
    if (own) return own.id;
  }
  return ensureDefaultCard(db, ownerId);
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

// How the first scan happened. Anything else (or nothing) counts as a shared
// link. Set once when the connection is made; a later scan never changes it.
const VIA = ["qr", "code", "link"];
const viaOf = (v) => (VIA.includes(v) ? v : "link");

app.post("/api/connect", async (c) => {
  const me = requireUser(c);
  const body = await c.req.json().catch(() => ({}));
  const db = c.env.DB;
  if ((await bump(db, `conn:u:${me.id}`, HOUR)) > 60) {
    return c.json({ error: "That's a lot of connections in an hour. Take a breather and try again soon.", code: "throttled" }, 429);
  }
  const card = await one(db, "SELECT * FROM cards WHERE id = ?", String(body.cardId || ""));
  if (!card) return c.json({ error: "card not found" }, 404);
  const peerId = card.user_id;
  if (peerId === me.id) return c.json({ error: "that's your own card" }, 400);
  if (await isBlocked(db, me.id, peerId)) return c.json({ error: "You can't connect with this person." }, 403);

  // Guests must at least have a name. If they have no profile, make a stub one
  // they can finish at home (the /claim flow).
  let myProfile = await one(db, "SELECT * FROM profiles WHERE user_id = ?", me.id);
  if (!myProfile) {
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "name required" }, 400);
    await run(
      db,
      `INSERT INTO profiles (user_id, name, uni, course, headline, about, links, tags, projects, is_public, updated_at, onboarding_step)
       VALUES (?, ?, '', '', '', '', '{}', '[]', '[]', 1, ?, 1)`,
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

  // Shared selfie: the person taking it ticks that everyone in it agrees. The
  // other person still has to accept it in the app (consent_b); until they do
  // it stays "pending", is only a request for them, and is deleted after 7 days.
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
      `INSERT INTO connections (id, user_a, user_b, event_id, selfie_key, selfie_by, selfie_at, consent_a, consent_b, card_id, created_at, via)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      connId, me.id, peerId, eventId, selfieKey, selfieKey ? me.id : null, selfieKey ? ts : null, body.consent && selfieKey ? 1 : 0, card.id, ts,
      viaOf(body.via)
    );
  } else if (body.selfieDataUrl && selfieKey) {
    // A new photo replaces the old one and needs accepting again.
    if (existing.selfie_key && existing.selfie_key !== selfieKey) await deleteImage(c.env, existing.selfie_key).catch(() => {});
    await run(db,
      "UPDATE connections SET selfie_key = ?, selfie_by = ?, selfie_at = ?, consent_a = 1, consent_b = 0, consent_b_at = NULL WHERE id = ?",
      selfieKey, me.id, ts, connId);
  }
  if (body.selfieDataUrl && selfieKey) {
    await db.batch([
      db.prepare(`INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES (?, ?, 'selfie', 1, ?)
                  ON CONFLICT(user_id, scope) DO UPDATE SET granted = 1, created_at = ?`).bind(newId(), me.id, ts, ts),
      logConsentStmt(db, me.id, "selfie", "granted", connId),
    ]);
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
    `SELECT cn.id AS connection_id, cn.selfie_key, cn.selfie_by, cn.consent_b, cn.event_id, cn.created_at, cn.via,
            CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END AS peer_id,
            p.name AS peer_name, p.photo_key AS peer_photo_key, p.course, p.uni, p.mode, p.company, p.role, p.headline,
            COALESCE((SELECT c2.id FROM cards c2 WHERE c2.id = cn.card_id
                      AND c2.user_id = CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END), cd.id) AS card_id,
            n.text AS my_note, n.tags AS my_tags, n.remind_at, n.followed_up_at, ev.name AS event_name
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
  // Same card-scoped view as GET /api/connections/:id, so search only ever sees
  // what each person's card shares with this viewer. Cards and profiles are
  // loaded in two queries for the whole list, not two per person.
  const ids = (list) => JSON.stringify([...new Set(list)]);
  const [cards, profiles] = rows.length ? await Promise.all([
    all(db, "SELECT * FROM cards WHERE id IN (SELECT value FROM json_each(?))", ids(rows.map((r) => r.card_id))),
    all(db, "SELECT * FROM profiles WHERE user_id IN (SELECT value FROM json_each(?))", ids(rows.map((r) => r.peer_id))),
  ]) : [[], []];
  const cardById = new Map(cards.map((x) => [x.id, x]));
  const profileByUser = new Map(profiles.map((x) => [x.user_id, x]));
  const views = await Promise.all(rows.map((r) => {
    const card = cardById.get(r.card_id);
    return card ? cardView(db, card, { shared: true, profile: profileByUser.get(r.peer_id) || null }) : null;
  }));
  const parseTags = (t) => { try { return Array.isArray(t) ? t : JSON.parse(t || "[]"); } catch { return []; } };
  return c.json({
    connections: rows.map((r, i) => {
      const v = views[i];
      return {
        id: r.connection_id,
        peer: {
          id: r.peer_id, name: r.peer_name,
          photo: r.peer_photo_key ? `/media/${r.peer_photo_key}` : null,
          course: r.course, uni: r.uni, headline: r.headline,
          mode: r.mode || "student", company: r.company || "", role: r.role || "",
          year: v?.profile.year || "", about: v?.profile.about || "",
          tags: v?.profile.tags || [], links: v?.profile.links || {},
          projects: (v?.profile.projects || []).map((pr) => ({ title: pr.title || "", line: pr.line || "" })),
          cardName: v?.name || "", cardNote: v?.note || "",
        },
        ...selfieView(r, me.id),
        cardId: r.card_id || null,
        eventId: r.event_id, eventName: r.event_name || "",
        metAt: r.created_at, via: r.via || null, note: r.my_note || "",
        myTags: parseTags(r.my_tags),
        remindAt: r.remind_at || null,
        followedUpAt: r.followed_up_at || null,
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
  const cev = cn.event_id ? await one(db, "SELECT name FROM events WHERE id = ?", cn.event_id) : null;
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
  const view = card ? await cardView(db, card, { shared: true }) : null;
  const inCommon = await sharedGround(db, { viewerId: me.id, peerId, cn, peerCard: card });

  return c.json({
    id: cn.id,
    inCommon,
    cardId: card?.id || null,
    peer: {
      id: peerId,
      name: p.name,
      photo: p.photo_key ? `/media/${p.photo_key}` : null,
      uni: p.uni, course: p.course, year: p.year,
      mode: p.mode || "student", company: p.company || "", role: p.role || "",
      headline: p.headline, about: p.about,
      links: view?.profile.links || {},
      tags: view?.profile.tags || p.tags || [],
      projects: view?.profile.projects || [],
      cardName: card?.name || null,
      cardNote: card?.note || "",
    },
    ...selfieView(cn, me.id),
    eventId: cn.event_id, eventName: cev?.name || "", metAt: cn.created_at, via: cn.via || null, note: note?.text || "",
    messages: msgs.map((m) => ({ id: m.id, mine: m.from_id === me.id, text: m.text, at: m.created_at })),
  });
});

app.put("/api/connections/:id/note", async (c) => {
  const me = requireUser(c);
  const { text } = await c.req.json().catch(() => ({}));
  const cn = await one(c.env.DB, "SELECT id FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)",
    c.req.param("id"), me.id, me.id);
  if (!cn) return c.json({ error: "not found" }, 404);
  await run(c.env.DB,
    `INSERT INTO notes (user_id, connection_id, text, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, connection_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
    me.id, cn.id, String(text || "").slice(0, 600), now());
  return c.json({ ok: true });
});

// Your private follow-up details: a reminder date, "done", and your own tags.
app.put("/api/connections/:id/meta", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const cn = await one(db, "SELECT id FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)",
    c.req.param("id"), me.id, me.id);
  if (!cn) return c.json({ error: "not found" }, 404);
  const b = await c.req.json().catch(() => ({}));
  const cur = (await one(db, "SELECT remind_at, followed_up_at, tags FROM notes WHERE user_id = ? AND connection_id = ?", me.id, cn.id)) || {};
  let remindAt = cur.remind_at ?? null;
  if (b.remindAt === null) remindAt = null;
  else if (b.remindAt !== undefined) {
    const t = Number(b.remindAt);
    if (!Number.isFinite(t) || t < now() - DAY || t > now() + 366 * DAY) return c.json({ error: "Pick a date within the next year." }, 400);
    remindAt = Math.round(t);
  }
  let followedUpAt = cur.followed_up_at ?? null;
  if (b.followedUp === true) { followedUpAt = followedUpAt || now(); remindAt = null; }
  if (b.followedUp === false) followedUpAt = null;
  const tags = Array.isArray(b.tags) ? strings(b.tags, 10, 24).map((t) => t.toLowerCase()) : (cur.tags || []);
  await run(db,
    `INSERT INTO notes (user_id, connection_id, text, updated_at, remind_at, followed_up_at, tags) VALUES (?, ?, '', ?, ?, ?, ?)
     ON CONFLICT(user_id, connection_id) DO UPDATE SET remind_at = excluded.remind_at,
       followed_up_at = excluded.followed_up_at, tags = excluded.tags, updated_at = excluded.updated_at`,
    me.id, cn.id, now(), remindAt, followedUpAt, JSON.stringify([...new Set(tags)]));
  return c.json({ ok: true, remindAt, followedUpAt, tags: [...new Set(tags)] });
});

// The home screen in one request: follow-ups that are due and events waiting for feedback.
app.get("/api/home", async (c) => {
  const me = c.get("user");
  if (!me) return c.json({ followups: [], feedback: [] });
  const db = c.env.DB;
  const [followups, feedback] = await Promise.all([
    all(db,
      `SELECT cn.id, n.remind_at, p.name, p.photo_key,
              COALESCE((SELECT c2.id FROM cards c2 WHERE c2.id = cn.card_id AND c2.user_id = p.user_id),
                       (SELECT c3.id FROM cards c3 WHERE c3.user_id = p.user_id AND c3.is_default = 1)) AS card_id
       FROM notes n JOIN connections cn ON cn.id = n.connection_id
       JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ? THEN cn.user_b ELSE cn.user_a END
       WHERE n.user_id = ? AND n.remind_at IS NOT NULL AND n.followed_up_at IS NULL AND n.remind_at <= ?
       ORDER BY n.remind_at LIMIT 5`,
      me.id, me.id, now() + DAY),
    pendingFeedback(db, me.id),
  ]);
  return c.json({
    followups: followups.map((f) => ({
      connectionId: f.id, cardId: f.card_id, name: f.name, remindAt: f.remind_at,
      photo: f.photo_key ? `/media/${f.photo_key}` : null,
    })),
    feedback,
  });
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

// The second person in a shared selfie accepts it (or removes it, below). Until
// then it is only a request to them and is deleted after 7 days.
app.post("/api/connections/:id/selfie/accept", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const cn = await one(db, "SELECT * FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)", c.req.param("id"), me.id, me.id);
  if (!cn || !cn.selfie_key) return c.json({ error: "not found" }, 404);
  if (cn.selfie_by === me.id) return c.json({ error: "The other person has to accept this one." }, 400);
  await db.batch([
    db.prepare("UPDATE connections SET consent_b = 1, consent_b_at = ? WHERE id = ?").bind(now(), cn.id),
    logConsentStmt(db, me.id, "selfie_accept", "granted", cn.id),
  ]);
  return c.json({ ok: true });
});

// "Remove me from this photo": either person, any time, deletes it for both.
// The connection itself stays.
app.post("/api/connections/:id/selfie/remove", async (c) => {
  const me = requireUser(c);
  const db = c.env.DB;
  const cn = await one(db, "SELECT * FROM connections WHERE id = ? AND (user_a = ? OR user_b = ?)", c.req.param("id"), me.id, me.id);
  if (!cn || !cn.selfie_key) return c.json({ error: "not found" }, 404);
  await deleteImage(c.env, cn.selfie_key);
  await db.batch([
    db.prepare("UPDATE connections SET selfie_key = NULL, selfie_by = NULL, selfie_at = NULL, consent_a = 0, consent_b = 0, consent_b_at = NULL WHERE id = ?").bind(cn.id),
    logConsentStmt(db, me.id, cn.selfie_by === me.id ? "selfie" : "selfie_accept", "withdrawn", cn.id),
  ]);
  return c.json({ ok: true });
});

/* -------------------------------- media ---------------------------------- */

app.get("/media/:key{.+}", async (c) => {
  // Keys are prefix/hex.ext — block traversal.
  const key = c.req.param("key");
  if (!/^(avatar|selfie|project|event)\/[a-z0-9]+\.(webp|jpg|jpeg|png)$/.test(key)) {
    return c.json({ error: "bad key" }, 400);
  }
  // A shared selfie is only ever served to the two people in that connection.
  const isPrivate = key.startsWith("selfie/");
  if (isPrivate) {
    const me = c.get("user");
    const ok = me && (await one(c.env.DB,
      "SELECT 1 AS x FROM connections WHERE selfie_key = ? AND (user_a = ? OR user_b = ?)", key, me.id, me.id));
    if (!ok) return c.json({ error: "not found" }, 404);
  }
  const res = await getImage(c.env, key, { isPrivate });
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
  if ((await bump(db, `day:report:${u.id}`, DAY)) > 20) return c.json({ error: "You've sent a lot of reports today. Email us if it's urgent." }, 429);
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
app.route("/", myEventsApp);
app.route("/", feedbackApp);
app.route("/", hostApp);
app.route("/", adminApp);
app.route("/", promoApp);
app.route("/", unsubApp);
app.route("/", privacyApp);
app.route("/", integrationsApp);

/* ------------------- old host portal addresses (F10) -------------------- */
// The portal moved to its own site with its pages at the root:
// lanyd.fyi/host/events/abc -> host.lanyd.fyi/events/abc (and /host -> /).
// The host site answers the same for its own /host/... addresses from before F10.
// /hosts (the pitch page) is a different path and stays on the main site.
const toHostSite = (c) => {
  const u = new URL(c.req.url);
  return c.redirect(hostOrigin(c.env, c) + (u.pathname.replace(/^\/host/, "") || "/") + u.search, 301);
};
app.get("/host", toHostSite);
app.get("/host/*", toHostSite);

/* ------------------------------- SPA fallback ----------------------------- */
app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  // Daily retention clean-up (see [triggers] in wrangler.toml).
  scheduled: (event, env, ctx) => {
    // Hourly: post-event emails. Daily (03:17): retention clean-up.
    if (event.cron === "17 3 * * *") ctx.waitUntil(purgeExpired(env));
    else ctx.waitUntil(sendEventEmails(env).catch((e) => console.error(e)));
  },
};
