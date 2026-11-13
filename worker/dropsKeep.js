// F32: how long drops are kept, and what a host's own data download says about them.
//
// Retention (proposed by the build, the owner confirms): given items, unused lists and voucher uses are deleted
// 30 days after the event ends. "Ends" is the same moment the event's status uses (src/lib/eventstatus.js,
// worker/presence.js eventEndsAt): the host's end or the end time, whichever is first; with neither, 12 hours
// after the later of the start and the last check-in. The drop's title and its counts stay, so the host's
// history reads "120 were loaded and 37 given". An account's given items go with the account: the trigger in
// migration 0029 deletes an exclusive item when its give row goes.
import { all } from "./db.js";
import { eventEndsAt } from "./presence.js";
import { DROP_KEEP_MS } from "./drops.js";

const AUDIT_KEEP_MS = 365 * 86400_000;

/** The daily purge. Safe to run again. Returns how many drops it cleared. */
export async function purgeDrops(db, ts = Date.now()) {
  await db.prepare("DELETE FROM drop_audit WHERE at < ?").bind(ts - AUDIT_KEEP_MS).run();
  const rows = await all(
    db,
    `SELECT d.id, e.starts_at, e.ends_at, e.ended_at, e.created_at,
            (SELECT MAX(ch.created_at) FROM checkins ch WHERE ch.event_id = e.id) AS last_in
     FROM drops d JOIN events e ON e.id = d.event_id
     WHERE d.purged_at IS NULL
       AND (e.ended_at <= ?1 OR e.ends_at <= ?1 OR (e.ended_at IS NULL AND e.ends_at IS NULL AND COALESCE(e.starts_at, 0) <= ?1))
     ORDER BY d.created_at LIMIT 500`,
    ts - DROP_KEEP_MS
  );
  const due = rows.filter((r) => ts >= eventEndsAt(r, r.last_in || r.created_at) + DROP_KEEP_MS);
  for (const r of due) {
    // The counts are written first (in the same batch, before the rows go), then everything given or loaded goes.
    await db.batch([
      db.prepare(
        `UPDATE drops SET purged_at = ?2, pin_mac = NULL, check_cipher = NULL,
           final_loaded = (SELECT COUNT(*) FROM drop_items WHERE drop_id = ?1),
           final_given = (SELECT COUNT(*) FROM drop_gives WHERE drop_id = ?1),
           final_used = (SELECT COUNT(*) FROM voucher_uses WHERE drop_id = ?1) WHERE id = ?1`
      ).bind(r.id, ts),
      db.prepare("DELETE FROM drop_gives WHERE drop_id = ?").bind(r.id),
      db.prepare("DELETE FROM drop_items WHERE drop_id = ?").bind(r.id),
      db.prepare("DELETE FROM voucher_uses WHERE drop_id = ?").bind(r.id),
    ]);
  }
  return due.length;
}

/**
 * The drops of every event in a host account's organisations, for the host's own data download: what each is and
 * its counts, and the host's own audit trail. No item, no PIN, no name. Null when there is nothing.
 */
export async function exportHostDrops(db, hostAccountId) {
  const drops = await all(
    db,
    `SELECT d.id, d.event_id, e.name AS event_name, d.kind, d.title, d.note, d.status, d.reuse, d.per_person, d.valid_from, d.valid_until, d.created_at, d.purged_at,
            d.final_loaded, d.final_given, d.final_used,
            (SELECT COUNT(*) FROM drop_items i WHERE i.drop_id = d.id) AS loaded,
            (SELECT COUNT(*) FROM drop_gives g WHERE g.drop_id = d.id) AS given,
            (SELECT COUNT(*) FROM voucher_uses u WHERE u.drop_id = d.id) AS used
     FROM drops d JOIN events e ON e.id = d.event_id JOIN host_org_members m ON m.org_id = e.org_id
     WHERE m.host_account_id = ? ORDER BY d.created_at`,
    hostAccountId
  );
  const audit = await all(db, "SELECT event_id, drop_id, action, n, at FROM drop_audit WHERE host_account_id = ? ORDER BY at", hostAccountId);
  if (!drops.length && !audit.length) return null;
  return {
    note: "Your drops and their counts. The items themselves are never in this download, and nothing here names who was given what.",
    drops: drops.map((d) => ({
      eventId: d.event_id, eventName: d.event_name, kind: d.kind, title: d.title, note: d.note, status: d.status, createdAt: d.created_at,
      validFrom: d.valid_from || null, validUntil: d.valid_until || null,
      ...(d.kind === "voucher" ? { usesPerPerson: d.per_person } : {}),
      ...(d.purged_at ? { clearedAt: d.purged_at, loaded: d.final_loaded, given: d.final_given, used: d.final_used }
        : d.kind === "voucher" ? { used: d.used } : { loaded: d.loaded, given: d.given }),
    })),
    audit,
  };
}
