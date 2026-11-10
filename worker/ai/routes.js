// The two attendee routes the foundation itself needs (F21). Features add their own under /api/ai/<feature>.
//   GET /api/ai/status   what Settings shows: whether AI is on, the person's search choice and the allowances
//   PUT /api/ai/search   { ok: true | false }  the opt-out: "Let people I've connected with find me using AI search"
// Both need a signed-in person (a guest has a session too, and may set the choice for when they save their card;
// they cannot use AI itself, which callModel refuses). Nothing here calls a model or returns a key.
import { Hono } from "hono";
import { one } from "../db.js";
import { requireUser } from "../session.js";
import { bump, HOUR } from "../ratelimit.js";
import { AI_LIMITS } from "../plans.js";
import { aiConfig } from "./config.js";
import { getSettings } from "./store.js";
import { setAiSearchOk } from "./optout.js";

export const aiApp = new Hono();

const SHOWN = ["followup", "people_search", "who_to_meet"]; // what an attendee can use

aiApp.get("/api/ai/status", async (c) => {
  const u = requireUser(c);
  const db = c.env.DB;
  const [row, settings] = await Promise.all([one(db, "SELECT ai_search_ok FROM users WHERE id = ?", u.id), getSettings(db)]);
  const cfg = aiConfig(c.env);
  const configured = cfg.stub.allowed || (!!cfg.gatewayUrl && cfg.hasKey);
  return c.json({
    // "On" is the switch state only; whether this person is let in is shown by the feature itself.
    on: cfg.enabled && !settings.killed && configured,
    searchOk: row?.ai_search_ok !== 0,
    allowances: SHOWN.map((key) => ({ key, label: AI_LIMITS[key].label, free: AI_LIMITS[key].free, plus: AI_LIMITS[key].plus })),
  });
});

aiApp.put("/api/ai/search", async (c) => {
  const u = requireUser(c);
  const b = await c.req.json().catch(() => ({}));
  if (typeof b.ok !== "boolean") return c.json({ error: "ok must be true or false" }, 400);
  // A request with no session at all is given a throwaway guest by the session middleware (every write is). A guest with
  // no card has nothing to be found by, so that is refused here rather than saved.
  if (!(await one(c.env.DB, "SELECT 1 AS x FROM profiles WHERE user_id = ?", u.id))) return c.json({ error: "Make your card first.", code: "no_card" }, 403);
  if ((await bump(c.env.DB, `ai:optout:${u.id}`, HOUR)) > 20) return c.json({ error: "Too many changes. Try again later." }, 429);
  await setAiSearchOk(c.env.DB, u.id, b.ok);
  return c.json({ ok: true, searchOk: b.ok });
});
