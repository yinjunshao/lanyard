// F32: drops for codes, keys and vouchers. This file holds the rules; the routes are in dropsHost.js (the
// host's side, on the host site) and dropsApp.js (an attendee's side); dropcrypto.js holds the encryption.
//
// Rules, in one place:
//   - A drop belongs to one event. Kinds: "same" (one value for everyone), "one_each" (the next unused item
//     from a pasted list, to one person only), "random" (a random item from the list, with or without reuse),
//     "voucher" (a per-person number of uses that staff mark with a PIN).
//   - Items are sealed with DROP_KEY before they are stored (dropcrypto.js). Nothing here puts an item in a
//     log line, an error message, a host response or an export. The only readers are the person it was given
//     to (reveal, their own data export) and, for items nobody has been given, the host's own download.
//   - Giving is one conditional INSERT (CLAIM below). It refuses unless the drop is on, inside its window, the
//     person has nothing from this drop yet and (for an item that goes to one person) the item is still free.
//     The unique constraints in migration 0029 are the second lock: one give per person per drop, and one give
//     per exclusive item.
import { all, newId, one, run } from "./db.js";
import { HttpError } from "./session.js";
import { sealItem, openItem, pinMac, dropsReady, unavailable } from "./dropcrypto.js";

export const KINDS = ["same", "one_each", "random", "voucher"];
export const MAX_ITEMS = 2000;       // per drop
export const MAX_ITEM_LEN = 600;
export const MAX_DROPS = 30;         // per event
export const TITLE_MAX = 60;
export const NOTE_MAX = 200;
export const MAX_PER_PERSON = 10;
export const DROP_KEEP_MS = 30 * 86400_000; // given items, unused lists and voucher uses go this long after the event ends (owner to confirm)

const CHECK_PHRASE = "lanyard-drop-check";
const CHECK_ID = "check";
const BATCH_ROWS = 19; // 5 values per row, under D1's 100 bound values per statement

/* -------------------------------- reading input -------------------------------- */

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const text = (v, n) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** A title or a note: one line, no control characters. */
export const cleanTitle = (v) => text(v, TITLE_MAX).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
export const cleanNote = (v) => text(v, NOTE_MAX).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");

/**
 * The items a host pasted: one per line (or an array of strings), trimmed, blank lines dropped, exact
 * repeats dropped. A line that is too long or holds a control character is refused by its line NUMBER, never
 * by its value, so an error can't carry a secret.
 */
export function readItems(raw) {
  let lines;
  if (Array.isArray(raw)) lines = raw;
  else if (typeof raw === "string") lines = raw.split(/\r\n|\r|\n/);
  else throw new HttpError(400, "Paste the items, one on each line.", "bad_items");
  if (lines.length > MAX_ITEMS * 5) throw new HttpError(400, `That is too many lines. A drop holds up to ${MAX_ITEMS} items.`, "too_many");
  const seen = new Set();
  const items = [];
  let duplicates = 0;
  lines.forEach((l, i) => {
    if (typeof l !== "string") throw new HttpError(400, `Line ${i + 1} is not text.`, "bad_items");
    const t = l.trim();
    if (!t) return;
    if (t.length > MAX_ITEM_LEN) throw new HttpError(400, `Line ${i + 1} is longer than ${MAX_ITEM_LEN} characters.`, "bad_items");
    if (CONTROL.test(t)) throw new HttpError(400, `Line ${i + 1} has a control character in it.`, "bad_items");
    if (seen.has(t)) { duplicates += 1; return; }
    seen.add(t);
    items.push(t);
  });
  if (items.length > MAX_ITEMS) throw new HttpError(400, `That is ${items.length} items. A drop holds up to ${MAX_ITEMS}.`, "too_many");
  return { items, duplicates };
}

const ms = (v, name) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 946684800000 || n > 4102444800000) throw new HttpError(400, `That ${name} time is not a real date.`, "bad_window");
  return Math.round(n);
};

/** The valid-from and valid-until moments, checked: both optional, until after from. */
export function readWindow(b) {
  const from = ms(b.validFrom, "start");
  const until = ms(b.validUntil, "end");
  if (from && until && until <= from) throw new HttpError(400, "The end time must be after the start.", "bad_window");
  return { from, until };
}

/** Six random digits, for a voucher's staff PIN. */
export const newPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");

/* ---------------------------------- creating ---------------------------------- */

export const itemRows = (dropId, sealed, firstSeq, ts) => {
  const out = [];
  for (let i = 0; i < sealed.length; i += BATCH_ROWS) {
    const part = sealed.slice(i, i + BATCH_ROWS);
    out.push({
      sql: `INSERT INTO drop_items (id, drop_id, seq, cipher, created_at) VALUES ${part.map(() => "(?,?,?,?,?)").join(",")}`,
      args: part.flatMap((s, j) => [s.id, dropId, firstSeq + i + j, s.cipher, ts]),
    });
  }
  return out;
};

export async function sealAll(env, dropId, items) {
  const out = [];
  for (const plain of items) {
    const id = newId() + newId();
    out.push({ id, cipher: await sealItem(env, dropId, id, plain) });
  }
  return out;
}

export async function insertItems(db, rows) {
  for (let i = 0; i < rows.length; i += 20) {
    await db.batch(rows.slice(i, i + 20).map((r) => db.prepare(r.sql).bind(...r.args)));
  }
}

/**
 * Makes a drop in `ev` from a host's request body. Everything is checked and sealed before anything is
 * written; if the writing fails halfway the drop is removed again. Returns { id, pin? }, where the PIN
 * (vouchers only) is shown to the host once and is not recoverable.
 */
export async function createDrop(env, ev, b, ts = Date.now()) {
  if (!dropsReady(env)) throw unavailable();
  const db = env.DB;
  const kind = String(b.kind || "");
  if (!KINDS.includes(kind)) throw new HttpError(400, "Choose what kind of drop this is.", "bad_kind");
  const title = cleanTitle(b.title);
  if (title.length < 2) throw new HttpError(400, "Give the drop a title, for example Wi-Fi password.", "bad_title");
  const note = cleanNote(b.note);
  const win = readWindow(b);
  if (((await one(db, "SELECT COUNT(*) AS n FROM drops WHERE event_id = ?", ev.id))?.n || 0) >= MAX_DROPS) {
    throw new HttpError(400, `An event can have up to ${MAX_DROPS} drops.`, "too_many_drops");
  }

  let plain = [];
  let reuse = 0;
  let perPerson = 1;
  let pin = null;
  let duplicates = 0;
  if (kind === "same") {
    const v = typeof b.value === "string" ? b.value.trim() : "";
    if (!v) throw new HttpError(400, "Type the text everyone gets.", "bad_items");
    if (v.length > MAX_ITEM_LEN || CONTROL.test(v)) throw new HttpError(400, `The text must be one line of up to ${MAX_ITEM_LEN} characters.`, "bad_items");
    plain = [v];
    reuse = 1;
  } else if (kind === "one_each" || kind === "random") {
    const r = readItems(b.items);
    if (!r.items.length) throw new HttpError(400, "Paste at least one item.", "bad_items");
    plain = r.items;
    duplicates = r.duplicates;
    reuse = kind === "random" && b.reuse === true ? 1 : 0;
  } else {
    const n = Number(b.perPerson ?? 1);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PER_PERSON) throw new HttpError(400, `A voucher can be used 1 to ${MAX_PER_PERSON} times by each person.`, "bad_count");
    perPerson = n;
  }

  const id = newId() + newId();
  if (kind === "voucher") pin = newPin();
  const sealed = await sealAll(env, id, plain);
  const check = await sealItem(env, id, CHECK_ID, CHECK_PHRASE);
  const mac = pin ? await pinMac(env, id, pin) : null;
  await run(
    db,
    `INSERT INTO drops (id, event_id, kind, title, note, reuse, per_person, valid_from, valid_until, status, pin_mac, check_cipher, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'on', ?, ?, ?, ?)`,
    id, ev.id, kind, title, note, reuse, perPerson, win.from, win.until, mac, check, ts, ts
  );
  try {
    await insertItems(db, itemRows(id, sealed, 1, ts));
  } catch (e) {
    await run(db, "DELETE FROM drops WHERE id = ?", id).catch(() => {});
    throw e;
  }
  return { id, pin, loaded: sealed.length, duplicates };
}

/* ---------------------------------- giving ---------------------------------- */

/** Where a drop stands for giving something new, at moment `ts`: open, stopped, soon (before it starts), closed (after it ends), gone. */
export function openness(d, ts) {
  if (d.purged_at) return "gone";
  if (d.status !== "on") return "stopped";
  if (d.valid_from && d.valid_from > ts) return "soon";
  if (d.valid_until && d.valid_until <= ts) return "closed";
  return "open";
}

const WHY = {
  stopped: () => new HttpError(409, "The organisers have stopped this drop. Nothing new is being given out.", "stopped"),
  soon: () => new HttpError(409, "This drop hasn't started yet.", "not_yet"),
  closed: () => new HttpError(409, "This drop has finished.", "closed"),
  gone: () => new HttpError(410, "This drop has been cleared away.", "gone"),
};

/** Throws the plain refusal for a drop that is not giving or taking anything right now (stopped, not started, finished, cleared). */
export function assertOpen(d, ts = Date.now()) {
  const why = openness(d, ts);
  if (why !== "open") throw WHY[why]();
}

/**
 * The single conditional write that gives a person an item. It inserts a row only when every rule holds
 * at the moment it runs: the drop is on and unexpired, this person has nothing from the drop (not even a
 * withdrawn item), and an item exists that is still free (for an item that goes to one person only: one
 * nobody has). One-each takes the next in the host's order; random takes any free one at random.
 */
const claimSql = (exclusive, ordered) => `
INSERT INTO drop_gives (id, drop_id, user_id, item_id, exclusive, given_at)
SELECT ?1, d.id, ?3, i.id, ${exclusive ? 1 : 0}, ?4
FROM drops d JOIN drop_items i ON i.drop_id = d.id
WHERE d.id = ?2 AND d.status = 'on' AND d.purged_at IS NULL
  AND (d.valid_from IS NULL OR d.valid_from <= ?4) AND (d.valid_until IS NULL OR d.valid_until > ?4)
  AND i.cipher != ''
  ${exclusive ? "AND NOT EXISTS (SELECT 1 FROM drop_gives g WHERE g.item_id = i.id)" : ""}
  AND NOT EXISTS (SELECT 1 FROM drop_gives m WHERE m.drop_id = d.id AND m.user_id = ?3)
ORDER BY ${ordered ? "i.seq" : "random()"}
LIMIT 1`;

/** Does a drop of this kind give each item to one person only? */
export const isList = (d) => d.kind === "one_each" || d.kind === "random";
export const isExclusive = (d) => d.kind === "one_each" || (d.kind === "random" && !d.reuse);

export const mine = (db, dropId, userId) =>
  one(db, `SELECT g.id, g.item_id, g.given_at, g.revoked_at, g.replaced_at, i.cipher FROM drop_gives g JOIN drop_items i ON i.id = g.item_id
           WHERE g.drop_id = ? AND g.user_id = ?`, dropId, userId);

/**
 * "Show": gives this person their item if they have none yet, then opens and returns it. Checks nothing about
 * who the person is: the caller has already established they are signed in and checked in to the drop's event.
 * Throws HttpError with a code for every refusal (stopped, not_yet, closed, all_given, withdrawn, gone,
 * drops_unavailable, drops_unreadable).
 */
export async function revealItem(env, drop, userId, ts = Date.now()) {
  if (drop.kind === "voucher") throw new HttpError(400, "A voucher has nothing to reveal. Show the voucher to staff.", "not_an_item");
  const db = env.DB;
  let g = await mine(db, drop.id, userId);
  if (!g) {
    const why = openness(drop, ts);
    if (why !== "open") throw WHY[why]();
    // A wrong or missing key refuses here, before an item is used up.
    await openItem(env, drop.id, CHECK_ID, drop.check_cipher);
    const sql = claimSql(isExclusive(drop), drop.kind !== "random");
    try {
      await db.prepare(sql).bind(newId() + newId(), drop.id, userId, ts).run();
    } catch (e) {
      // A constraint refusing the write means someone else got there first: look again, below.
      if (!/UNIQUE|constraint/i.test(String(e?.message))) throw e;
    }
    g = await mine(db, drop.id, userId);
    if (!g) {
      // Nothing was written. If the drop changed under us (stopped, closed) say so; otherwise the items are used up.
      const now = await one(db, "SELECT status, valid_from, valid_until, purged_at FROM drops WHERE id = ?", drop.id);
      const why = now ? openness(now, ts) : "gone";
      throw why === "open" ? new HttpError(409, "All given out. There are none left.", "all_given") : WHY[why]();
    }
  }
  if (g.revoked_at) throw new HttpError(410, "The organisers withdrew this one.", "withdrawn");
  const value = await openItem(env, drop.id, g.item_id, g.cipher);
  return { value, givenAt: g.given_at, replacedAt: g.replaced_at || null };
}
