// F70 (D062): the admin routes for platform metrics. Registered from admin.js after its middleware, so every one of
// them is refused without the admin token (401), counts against the try limit and is written to admin_audit.
//   GET  /api/admin/metrics                     { now, version, snapshots, first, last }   live totals; reads every account, so only on demand
//   POST /api/admin/metrics/snapshot            take today's row again (replaces it)       { ok, day, takenAt, snapshots }
//   GET  /api/admin/metrics/export?from=&to=    the archive as CSV, one row a day, one column a metric
// Everything here is numbers: see worker/metrics.js.
import { now, one, all } from "./db.js";
import { computeMetrics, snapshotMetrics, METRICS_VERSION } from "./metrics.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s) => { const t = DATE.test(s) ? Date.parse(s + "T00:00:00Z") : NaN; return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; };

/** One CSV cell. Quoted when it holds a comma, quote or line break; a cell that would start a formula in a spreadsheet
 *  (= + - @, or a tab or return) gets a leading apostrophe. Real values are numbers and never negative, so none is changed. */
export function csvCell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: [{ day, taken_at, version, data }] oldest first. The header is day,taken_at,version, then every metric seen, sorted. */
export function toCsv(rows) {
  const parsed = rows.map((r) => {
    let d = {};
    try { const j = JSON.parse(r.data); if (j && typeof j === "object" && !Array.isArray(j)) d = j; } catch { /* a bad row is empty cells */ }
    return { r, d };
  });
  const keys = [...new Set(parsed.flatMap((p) => Object.keys(p.d)))].sort();
  const line = (cells) => cells.map(csvCell).join(",");
  const out = [line(["day", "taken_at", "version", ...keys])];
  for (const { r, d } of parsed) {
    out.push(line([r.day, new Date(r.taken_at).toISOString(), r.version, ...keys.map((k) => (typeof d[k] === "number" ? d[k] : ""))]));
  }
  return out.join("\r\n") + "\r\n";
}

const summary = async (db) => {
  const s = await one(db, "SELECT COUNT(*) AS n, MIN(day) AS first, MAX(day) AS last FROM metrics_daily");
  return { snapshots: s.n, first: s.first || null, last: s.last || null };
};

export function registerMetricsAdmin(app) {
  app.get("/api/admin/metrics", async (c) => {
    const db = c.env.DB;
    return c.json({ now: await computeMetrics(db, now()), version: METRICS_VERSION, ...(await summary(db)) });
  });

  app.post("/api/admin/metrics/snapshot", async (c) => {
    const r = await snapshotMetrics(c.env, now(), { replace: true });
    return c.json({ ok: true, day: r.day, takenAt: r.takenAt, ...(await summary(c.env.DB)) });
  });

  app.get("/api/admin/metrics/export", async (c) => {
    const from = c.req.query("from") || "", to = c.req.query("to") || "";
    if ((from && !validDay(from)) || (to && !validDay(to))) return c.json({ error: "Dates must be real days written like 2026-11-30." }, 400);
    if (from && to && from > to) return c.json({ error: "The start date is after the end date." }, 400);
    const rows = await all(c.env.DB,
      "SELECT day, taken_at, version, data FROM metrics_daily WHERE (? = '' OR day >= ?) AND (? = '' OR day <= ?) ORDER BY day", from, from, to, to);
    const name = from && to ? `${from}-to-${to}` : from ? `from-${from}` : to ? `to-${to}` : "all";
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="lanyard-metrics-${name}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
