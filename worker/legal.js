// Terms / Privacy acceptance. Bump TERMS_VERSION whenever the Terms or Privacy
// Policy change in a way people should re-accept; everyone is then asked again.
import { newId, now, one, run } from "./db.js";

export const TERMS_VERSION = "2026-10-26";
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

export async function recordConsent(db, userId, scope) {
  await recordConsentStmt(db, userId, scope).run();
}
