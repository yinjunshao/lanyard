// Onboarding progress (F14). A person's place in the welcome steps is kept on
// their profile (onboarding_step), so it resumes on any device. The funnel is a
// table of daily counts with nothing about who (onboarding_stats).
import { now, one } from "./db.js";

export const LAST_STEP = 6;

const dayOf = (t = now()) => new Date(t).toISOString().slice(0, 10);

// Where someone is: null when they are not in onboarding (every profile made
// before F14, and anyone who has finished).
export async function onboardingOf(db, userId) {
  const p = await one(db, "SELECT onboarding_step AS step, onboarding_max AS max FROM profiles WHERE user_id = ?", userId);
  return p ? { step: p.step ?? null, max: p.max || 0 } : null;
}

// Move to `step` (1 to 6), or finish (`step` = null). Returns the new place, or
// null when the person is not in onboarding (nothing changes and nothing is counted,
// so a later visit from "Finish your card" cannot distort the funnel).
export async function moveTo(db, userId, step) {
  const cur = await onboardingOf(db, userId);
  if (!cur || cur.step === null) return null;
  const finishing = step === null;
  const to = finishing ? LAST_STEP : Math.min(Math.max(Math.trunc(step), 1), LAST_STEP);
  const stmts = [];
  const day = dayOf();
  const count = (s, reached, completed) => stmts.push(
    db.prepare(
      `INSERT INTO onboarding_stats (day, step, reached, completed) VALUES (?, ?, ?, ?)
       ON CONFLICT(day, step) DO UPDATE SET reached = reached + excluded.reached, completed = completed + excluded.completed`
    ).bind(day, s, reached, completed)
  );
  // Only the first time a step is reached counts, so Back and forward do not add up.
  for (let s = cur.max + 1; s <= to; s++) count(s, 1, 0);
  for (let s = Math.max(cur.max, 1); s < to; s++) count(s, 0, 1);
  if (finishing) count(LAST_STEP, 0, 1);
  const max = Math.max(cur.max, to);
  stmts.push(db.prepare("UPDATE profiles SET onboarding_step = ?, onboarding_max = ? WHERE user_id = ?")
    .bind(finishing ? null : to, finishing ? LAST_STEP + 1 : max, userId));
  await db.batch(stmts);
  return { step: finishing ? null : to, max };
}

// The funnel for the admin page: the last `days` days, summed per step.
export async function funnel(db, days = 30) {
  const since = dayOf(now() - (days - 1) * 86400000);
  const rows = (await db.prepare(
    "SELECT step, SUM(reached) AS reached, SUM(completed) AS completed FROM onboarding_stats WHERE day >= ? GROUP BY step ORDER BY step"
  ).bind(since).all()).results;
  return { days, since, steps: rows.map((r) => ({ step: r.step, reached: r.reached || 0, completed: r.completed || 0 })) };
}
