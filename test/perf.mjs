// Counts database queries per request (the main cost on D1) for common paths.
import { makeEnv } from "./harness.mjs";
const T = await makeEnv();
let n = 0;
const orig = T.env.DB.prepare;
T.env.DB.prepare = (sql) => { n++; return orig(sql); };
const count = async (fn) => { n = 0; await fn(); return n; };

const mk = async (name, ip) => {
  const c = T.client({ ip });
  await c.post("/api/profile", { name, acceptTerms: true, over18: true });
  const me = await c.get("/api/me");
  return { c, card: me.json.cards[0].cardId };
};
const me = await mk("Me", "10.0.0.1");
for (let i = 0; i < 30; i++) {
  const p = await mk("P" + i, "10.0.1." + i);
  await me.c.post("/api/connect", { cardId: p.card });
}
const anon = T.client();
console.log(JSON.stringify({
  staticPage: await count(() => anon.get("/")),
  meSignedIn: await count(() => me.c.get("/api/me")),
  connections30: await count(() => me.c.get("/api/connections")),
  publicCardAnon: await count(() => anon.get(`/api/c/${me.card}`)),
}));
