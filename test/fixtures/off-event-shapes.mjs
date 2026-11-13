// F31: what an event WITHOUT named attendance returns to everyone, as a list of field paths.
// The fixture off-event-shapes.json was made from the code as it stood before F31 (commit 0e8d599);
// test/named-attendance.mjs runs the same scenario now and requires the same answer, field for field.
import { makeEnv, becomeHost } from "../harness.mjs";

export const paths = (v, p = "") => {
  if (Array.isArray(v)) return v.length ? [...new Set(v.flatMap((x) => paths(x, p + "[]")))] : [p + "[]"];
  if (v && typeof v === "object") return Object.keys(v).sort().flatMap((k) => (v[k] && typeof v[k] === "object" ? [`${p}.${k}`, ...paths(v[k], `${p}.${k}`)] : [`${p}.${k}`]));
  return [];
};

export async function offShapes() {
  const T = await makeEnv();
  const host = T.client({ ip: "10.31.0.1", site: "host" });
  const info = await becomeHost(host, { kind: "company", name: "Shape Co" });
  T.env.DB.raw.prepare("INSERT INTO credits (id, org_id, events_granted, events_used, reason, created_at) VALUES ('cr-sh', ?, 80, 0, 'test', ?)").run(info.org.json.id, Date.now());
  const ev = (await host.post("/api/host/events", { name: "Shape night", venue: "Hall", startsAt: Date.now() + 3600e3, perks: ["Tea"], questions: [{ key: "extra1", label: "Course" }] })).json;
  const a = T.client({ ip: "10.31.0.2" }), b = T.client({ ip: "10.31.0.3" });
  const before = (await a.get(`/api/e/${ev.code}`)).json;
  for (const [c, n] of [[a, "Ann Shape"], [b, "Ben Shape"]]) {
    await c.post("/api/profile", { name: n, acceptTerms: true, over18: true });
    await c.post(`/api/e/${ev.code}/checkin`, { answers: { extra1: "Maths" }, directoryConsent: true });
  }
  const after = (await a.get(`/api/e/${ev.code}`)).json;
  const out = {
    eventBefore: paths(before), eventAfter: paths(after),
    live: paths((await host.get(`/api/host/events/${ev.id}/live`)).json),
    report: paths((await host.get(`/api/host/events/${ev.id}/report`)).json),
    csv: (await host.get(`/api/host/events/${ev.id}/report.csv`)).text.split("\r\n").map((r) => r.split(",").slice(0, 2).join("|")).filter((r) => !/^(Event\|(Name|Code|Starts)|Privacy)/.test(r)),
    myEvents: paths((await a.get("/api/my/events")).json),
    hub: paths((await a.get(`/api/my/events/${ev.id}`)).json),
    choices: paths((await a.get(`/api/e/${ev.id}/choices`)).json),
    userExport: Object.keys((await a.get("/api/account/export")).json).sort(),
    hostMe: paths((await host.get("/api/host/me")).json),
    hostExport: Object.keys((await host.get("/api/host/account/export")).json).sort(),
    checkinReply: (await T.client({ ip: "10.31.0.9" }).post(`/api/e/${ev.code}/checkin`, {})).status,
  };
  return out;
}
