// Budget warnings: one email to the admin when a day's or a month's spend first passes 50% and 90% of the
// budget (AI Safety and Cost Plan, layer 7). Each warning is claimed in ai_daily.alerted before it is sent,
// so it goes once. Nothing is sent, or claimed, when AI_ALERT_EMAIL is not set: the admin page still shows
// the figures.
import { all, run } from "../db.js";
import { sendMail } from "../mail.js";
import { dayOf } from "./config.js";

const BITS = { day50: 1, day90: 2, month50: 4, month90: 8 };
const usd = (micros) => `$${(micros / 1e6).toFixed(micros >= 1e6 ? 2 : 4)}`;

export async function checkBudgetAlerts(env, cfg, db, spend, ts = Date.now()) {
  if (!cfg.alertEmail) return;
  const day = dayOf(ts);
  const monthStart = `${day.slice(0, 7)}-01`;
  const due = [];
  const add = (bit, label, used, budget, pct) => { if (budget > 0 && used * 100 >= budget * pct) due.push({ bit, label, used, budget, pct }); };
  add(BITS.day50, "today", spend.day, cfg.dailyBudgetMicros, 50);
  add(BITS.day90, "today", spend.day, cfg.dailyBudgetMicros, 90);
  add(BITS.month50, "this month", spend.month, cfg.monthlyBudgetMicros, 50);
  add(BITS.month90, "this month", spend.month, cfg.monthlyBudgetMicros, 90);
  for (const d of due) {
    let claimed;
    if (d.bit <= BITS.day90) {
      claimed = (await run(db, "UPDATE ai_daily SET alerted = alerted | ? WHERE day = ? AND (alerted & ?) = 0", d.bit, day, d.bit)).meta?.changes;
    } else {
      // Once a month: the bit may already be set on an earlier day's row.
      const done = (await all(db, "SELECT 1 AS x FROM ai_daily WHERE day >= ? AND (alerted & ?) != 0 LIMIT 1", monthStart, d.bit)).length;
      claimed = done ? 0 : (await run(db, "UPDATE ai_daily SET alerted = alerted | ? WHERE day = ?", d.bit, day)).meta?.changes;
    }
    if (!claimed) continue;
    const text = `AI spend for ${d.label} has passed ${d.pct}% of the budget: ${usd(d.used)} of ${usd(d.budget)}.\n\nAt 100% every AI feature switches to its non-AI version until the budget resets. Details are on the admin page.`;
    try { await sendMail(env, "accounts", { to: cfg.alertEmail, subject: `Lanyard AI spend at ${d.pct}% of the budget ${d.label}`, text, html: `<p>${text.replace(/\n\n/g, "</p><p>")}</p>` }); }
    catch (e) { console.error("ai budget alert not sent"); }
  }
}
