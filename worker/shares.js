// What each person in a connection shares with the other (table connection_shares, migration 0034).
//
//   The card owner shares the card that was scanned, with every link it shows.
//   The scanner picks one of their own cards in the connect sheet and which of its links to include. Its "What I do"
//   and "About" are the card's own (a card can carry its own versions of both), so choosing a card is choosing those.
//
// The rule for "the card user X shares in connection cn", used everywhere one person's side is shown to the other:
//   1. X's row in connection_shares, if that card still exists and is X's;
//   2. else the card the connection was made through, if it is X's (connections made before this table);
//   3. else X's default card.
// The link choice in X's row is applied whichever card is used, so a deleted card never widens what they picked.
import { all, one, now } from "./db.js";

/** SQL for the id of the card `peer` shares in the connection aliased `cn`. `peer` is an SQL expression. */
export const SHARED_CARD_SQL = (peer) => `COALESCE(
  (SELECT s.card_id FROM connection_shares s JOIN cards cs ON cs.id = s.card_id AND cs.user_id = s.user_id
    WHERE s.connection_id = cn.id AND s.user_id = ${peer}),
  (SELECT c2.id FROM cards c2 WHERE c2.id = cn.card_id AND c2.user_id = ${peer}),
  (SELECT c3.id FROM cards c3 WHERE c3.user_id = ${peer} AND c3.is_default = 1))`;

/** SQL for the link choice (JSON or NULL) `peer` made in the connection aliased `cn`. */
export const SHARED_LINKS_SQL = (peer) => `(SELECT s.links FROM connection_shares s WHERE s.connection_id = cn.id AND s.user_id = ${peer})`;

export function parseLinks(v) {
  if (v === null || v === undefined || v === "") return null;
  try {
    const a = typeof v === "string" ? JSON.parse(v) : v;
    return Array.isArray(a) ? a.filter((x) => typeof x === "string") : null;
  } catch { return null; }
}

/** A links object cut down to the chosen labels. null means no choice was made: every link stays. */
export function onlyLinks(links, chosen) {
  if (!chosen) return links || {};
  const keep = new Set(chosen);
  return Object.fromEntries(Object.entries(links || {}).filter(([k]) => keep.has(k)));
}

/** { card, links } that `userId` shares in `cn`: the card row (or null) and their link choice (or null for all). */
export async function shareOf(db, cn, userId) {
  const row = await one(db, "SELECT card_id, links FROM connection_shares WHERE connection_id = ? AND user_id = ?", cn.id, userId);
  const links = parseLinks(row?.links);
  if (row) {
    const card = await one(db, "SELECT * FROM cards WHERE id = ? AND user_id = ?", row.card_id, userId);
    if (card) return { card, links };
  }
  if (cn.card_id) {
    const card = await one(db, "SELECT * FROM cards WHERE id = ? AND user_id = ?", cn.card_id, userId);
    if (card) return { card, links };
  }
  const card = await one(db, "SELECT * FROM cards WHERE user_id = ? ORDER BY is_default DESC, created_at LIMIT 1", userId);
  return { card: card || null, links };
}

/** Each listed person's link choice in each connection: Map "connId:userId" -> links | null. One query. */
export async function linkChoices(db, connectionIds) {
  if (!connectionIds.length) return new Map();
  const rows = await all(db, "SELECT connection_id, user_id, links FROM connection_shares WHERE connection_id IN (SELECT value FROM json_each(?))", JSON.stringify(connectionIds));
  return new Map(rows.map((r) => [`${r.connection_id}:${r.user_id}`, parseLinks(r.links)]));
}

export const setShareStmt = (db, connectionId, userId, cardId, links) => db.prepare(
  `INSERT INTO connection_shares (connection_id, user_id, card_id, links, updated_at) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(connection_id, user_id) DO UPDATE SET card_id = excluded.card_id, links = excluded.links, updated_at = excluded.updated_at`
).bind(connectionId, userId, cardId, links ? JSON.stringify(links) : null, now());

/**
 * The scanner's choice from the request, checked against their own cards. Returns { cardId, links } or null when
 * nothing (or nothing usable) was sent. links is null when every link on the card is kept.
 *   share:   { cardId, links: [label, ...] }   from the browser
 *   cards:   the scanner's card rows;  linksOf(card) -> the { label: url } that card shows
 */
export function readShare(share, cards, linksOf) {
  if (!share || typeof share !== "object" || typeof share.cardId !== "string") return null;
  const card = cards.find((c) => c.id === share.cardId);
  if (!card) return null;
  const onCard = Object.keys(linksOf(card) || {});
  if (!Array.isArray(share.links)) return { cardId: card.id, links: null };
  const picked = onCard.filter((k) => share.links.includes(k));
  return { cardId: card.id, links: picked.length === onCard.length ? null : picked };
}
