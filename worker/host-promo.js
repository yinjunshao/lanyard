// Host promo codes (F20): a code gives an organisation event credits. Redeemed
// in the host portal only (/api/host/redeem/:code, signed in with the host
// cookie); attendee codes (promo.js) are a different audience in the same
// table and neither flow can see the other's codes.
//
// Money rules:
// - A code is used once per organisation and once per host account. Both are
//   database rules (unique indexes on host_promo_claims), so two presses at the
//   same moment cannot both win, whatever the code above checked first.
// - Taking a slot (the code's `uses`), recording the claim and issuing the
//   credits happen in one transaction (db.batch), and each step is conditional,
//   so the cap, the dates and the on/off switch are checked at the moment of writing.
// - The credits row has an id made from the code and the organisation, so even a
//   second attempt to issue it cannot add another.
// - A society or institution that is not approved yet holds its claim (it takes a
//   slot, nothing is issued); approval issues it (releaseHeldClaims, called by the
//   admin approval and, to be safe, when the host looks at Billing).
// - Every refusal of a code that is not usable (unknown, switched off, not started,
//   ended, fully claimed, for another kind of organisation, wrong audience) is the
//   same answer, so nobody can find out which codes exist.
import { newId, now, one } from "./db.js";
import { bump, HOUR } from "./ratelimit.js";
import { HttpError } from "./session.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKUPS = 30;
const LOOKUP_WINDOW = 10 * 60 * 1000;
const MISSES_PER_HOUR = 30;
const REDEEMS_PER_ACCOUNT_PER_HOUR = 20;
const REDEEMS_PER_IP_PER_HOUR = 30;

export const BAD_HOST_CODE = {
  error: "That code can't be used. Check the spelling. It may have ended, been fully claimed, or not be for your kind of organisation.",
  code: "bad_code",
};
const throttled = (c, text = "Too many tries. Wait an hour.") => c.json({ error: text, code: "throttled" }, 429);
const ipOf = (c) => c.req.header("cf-connecting-ip") || "local";

/** The credits row id for a claim: one per code and organisation, so it can only ever exist once. */
export const creditId = (code, orgId) => `promo_${code}_${orgId}`;

function usable(row, org, ts = now()) {
  if (!row || row.audience !== "host" || !row.active) return false;
  if (row.starts_at && row.starts_at > ts) return false;
  if (row.expires_at && row.expires_at <= ts) return false;
  if (row.max_uses != null && row.uses >= row.max_uses) return false;
  if (org.verification_status === "rejected") return false;
  if (row.org_kinds) {
    let kinds = [];
    try { kinds = JSON.parse(row.org_kinds); } catch { /* unreadable list: treat as no organisation allowed */ }
    if (!Array.isArray(kinds) || !kinds.includes(org.org_type)) return false;
  }
  return true;
}

const view = (row) => ({
  code: row.code, credits: row.credits, days: row.credit_days,
  left: row.max_uses == null ? null : Math.max(0, row.max_uses - row.uses), expiresAt: row.expires_at || null,
});
const mineView = (m, max) => (m ? {
  code: m.code, credits: m.credits, days: m.credit_days, position: m.position, max: max ?? null,
  held: !m.credit_id, at: m.created_at, grantedAt: m.granted_at || null,
} : null);

/**
 * The statements that issue the credits for claims that are waiting, as one
 * conditional pair: insert the credits row (only for an approved organisation and a
 * code that is on, and only if it is not there already), then mark the claim with it.
 * Safe to run any number of times. `code` limits it to one claim.
 */
export function settleStatements(db, orgId, ts, code = null) {
  const only = code ? " AND c.code = ?" : "";
  const only2 = code ? " AND code = ?" : "";
  return [
    db.prepare(
      `INSERT OR IGNORE INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at)
       SELECT 'promo_' || c.code || '_' || c.org_id, c.org_id, c.credits, 0, ? + c.credit_days * ${DAY_MS}, 'promo:' || c.code, 'promo', ?
       FROM host_promo_claims c
       JOIN orgs o ON o.id = c.org_id
       JOIN promo_codes p ON p.code = c.code
       WHERE c.org_id = ? AND c.credit_id IS NULL AND o.verification_status = 'approved' AND p.active = 1${only}`
    ).bind(ts, ts, orgId, ...(code ? [code] : [])),
    db.prepare(
      `UPDATE host_promo_claims SET credit_id = 'promo_' || code || '_' || org_id, granted_at = ?
       WHERE org_id = ? AND credit_id IS NULL${only2}
         AND EXISTS (SELECT 1 FROM credits WHERE id = 'promo_' || host_promo_claims.code || '_' || host_promo_claims.org_id)`
    ).bind(ts, orgId, ...(code ? [code] : [])),
  ];
}

/** Issues the credits for an organisation's waiting claims (it has just been approved). Returns how many. */
export async function releaseHeldClaims(db, orgId, ts = now()) {
  const out = await db.batch(settleStatements(db, orgId, ts));
  return Number(out[1]?.meta?.changes || 0);
}

const sumCredits = (db, orgId) => one(db,
  `SELECT COALESCE(SUM(events_granted),0) AS granted, COALESCE(SUM(events_used),0) AS used
   FROM credits WHERE org_id = ? AND (expires_at IS NULL OR expires_at > ?)`, orgId, now());

/** Held claims for the Billing page: what is waiting for approval. */
export async function heldClaims(db, orgId) {
  const { results } = await db.prepare(
    "SELECT code, credits, credit_days, created_at FROM host_promo_claims WHERE org_id = ? AND credit_id IS NULL ORDER BY created_at"
  ).bind(orgId).all();
  return (results || []).map((r) => ({ code: r.code, credits: r.credits, days: r.credit_days, at: r.created_at }));
}

/** This host's own claims, for their data export. */
export async function exportHostClaims(db, hostAccountId) {
  const { results } = await db.prepare(
    `SELECT code, org_id, position, credits, credit_days, created_at, granted_at, credit_id IS NULL AS held
     FROM host_promo_claims WHERE host_account_id = ? ORDER BY created_at`
  ).bind(hostAccountId).all();
  return (results || []).map((r) => ({
    code: r.code, organisationId: r.org_id, position: r.position, credits: r.credits, creditDays: r.credit_days,
    claimedAt: r.created_at, creditsIssuedAt: r.granted_at || null, heldUntilApproved: !!r.held,
  }));
}

export function registerHostPromo(hostApp, { findOrg, normCode }) {
  // The claim this host account, or this organisation, already has for a code.
  const existing = (db, code, hostId, orgId) => one(db,
    "SELECT * FROM host_promo_claims WHERE code = ? AND (host_account_id = ? OR org_id = ?) ORDER BY (host_account_id = ?) DESC LIMIT 1",
    code, hostId, orgId, hostId);

  // What a code gives, and (for the signed-in host's organisation) whether it is already taken.
  hostApp.get("/api/host/redeem/:code", async (c) => {
    const me = c.get("host");
    const db = c.env.DB;
    const ip = ipOf(c);
    if ((await bump(db, `hpromo:look:ip:${ip}`, LOOKUP_WINDOW)) > LOOKUPS
      || (await bump(db, `hpromo:look:h:${me.id}`, LOOKUP_WINDOW)) > LOOKUPS) {
      return throttled(c, "That's a lot of lookups. Wait ten minutes and try again.");
    }
    const org = await findOrg(db, me.id);
    if (!org) throw new HttpError(409, "Create or join an organisation first.", "no_org");
    const code = normCode(c.req.param("code"));
    const row = code ? await one(db, "SELECT * FROM promo_codes WHERE code = ? AND audience = 'host'", code) : null;
    // Your own organisation's claim is always shown to you, even once the code has ended.
    const mine = row ? await existing(db, code, me.id, org.id) : null;
    if (mine) return c.json({ promo: view(row), mine: mineView(mine, row.max_uses), org: { name: org.name, status: org.verification_status } });
    if (!usable(row, org)) {
      if ((await bump(db, `hpromo:miss:ip:${ip}`, HOUR)) > MISSES_PER_HOUR
        || (await bump(db, `hpromo:miss:h:${me.id}`, HOUR)) > MISSES_PER_HOUR) return throttled(c);
      return c.json(BAD_HOST_CODE, 404);
    }
    return c.json({ promo: view(row), mine: null, org: { name: org.name, status: org.verification_status } });
  });

  hostApp.post("/api/host/redeem/:code", async (c) => {
    const me = c.get("host");
    const db = c.env.DB;
    const ip = ipOf(c);
    if ((await bump(db, `hpromo:post:h:${me.id}`, HOUR)) > REDEEMS_PER_ACCOUNT_PER_HOUR
      || (await bump(db, `hpromo:post:ip:${ip}`, HOUR)) > REDEEMS_PER_IP_PER_HOUR) return throttled(c);
    if (!me.email_verified_at) throw new HttpError(403, "Confirm your email first, then redeem the code.", "needs_email");
    const org = await findOrg(db, me.id);
    if (!org) throw new HttpError(409, "Create or join an organisation first.", "no_org");
    const m = await one(db, "SELECT role FROM host_org_members WHERE org_id = ? AND host_account_id = ?", org.id, me.id);
    if (!m || !["owner", "staff"].includes(m.role)) {
      throw new HttpError(403, "Only the owner or a staff member of the organisation can redeem a code for it.", "not_allowed");
    }
    const code = normCode(c.req.param("code"));
    const row = code ? await one(db, "SELECT * FROM promo_codes WHERE code = ? AND audience = 'host'", code) : null;

    const done = async (claim, extra = {}) => {
      const fresh = await one(db, "SELECT * FROM promo_codes WHERE code = ?", claim.code);
      const sum = await sumCredits(db, org.id);
      return c.json({
        promo: view(fresh), mine: mineView(claim, fresh.max_uses), org: { name: org.name, status: org.verification_status },
        credits: { remaining: Math.max(0, (sum?.granted || 0) - (sum?.used || 0)) }, ...extra,
      });
    };
    const again = async () => {
      // Already claimed (a second press, or a colleague in the same organisation): change nothing,
      // but if it was waiting and the organisation is now approved, issue it.
      let claim = await existing(db, code, me.id, org.id);
      if (!claim) return null;
      if (!claim.credit_id && org.verification_status === "approved") {
        await db.batch(settleStatements(db, org.id, now(), code));
        claim = await existing(db, code, me.id, org.id);
      }
      return done(claim, { already: true });
    };

    if (row) { const prior = await again(); if (prior) return prior; }
    if (!usable(row, org)) {
      if ((await bump(db, `hpromo:miss:ip:${ip}`, HOUR)) > MISSES_PER_HOUR
        || (await bump(db, `hpromo:miss:h:${me.id}`, HOUR)) > MISSES_PER_HOUR) return throttled(c);
      return c.json(BAD_HOST_CODE, 404);
    }

    const ts = now();
    const claimId = newId() + newId();
    try {
      await db.batch([
        // 1. Take the claim, but only if the code is open right now. Nothing is inserted otherwise.
        db.prepare(
          `INSERT INTO host_promo_claims (claim_id, code, org_id, host_account_id, position, credits, credit_days, created_at)
           SELECT ?, code, ?, ?, uses + 1, credits, credit_days, ? FROM promo_codes
           WHERE code = ? AND audience = 'host' AND active = 1
             AND (starts_at IS NULL OR starts_at <= ?) AND (expires_at IS NULL OR expires_at > ?)
             AND (max_uses IS NULL OR uses < max_uses)`
        ).bind(claimId, org.id, me.id, ts, code, ts, ts),
        // 2. Count it, only if step 1 inserted this claim.
        db.prepare("UPDATE promo_codes SET uses = uses + 1 WHERE code = ? AND EXISTS (SELECT 1 FROM host_promo_claims WHERE claim_id = ?)").bind(code, claimId),
        // 3. Issue the credits now if the organisation is approved; otherwise the claim is held.
        ...settleStatements(db, org.id, ts, code),
      ]);
    } catch (e) {
      // The same organisation or host account claimed at the same moment: the unique rule stopped
      // this one and the whole transaction was undone. Show the winner's claim.
      if (!/UNIQUE|constraint/i.test(String(e?.message || e))) throw e;
      const prior = await again();
      if (prior) return prior;
      throw e;
    }
    const claim = await one(db, "SELECT * FROM host_promo_claims WHERE claim_id = ?", claimId);
    if (!claim) {
      // The code filled up, ended or was switched off between the check and the write.
      return c.json(BAD_HOST_CODE, 404);
    }
    return done(claim);
  });
}
