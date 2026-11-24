// Feature stages and tutorials (F59, D055): the Worker's side. A stage is a short tutorial the app shows when a feature
// has become useful to someone. The app decides which one is due from the counts here; this file keeps what must hold
// whatever a client sends: a stage shows once per account (on any device), never two on one calendar day, only ids we
// know, and the funnel is counts only.
//   GET    /api/stages            { eligible, shownToday, seen: [id], progress: { counts and two yes/no answers } }
//   POST   /api/stages/:id/seen   { outcome?: "finished" | "skipped" }  the tutorial started (no body), or how it ended
//   DELETE /api/stages            "Show tips again": forget what this account has been shown (nobody else's)
// Signed out is a 401 (no guest is made for these routes). `progress` is about the person themselves: how many connections
// they have, how many events they checked in to, how many cards, and whether AI is on for them. Nothing about another
// person, no names and no ids. AI "on" is worked out from the same rules callModel uses and never calls a model.
import { Hono } from "hono";
import { now, one, all, run } from "./db.js";
import { requireUser } from "./session.js";
import { bump, HOUR } from "./ratelimit.js";
import { hasConsent, termsScope } from "./legal.js";
import { AI_LIMITS } from "./plans.js";
import { aiConfig } from "./ai/config.js";
import { getSettings } from "./ai/store.js";
import { resolveActor, allowedByRollout } from "./ai/client.js";
import { STAGE_IDS } from "../src/lib/stages.js";

export const stagesApp = new Hono();

export const SEEN_LIMIT = 40;   // writes an hour for one person (a tutorial makes two)
export const READ_LIMIT = 240;  // reads an hour
export const FUNNEL_KEEP_MS = 400 * 86400000; // as the welcome-steps counts: no personal data, but not kept for ever
const OUTCOMES = ["finished", "skipped"];
const DAY_MS = 86400000;

const dayOf = (t = now()) => new Date(t).toISOString().slice(0, 10);
// "A calendar day" is the UTC day, the same one the quotas and the daily counts use.
const dayStart = (t = now()) => Math.floor(t / DAY_MS) * DAY_MS;

/** Is AI on for this person for this feature? The same checks callModel makes before it spends anything, without calling it. */
export async function aiOnFor(env, userId, feature) {
  const cfg = aiConfig(env);
  if (!cfg.enabled) return false;
  if (cfg.stub.requested && !cfg.stub.allowed) return false;
  if (!cfg.stub.allowed && (!cfg.gatewayUrl || !cfg.hasKey)) return false;
  const settings = await getSettings(env.DB);
  if (settings.killed) return false;
  const who = await resolveActor(env.DB, { kind: "user", id: userId });
  if (!who || !AI_LIMITS[feature]?.[who.tier]) return false;
  return allowedByRollout(settings, who);
}

/** Counts about this person, for the app to decide which tutorial is due. */
export async function progressOf(env, userId) {
  const db = env.DB;
  const [conn, ev, cards, aiFinder, aiDraft] = await Promise.all([
    // The same join as the People list, so a figure here is never more than the list shows.
    one(db, `SELECT COUNT(*) AS n FROM connections cn JOIN profiles p ON p.user_id = CASE WHEN cn.user_a = ?1 THEN cn.user_b ELSE cn.user_a END
             WHERE cn.user_a = ?1 OR cn.user_b = ?1`, userId),
    one(db, "SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?", userId),
    one(db, "SELECT COUNT(*) AS n FROM cards WHERE user_id = ?", userId),
    aiOnFor(env, userId, "people_search"),
    aiOnFor(env, userId, "followup"),
  ]);
  return { connections: conn?.n || 0, events: ev?.n || 0, cards: cards?.n || 0, aiFinder, aiDraft };
}

/** True when the person may be taught anything yet: a card, the welcome steps finished, this version of the Terms agreed. */
async function eligible(db, userId) {
  const p = await one(db, "SELECT onboarding_step AS step FROM profiles WHERE user_id = ?", userId);
  if (!p || p.step != null) return false;
  return hasConsent(db, userId, termsScope());
}

stagesApp.get("/api/stages", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `stages:r:${u.id}`, HOUR)) > READ_LIMIT) return c.json({ error: "Too many requests. Try again in a little while.", code: "throttled" }, 429);
  const [ok, rows, today] = await Promise.all([
    eligible(db, u.id),
    all(db, "SELECT stage FROM user_stages WHERE user_id = ?", u.id),
    one(db, "SELECT 1 AS x FROM user_stages WHERE user_id = ? AND seen_at >= ?", u.id, dayStart()),
  ]);
  return c.json({
    eligible: ok,
    shownToday: !!today,
    seen: rows.map((r) => r.stage),
    progress: ok ? await progressOf(c.env, u.id) : null,
  });
});

const count = (db, stage, col) => run(db,
  `INSERT INTO stage_stats (day, stage, ${col}) VALUES (?, ?, 1) ON CONFLICT(day, stage) DO UPDATE SET ${col} = ${col} + 1`,
  dayOf(), stage);

stagesApp.post("/api/stages/:id/seen", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const stage = c.req.param("id");
  if (!STAGE_IDS.includes(stage)) return c.json({ error: "That tip isn't recognised. Reload the page and try again.", code: "unknown_stage" }, 400);
  const body = await c.req.json().catch(() => ({}));
  const outcome = body && body.outcome !== undefined ? body.outcome : null;
  if (outcome !== null && !OUTCOMES.includes(outcome)) return c.json({ error: "That isn't a way a tip can end.", code: "bad_outcome" }, 400);
  if ((await bump(db, `stages:w:${u.id}`, HOUR)) > SEEN_LIMIT) return c.json({ error: "Too many tips in an hour. Try again later.", code: "throttled" }, 429);
  if (!(await eligible(db, u.id))) return c.json({ error: "Finish your card first, then try again.", code: "not_ready" }, 403);

  const existing = await one(db, "SELECT outcome FROM user_stages WHERE user_id = ? AND stage = ?", u.id, stage);
  if (outcome) {
    // How it ended: the first answer is kept, a repeat changes nothing and is not counted again.
    if (!existing) return c.json({ error: "That tip has not been shown yet.", code: "not_seen" }, 404);
    const r = await run(db, "UPDATE user_stages SET outcome = ? WHERE user_id = ? AND stage = ? AND outcome IS NULL", outcome, u.id, stage);
    if (r.meta.changes === 1) await count(db, stage, outcome);
    return c.json({ ok: true });
  }
  if (existing) return c.json({ ok: true, first: false }); // already seen: twice is one row
  // One statement: the row goes in only when no other tip was started today, so two devices asking at once cannot both win.
  const r = await run(db,
    `INSERT INTO user_stages (user_id, stage, seen_at) SELECT ?1, ?2, ?3
     WHERE NOT EXISTS (SELECT 1 FROM user_stages WHERE user_id = ?1 AND seen_at >= ?4)
     ON CONFLICT(user_id, stage) DO NOTHING`,
    u.id, stage, now(), dayStart());
  if (r.meta.changes !== 1) {
    const again = await one(db, "SELECT 1 AS x FROM user_stages WHERE user_id = ? AND stage = ?", u.id, stage);
    if (again) return c.json({ ok: true, first: false }); // the same tip from another device won a moment ago
    return c.json({ error: "One tip a day. This one can wait until tomorrow.", code: "one_a_day" }, 409);
  }
  await count(db, stage, "shown");
  return c.json({ ok: true, first: true });
});

stagesApp.delete("/api/stages", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  if ((await bump(db, `stages:w:${u.id}`, HOUR)) > SEEN_LIMIT) return c.json({ error: "Too many changes in an hour. Try again later.", code: "throttled" }, 429);
  await run(db, "DELETE FROM user_stages WHERE user_id = ?", u.id);
  return c.json({ ok: true });
});

/** For the data download: which tips this person has been shown and how each ended. */
export async function exportStages(db, userId) {
  const rows = await all(db, "SELECT stage, seen_at AS seenAt, outcome FROM user_stages WHERE user_id = ? ORDER BY seen_at", userId);
  return rows.length ? rows : null;
}

/** The admin funnel: per stage, summed over the last `days` days. Counts only; nothing says who. */
export async function stageFunnel(db, days = 30) {
  const since = dayOf(now() - (days - 1) * DAY_MS);
  const rows = await all(db,
    "SELECT stage, SUM(shown) AS shown, SUM(finished) AS finished, SUM(skipped) AS skipped FROM stage_stats WHERE day >= ? GROUP BY stage", since);
  const by = new Map(rows.map((r) => [r.stage, r]));
  return {
    days, since,
    stages: STAGE_IDS.map((id) => ({ stage: id, shown: by.get(id)?.shown || 0, finished: by.get(id)?.finished || 0, skipped: by.get(id)?.skipped || 0 })),
  };
}

/** The daily clean-up: counts older than the funnel keeps. */
export const purgeStageStats = (db, ts = now()) => run(db, "DELETE FROM stage_stats WHERE day < ?", dayOf(ts - FUNNEL_KEEP_MS));
