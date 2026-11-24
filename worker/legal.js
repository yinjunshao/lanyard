// Terms / Privacy acceptance. Bump TERMS_VERSION whenever the Terms or Privacy
// Policy change in a way people should re-accept; everyone is then asked again.
import { newId, now, one, run } from "./db.js";

export const TERMS_VERSION = "2026-11-22";
export const termsScope = () => `terms:${TERMS_VERSION}`;
export const hostTermsScope = () => `host_terms:${TERMS_VERSION}`;

export async function hasConsent(db, userId, scope) {
  const r = await one(db, "SELECT granted FROM consents WHERE user_id = ? AND scope = ?", userId, scope);
  return !!r?.granted;
}

export function recordConsentStmt(db, userId, scope) {
  return db.prepare(
    `INSERT INTO consents (id, user_id, scope, granted, created_at) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(user_id, scope) DO UPDATE SET granted = 1, created_at = excluded.created_at`
  ).bind(newId(), userId, scope, now());
}

// Append-only history (consent_log) that outlives the account: what was agreed
// or withdrawn, and when. Kept 6 years as proof (see purge.js).
export function logConsentStmt(db, userId, scope, action = "granted", ref = null) {
  return db.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(newId() + newId(), userId, scope, action, ref, now());
}

// F51: at sign-up there is no tick. A person agrees by pressing the button under a line that says so;
// these are those lines, word for word as the page shows them (test/consent-line.mjs compares them with the
// components). The history row records which one, its words and the Terms version, so it shows how it was given.
export const SIGNUP_NOTICE = {
  connect: "By pressing Connect, you confirm you're 18 or over and agree to the Terms and Privacy Policy.",
  welcome: "By pressing Continue, you confirm you're 18 or over and agree to the Terms and Privacy Policy.",
  checkin: "By pressing Check in, you confirm you're 18 or over and agree to the Terms and Privacy Policy.",
  host: "By pressing Agree and continue, you confirm you're 18 or over, that you're authorised to act for the organisation you set up, and that you agree to the Host Terms and Privacy Policy.",
};
// ref is `notice:<place>` for a person; a host's row keeps ref 'host_account' (its export and the person's tell them apart by it).
export function logNoticeStmt(db, userId, scope, place, ref = `notice:${place}`) {
  return db.prepare("INSERT INTO consent_log (id, user_id, scope, action, ref, at, wording, version) VALUES (?, ?, ?, 'granted', ?, ?, ?, ?)")
    .bind(newId() + newId(), userId, scope, ref, now(), SIGNUP_NOTICE[place], TERMS_VERSION);
}

export async function recordConsent(db, userId, scope, place = null) {
  await db.batch([recordConsentStmt(db, userId, scope), place ? logNoticeStmt(db, userId, scope, place) : logConsentStmt(db, userId, scope)]);
}
