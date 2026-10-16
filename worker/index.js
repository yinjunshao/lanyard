/**
 * Lanyard Worker — API + SPA asset host.
 * Routes under /api/* and /session/* are handled here; everything else
 * falls through to the static Vite build (SPA history-mode routing).
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const fail = (message, status = 400) => json({ error: message }, status);
const body = async (r) => { try { return await r.json(); } catch { return {}; } };

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

// Strip anything a non-owner should never read. Birthday is half of the
// login credential (code + birthday), so it is only returned to the owning
// device; everyone else gets a derived age instead.
const publicProfile = (p, isOwner = false) => {
  if (!p) return null;
  const { deviceToken, tokens, birthday, ...pub } = p;
  if (birthday) pub.age = ageFromBirthday(birthday);
  if (isOwner && birthday) pub.birthday = birthday;
  return pub;
};

function ageFromBirthday(b) {
  if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const d = new Date(b + "T00:00:00");
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/profile" && request.method === "POST") return createProfile(request, env);
    if (path === "/api/mine" && request.method === "GET") return getMine(request, env);
    if (path === "/api/login" && request.method === "POST") return login(request, env);

    const m = path.match(/^\/api\/profile\/([a-z0-9]+)$/);
    if (m) {
      if (request.method === "GET") return getProfile(m[1], env);
      if (request.method === "PUT") return updateProfile(m[1], request, env);
    }

    if (path === "/api/connect" && request.method === "POST") return connect(request, env);
    const cm = path.match(/^\/api\/connections\/([a-z0-9]+)$/);
    if (cm) {
      if (request.method === "GET") return listConnections(cm[1], env);
      if (request.method === "DELETE") return removeConnection(cm[1], request, env);
    }

    // shared two-sided message thread for a connection
    const th = path.match(/^\/api\/thread\/([a-z0-9]+)\/([a-z0-9]+)$/);
    if (th) {
      if (request.method === "GET") return getThread(request, env, th[1], th[2]);
      if (request.method === "POST") return postThread(request, env, th[1], th[2]);
    }

    // together-photo: POST dataUrl -> unguessable key; GET key -> raw image
    if (path === "/api/photo" && request.method === "POST") return uploadPhoto(request, env);
    if (path === "/api/photo/attach" && request.method === "POST") return attachPhoto(request, env);
    const pm = path.match(/^\/api\/photo\/([a-z0-9]{12,32})$/);
    if (pm && request.method === "GET") return getPhoto(pm[1], env);

    // resolve a short 4-char profile code -> profile id
    const rc = path.match(/^\/api\/code\/([a-z2-9]{4})$/i);
    if (rc && request.method === "GET") return resolveCode(rc[1], env);

    if (path === "/api/followup" && request.method === "POST") return followup(request, env);

    // Static SPA assets (falls through to /dist).
    return env.ASSETS.fetch(request);
  },
};

/* ---------------- Profile CRUD ---------------- */

// A profile can be claimed by several devices (same student, new phone). The
// legacy single `deviceToken` field is treated as one member of the set.
function ownsProfile(p, token) {
  if (!token) return false;
  if (p.deviceToken === token) return true;
  return Array.isArray(p.tokens) && p.tokens.includes(token);
}

async function createProfile(request, env) {
  const { profile = {}, token } = await body(request);
  if (!token) return fail("missing device token");
  if (!profile.name || !profile.name.trim()) return fail("name is required");
  if (!profile.birthday || !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthday)) {
    return fail("birthday is required to secure your login");
  }

  const id = newId();
  const clean = sanitize(profile);
  clean.id = id;
  clean.code = await newProfileCode(env);
  clean.deviceToken = token;
  clean.tokens = [token];
  clean.createdAt = clean.updatedAt = Date.now();

  await env.LANYARD_KV.put(`profile:${id}`, JSON.stringify(clean));
  await env.LANYARD_KV.put(`code:${clean.code}`, id);
  // The current device always claims the profile it just created. This matters
  // when a scanner creates their first "real" profile after using a mini one.
  await env.LANYARD_KV.put(`cred:${token}`, id);

  return json({ id, profile: publicProfile(clean, true) });
}

// Log back into an existing profile from any device: code + birthday.
async function login(request, env) {
  const { code, birthday, token } = await body(request);
  if (!token) return fail("missing device token");
  const c = String(code || "").toUpperCase();
  if (!/^[A-Z2-9]{4}$/.test(c)) return fail("enter your 4-character code");
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return fail("enter your birthday");

  const id = await env.LANYARD_KV.get(`code:${c}`);
  if (!id) return fail("no card found for that code", 404);
  const raw = await env.LANYARD_KV.get(`profile:${id}`);
  if (!raw) return fail("no card found for that code", 404);
  const p = JSON.parse(raw);

  if (p.birthday !== birthday) return fail("birthday doesn’t match this code", 401);

  // Grant this device (idempotent). Keep both the legacy field and tokens[] so
  // older records keep working.
  if (!ownsProfile(p, token)) {
    p.tokens = Array.from(new Set([p.deviceToken, ...(p.tokens || []), token].filter(Boolean)));
    p.updatedAt = Date.now();
    await env.LANYARD_KV.put(`profile:${id}`, JSON.stringify(p));
  }
  await env.LANYARD_KV.put(`cred:${token}`, id);

  return json({ id, profile: publicProfile(p, true) });
}

async function getProfile(id, env) {
  const raw = await env.LANYARD_KV.get(`profile:${id}`);
  if (!raw) return fail("profile not found", 404);
  const p = await ensureCode(JSON.parse(raw), env);
  return json({ profile: publicProfile(p) });
}

async function updateProfile(id, request, env) {
  const token = request.headers.get("x-lanyard-token");
  const raw = await env.LANYARD_KV.get(`profile:${id}`);
  if (!raw) return fail("profile not found", 404);
  const existing = JSON.parse(raw);
  if (!ownsProfile(existing, token)) return fail("not authorized", 403);

  const { profile = {} } = await body(request);
  const merged = { ...existing, ...sanitize(profile), id, updatedAt: Date.now() };
  // Never let an edit drop the owner's device grant.
  merged.deviceToken = existing.deviceToken || token;
  merged.tokens = Array.isArray(existing.tokens) ? existing.tokens : [merged.deviceToken].filter(Boolean);
  await env.LANYARD_KV.put(`profile:${id}`, JSON.stringify(merged));
  return json({ profile: publicProfile(merged, true) });
}

async function getMine(request, env) {
  const token = request.headers.get("x-lanyard-token");
  if (!token) return json({ id: null, profile: null });
  const id = await env.LANYARD_KV.get(`cred:${token}`);
  if (!id) return json({ id: null, profile: null });
  const raw = await env.LANYARD_KV.get(`profile:${id}`);
  if (!raw) return json({ id: null, profile: null });
  const p = await ensureCode(JSON.parse(raw), env);
  return json({ id, profile: publicProfile(p, true) });
}

/* ---------------- Connect (scan -> auto-connect) ---------------- */

async function connect(request, env) {
  const { myId, peerId, myNote, message, name, course, photoId, token } = await body(request);
  if (!peerId) return fail("peerId required");
  const peerRaw = await env.LANYARD_KV.get(`profile:${peerId}`);
  if (!peerRaw) return fail("peer profile not found", 404);
  const peer = JSON.parse(peerRaw);

  let meId = myId;
  // New user: create a mini profile on the spot (we must know who we're connecting).
  if (!myId) {
    if (!name || !name.trim()) return fail("name required to connect as a new user");
    meId = newId();
    const mini = {
      id: meId,
      code: await newProfileCode(env),
      name,
      course: course || "",
      uni: "UCL",
      specialties: [],
      links: {},
      helloNote: "",
      deviceToken: token || "",
      tokens: token ? [token] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await env.LANYARD_KV.put(`profile:${meId}`, JSON.stringify(mini));
    await env.LANYARD_KV.put(`code:${mini.code}`, meId);
    if (token) await env.LANYARD_KV.put(`cred:${token}`, meId);
  }

  const now = Date.now();
  const myRaw = await env.LANYARD_KV.get(`profile:${meId}`);
  const me = myRaw ? JSON.parse(myRaw) : { id: meId, name, course, uni: "UCL", helloNote: "" };

  // Reciprocal: scanner stores peer; peer stores scanner (mutual, no approval).
  // The shared together-photo (if taken) is attached to BOTH records.
  await env.LANYARD_KV.put(
    `conn:${meId}:${peerId}`,
    JSON.stringify({
      peerId,
      peerSnapshot: publicProfile(peer),
      ownerHelloAtSave: peer.helloNote || "",
      myNote: myNote || "",
      photoId: photoId || "",
      metAt: now,
    })
  );
  await env.LANYARD_KV.put(
    `conn:${peerId}:${meId}`,
    JSON.stringify({
      peerId: meId,
      peerSnapshot: publicProfile(me),
      ownerHelloAtSave: me.helloNote || "",
      myNote: "",
      photoId: photoId || "",
      metAt: now,
    })
  );

  // Maintain forward indexes so listConnections can find this user's conns.
  for (const owner of [meId, peerId]) {
    const other = owner === meId ? peerId : meId;
    await appendListIndex(env, owner, other);
  }

  // Seed the shared two-sided thread with the scanner's message + selfie.
  const msg = String(message || "").trim().slice(0, 600);
  if (msg || photoId) {
    const t = await loadThread(env, meId, peerId);
    t.messages.push({ id: newId(), from: meId, text: msg, photoId: photoId || "", at: now });
    await saveThread(env, meId, peerId, t);
  }

  return json({ myId: meId, peer: publicProfile(peer) });
}

/* ---------------- Shared connection thread (two-sided messages) ---------------- */
// Canonical thread key from the two ids, independent of who opens it.
function threadKey(a, b) {
  return a < b ? `thread:${a}:${b}` : `thread:${b}:${a}`;
}
async function loadThread(env, a, b) {
  const raw = await env.LANYARD_KV.get(threadKey(a, b));
  if (!raw) return { participants: [a, b], messages: [] };
  try {
    const t = JSON.parse(raw);
    if (!Array.isArray(t.messages)) t.messages = [];
    return t;
  } catch {
    return { participants: [a, b], messages: [] };
  }
}
async function saveThread(env, a, b, t) {
  await env.LANYARD_KV.put(threadKey(a, b), JSON.stringify(t));
}
// Confirm `viewer` is one of the two participants (must own their device).
async function authorizePair(env, viewer, a, b, token) {
  if (viewer !== a && viewer !== b) return false;
  const raw = await env.LANYARD_KV.get(`profile:${viewer}`);
  if (!raw) return false;
  return ownsProfile(JSON.parse(raw), token);
}

async function getThread(request, env, a, b) {
  const token = request.headers.get("x-lanyard-token");
  if (!(await authorizePair(env, a, a, b, token))) return fail("not authorized", 403);
  const t = await loadThread(env, a, b);
  return json({ thread: t });
}

async function postThread(request, env, a, b) {
  const token = request.headers.get("x-lanyard-token");
  if (!(await authorizePair(env, a, a, b, token))) return fail("not authorized", 403);
  const { text, photoId } = await body(request);
  const msg = String(text || "").trim().slice(0, 600);
  if (!msg && !photoId) return fail("empty message");
  const t = await loadThread(env, a, b);
  t.messages.push({ id: newId(), from: a, text: msg, photoId: photoId || "", at: Date.now() });
  await saveThread(env, a, b, t);
  return json({ ok: true, thread: t });
}

async function listConnections(ownerId, env) {
  const listRaw = await env.LANYARD_KV.get(`list:${ownerId}`);
  const ids = listRaw ? JSON.parse(listRaw) : [];
  const out = [];
  for (const pid of ids) {
    const raw = await env.LANYARD_KV.get(`conn:${ownerId}:${pid}`);
    if (raw) out.push(JSON.parse(raw));
  }
  return json({ connections: out });
}

async function appendListIndex(env, owner, peer) {
  const raw = await env.LANYARD_KV.get(`list:${owner}`);
  let list = [];
  try { list = raw ? JSON.parse(raw) : []; } catch { list = []; }
  if (!Array.isArray(list)) list = [];
  if (!list.includes(peer)) {
    list.push(peer);
    await env.LANYARD_KV.put(`list:${owner}`, JSON.stringify(list));
  }
}

async function removeConnection(ownerId, request, env) {
  const token = request.headers.get("x-lanyard-token");
  const url = new URL(request.url);
  const peerId = url.searchParams.get("peerId");
  if (!peerId) return fail("peerId required");
  const ownerRaw = await env.LANYARD_KV.get(`profile:${ownerId}`);
  if (!ownerRaw || !ownsProfile(JSON.parse(ownerRaw), token)) return fail("not authorized", 403);

  await env.LANYARD_KV.delete(`conn:${ownerId}:${peerId}`);
  const listRaw = await env.LANYARD_KV.get(`list:${ownerId}`);
  const list = listRaw ? JSON.parse(listRaw) : [];
  await env.LANYARD_KV.put(`list:${ownerId}`, JSON.stringify(list.filter((i) => i !== peerId)));
  return json({ ok: true });
}

/* ---------------- Together photo (unguessable key, stored in KV) ---------------- */

const MAX_PHOTO_BYTES = 900 * 1024; // client compresses; hard ceiling ~900KB base64

async function uploadPhoto(request, env) {
  const { dataUrl, a, b } = await body(request);
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return fail("invalid image");
  if (m[2].length > MAX_PHOTO_BYTES) return fail("image too large", 413);

  // 128-bit unguessable key — the URL itself is the capability ("password").
  const key = newId() + newId();
  await env.LANYARD_KV.put(`photo:${key}`, dataUrl, { expirationTtl: 60 * 60 * 24 * 90 });

  // If both ids are supplied and the mutual connection already exists, link it.
  if (a && b) await attachPhotoToPair(env, a, b, key);

  return json({ photoId: key });
}

async function attachPhoto(request, env) {
  const { myId, peerId, photoId } = await body(request);
  if (!myId || !peerId || !/^[a-z0-9]{12,32}$/.test(photoId)) return fail("bad request");
  await attachPhotoToPair(env, myId, peerId, photoId);
  return json({ ok: true });
}

async function attachPhotoToPair(env, a, b, photoId) {
  for (const [owner, other] of [[a, b], [b, a]]) {
    const raw = await env.LANYARD_KV.get(`conn:${owner}:${other}`);
    if (!raw) continue;
    const rec = JSON.parse(raw);
    rec.photoId = photoId;
    await env.LANYARD_KV.put(`conn:${owner}:${other}`, JSON.stringify(rec));
  }
}

async function getPhoto(key, env) {
  const dataUrl = await env.LANYARD_KV.get(`photo:${key}`);
  if (!dataUrl) return fail("not found", 404);
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return fail("bad image", 500);
  const bytes = base64ToBytes(m[2]);
  return new Response(bytes, {
    headers: {
      "content-type": m[1],
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ---------------- Short profile codes (4-char, permanent) ---------------- */
// Each profile gets a human-shareable code (no 0/O/1/I). code:XXXX -> profile id.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function newProfileCode(env) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    let code = "";
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    const taken = await env.LANYARD_KV.get(`code:${code}`);
    if (!taken) return code;
  }
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  let code = "";
  for (const x of b) code += CODE_ALPHABET[x % CODE_ALPHABET.length];
  return code;
}

// Backfill a code for profiles created before codes existed.
async function ensureCode(p, env) {
  if (p && p.id && !p.code) {
    p.code = await newProfileCode(env);
    await env.LANYARD_KV.put(`code:${p.code}`, p.id);
    await env.LANYARD_KV.put(`profile:${p.id}`, JSON.stringify(p));
  }
  return p;
}

async function resolveCode(code, env) {
  const c = String(code || "").toUpperCase();
  const id = await env.LANYARD_KV.get(`code:${c}`);
  if (!id) return fail("code not found", 404);
  const raw = await env.LANYARD_KV.get(`profile:${id}`);
  if (!raw) return fail("profile not found", 404);
  const p = JSON.parse(raw);
  return json({ id, profile: publicProfile(p) });
}

/* ---------------- Follow-up engine (Claude) ---------------- */

async function followup(request, env) {
  const { peerId, myId, ctx } = await body(request);
  const API = env.CLAUDE_API_KEY;
  if (!API) return fail("server not configured", 500);

  const meRaw = await env.LANYARD_KV.get(`profile:${myId}`);
  const peerRaw = await env.LANYARD_KV.get(`profile:${peerId}`);
  if (!meRaw || !peerRaw) return fail("profile missing", 404);
  const me = JSON.parse(meRaw);
  const peer = JSON.parse(peerRaw);

  const prompt =
    `Write a short, warm, natural student networking follow-up message (max 80 words, no greeting boilerplate at top, no "[insert]" placeholders).\n` +
    `From me: ${me.name} (${me.course || "student"}${me.uni ? ", " + me.uni : ""}). I can help with: ${(me.specialties || []).join(", ") || "various things"}.\n` +
    `To: ${peer.name} (${peer.course || "student"}). They offer/are into: ${(peer.specialties || []).join(", ") || "unspecified"}.\n` +
    `Their hello note: "${peer.helloNote || ""}".\n` +
    `Context on how we met: "${ctx || ""}".\n` +
    `Reference one specific thing they offer that I'd plausibly want, to sound genuine. Output only the message.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return json({ error: "followup failed" }, 502);
  const data = await res.json();
  const text = data?.content?.[0]?.text || "";
  return json({ message: text.trim() });
}

/* ---------------- helpers ---------------- */

// Whitelist the exact fields the client may store — no junk keys.
function sanitize(p) {
  const out = {};
  for (const k of [
    "name", "uni", "course", "year", "email", "birthday",
    "tagline", "specialties", "about",
    "helloNote", "links", "photo",
  ]) {
    if (p[k] !== undefined) out[k] = p[k];
  }
  if (typeof out.year === "string") out.year = out.year.slice(0, 24);
  if (typeof out.email === "string") out.email = out.email.trim().slice(0, 200);
  if (typeof out.birthday === "string") out.birthday = out.birthday.slice(0, 10);
  if (!Array.isArray(out.specialties))
    out.specialties = out.specialties ? String(out.specialties).split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!out.links || typeof out.links !== "object") out.links = {};
  for (const k of ["linkedin", "github", "x", "instagram", "portfolio", "other"]) {
    if (out.links[k] && typeof out.links[k] === "string" && !/^https?:\/\//.test(out.links[k])) {
      out.links[k] = "https://" + out.links[k];
    }
  }
  return out;
}