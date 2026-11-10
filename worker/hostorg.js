// Rules shared by the host portal and the admin tool: which emails qualify for
// which kind of organisation, and the one place ownership actually moves.
import { newId, now } from "./db.js";

export const normEmail = (v) => String(v || "").trim().toLowerCase().slice(0, 120);
export const validEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "pm.me", "gmx.com", "gmx.co.uk", "mail.com", "zoho.com", "qq.com", "163.com",
]);

/** "education" (ac.uk, .edu, edu.xx, ac.xx), "free" (webmail) or "other". */
export function emailKind(email) {
  const domain = normEmail(email).split("@")[1] || "";
  if (!domain) return "other";
  if (/(^|\.)(ac|edu)\.[a-z]{2}$/.test(domain) || /\.edu$/.test(domain) || /\.sch\.uk$/.test(domain)) return "education";
  if (FREE_MAIL.has(domain)) return "free";
  return "other";
}

/** The email rule for each kind of organisation, as an error message or "". */
export function emailProblem(orgType, email) {
  const kind = emailKind(email);
  if (orgType === "society" || orgType === "institution") {
    return kind === "education" ? "" : "Student societies and institutions must use their university or school email (for example name@university.ac.uk).";
  }
  if (orgType === "company") {
    return kind === "free" ? "Use your work email, not a personal webmail address." : "";
  }
  return "";
}

/**
 * Hands an organisation to another host account. The only place ownership
 * changes, whether the old owner started it or an admin approved a ticket.
 * Billing follows the new owner's email.
 */
export async function moveOwnership(db, org, to, transferId) {
  const ts = now();
  await db.batch([
    db.prepare("DELETE FROM host_org_members WHERE org_id = ? AND (role = 'owner' OR host_account_id = ?)").bind(org.id, to.id),
    db.prepare("INSERT INTO host_org_members (org_id, host_account_id, role, created_at) VALUES (?, ?, 'owner', ?)").bind(org.id, to.id, ts),
    db.prepare("UPDATE orgs SET leader_name = ?, leader_email = ?, billing_email = ? WHERE id = ?")
      .bind(to.full_name, to.email, to.email, org.id),
    db.prepare("UPDATE host_org_transfers SET status = 'accepted', resolved_at = ? WHERE id = ?").bind(ts, transferId),
    db.prepare("UPDATE host_org_transfers SET status = 'cancelled', resolved_at = ? WHERE org_id = ? AND status = 'pending' AND id != ?")
      .bind(ts, org.id, transferId),
  ]);
}

/** Opens a pending transfer from the org's owner to the host account `to`, replacing any earlier one. */
export async function openTransfer(db, org, fromHostId, to) {
  const id = newId();
  const ts = now();
  await db.batch([
    db.prepare("UPDATE host_org_transfers SET status = 'cancelled', resolved_at = ? WHERE org_id = ? AND status = 'pending'").bind(ts, org.id),
    db.prepare("INSERT INTO host_org_transfers (id, org_id, from_host_id, to_host_id, to_email, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
      .bind(id, org.id, fromHostId, to.id, to.email, ts),
  ]);
  return id;
}
