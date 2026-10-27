const BASE = "http://127.0.0.1:8787";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy1x+0AAAAASUVORK5CYII=";

function makeClient() {
  const cookie = new Map();
  function jar(headers) {
    for (const raw of headers.getSetCookie?.() || []) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      cookie.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  async function req(method, path, body) {
    const headers = { cookie: [...cookie].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    jar(res.headers);
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    return data;
  }
  return req;
}

const host = makeClient();
const attendee = makeClient();

await host("GET", "/api/me");
await attendee("GET", "/api/me");

await host("POST", "/api/profile", {
  name: "Selfie Host Final",
  uni: "UCL",
  tags: ["host", "careers"],
});
const event = await host("POST", "/api/host/events", { name: "Selfie Album Final" });
const { code, id: eventId } = event;
const hostCard = (await host("GET", "/api/me")).cards[0].cardId;

await attendee("POST", `/api/e/${code}/checkin`, {
  name: "Selfie Guest Final",
  directoryConsent: true,
});
await host("POST", `/api/e/${code}/checkin`, { directoryConsent: true });

const connected = await attendee("POST", "/api/connect", {
  cardId: hostCard,
  note: "Selfie event connect",
  eventId,
  selfieDataUrl: PNG,
  consent: true,
});
const album = await attendee("GET", `/api/e/${eventId}/album`);
const live = await host("GET", `/api/host/events/${eventId}/live`);
const report = await host("GET", `/api/host/events/${eventId}/report`);

if (!connected.ok) throw new Error("connect failed");
if (!album.photos?.[0]?.src.startsWith("/media/selfie/")) throw new Error("album missing selfie");
if (live.connections !== 1 || live.selfies !== 1) throw new Error("live totals wrong");
if (report.totals.connections !== 1 || report.totals.selfies !== 1) throw new Error("report totals wrong");

console.log(JSON.stringify({
  event: eventId,
  code,
  albumPhotos: album.photos.length,
  live,
  reportTotals: report.totals,
}, null, 2));
