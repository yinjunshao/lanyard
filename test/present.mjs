// F19: the host Present page and the printed poster. The QR (rendered and decoded back),
// the check-in address (the main site's, the same one the live tab uses), who can reach the
// page's data, that nothing per person is on it, and source guards for the page, the poster and
// the first-load budget. Run: node test/present.mjs
import { readFileSync } from "node:fs";
import jsQR from "jsqr";
import { makeEnv, check, summary, becomeHost } from "./harness.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// The address helpers read the page's own origin, as the browser does: here, the host site.
globalThis.__HOST_ORIGIN__ = "https://host.lanyard.test";
globalThis.location = { hostname: "host.lanyard.test", origin: "https://host.lanyard.test" };
const { joinUrl, joinText, feedbackUrl } = await import("../src/lib/checkinlink.js");
const { qrPath } = await import("../src/lib/qrpath.js");

// Draws the path the page draws (rects of 1 module), at `px` pixels per module, as RGBA.
function raster(text, px, blur = 0) {
  const { size, d } = qrPath(text);
  const W = size * px, img = new Uint8ClampedArray(W * W * 4).fill(255);
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [x, y, w] = [+m[1], +m[2], +m[3]];
    for (let yy = y * px; yy < (y + 1) * px; yy++) for (let xx = x * px; xx < (x + w) * px; xx++) {
      const i = (yy * W + xx) * 4; img[i] = img[i + 1] = img[i + 2] = 27;
    }
  }
  if (blur) { // a camera's softness: average each pixel with its neighbours, `blur` times
    for (let n = 0; n < blur; n++) {
      const src = img.slice();
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) for (let c = 0; c < 3; c++) {
        let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += src[((y + dy) * W + x + dx) * 4 + c];
        img[(y * W + x) * 4 + c] = s / 9;
      }
    }
  }
  return { data: img, width: W, height: W, size };
}
const decode = (text, px, blur) => { const r = raster(text, px, blur); return jsQR(r.data, r.width, r.height)?.data; };

console.log("\n# The check-in address");
check("the host site's check-in address is the MAIN site's /e/CODE, never host.*", joinUrl("ABCDE") === "https://lanyard.test/e/ABCDE" && !/\/\/host\./.test(joinUrl("ABCDE")), joinUrl("ABCDE"));
check("the spoken address drops https://", joinText("ABCDE") === "lanyard.test/e/ABCDE");
check("the feedback link is the main site's too", feedbackUrl("ABCDE") === "https://lanyard.test/e/ABCDE/feedback");
const live = read("src/views/HostLive.vue"), present = read("src/views/HostPresent.vue");
check("the live tab takes its QR address from the same helper", /import \{ joinUrl as joinLink[^}]*\} from "\.\.\/lib\/checkinlink"/.test(live) && live.includes("joinLink(live.value.event.code)"));
check("the Present page takes its QR and printed address from the same helper", /import \{[^}]*joinUrl[^}]*\} from "\.\.\/lib\/checkinlink"/.test(present) && present.includes("qrPath(joinUrl(ev.value.code))"));
check("neither page builds an address by hand", !/\/e\/\$\{/.test(live) && !/\/e\/\$\{/.test(present) && !/MAIN_ORIGIN|location\./.test(present));

console.log("\n# The QR, drawn from the path and read back");
const T = await makeEnv();
const { client, q1, env } = T;
const addresses = ["https://lanyard.test/e/ABCDE", "https://lanyd.fyi/e/GYM3T", "http://localhost:5173/e/ZZ9Z9", "https://lanyd.fyi/e/AB2CD/feedback"];
for (const a of addresses) {
  const p = qrPath(a), r = raster(a, 6);
  check(`${a}: reads back exactly, with a ${(p.size - p.modules) / 2}-module quiet zone`, jsQR(r.data, r.width, r.height)?.data === a && (p.size - p.modules) / 2 === 4);
}
{
  // How small can it get? A phone 3 m from a 1280 x 720 screen sees the 72 vh (518 px) code
  // at roughly a quarter of its size, a few pixels a module. Read it at 2 to 4 px a module, soft.
  const a = "https://lanyd.fyi/e/GYM3T", p = qrPath(a);
  const on720 = 0.72 * 720 / p.size;
  check(`on a 1280 x 720 screen a module is ${on720.toFixed(1)} px, so the code can be seen at a quarter of its size and still be 3 px a module`, on720 / 4 >= 3, on720);
  for (const px of [4, 3]) check(`reads at ${px} px a module (a soft, distant camera image)`, decode(a, px, 1) === a);
  check("reads at 2 px a module with no softness (the floor, for the report)", decode(a, 2, 0) === a);
}

console.log("\n# Who can reach the page's data (it reads the host-only /live route)");
const A = client({ ip: "10.90.0.1", site: "host" }), B = client({ ip: "10.90.0.2", site: "host" });
await becomeHost(A, { kind: "company", name: "Alpha Co", email: "a@alpha.example.com" });
await becomeHost(B, { kind: "company", name: "Beta Co", email: "b@beta.example.com" });
const evA = (await A.post("/api/host/events", { name: "Alpha Night", venue: "Hall 1", theme: "night", strapColor: "#2244aa" })).json;
const evB = (await B.post("/api/host/events", { name: "Beta Night" })).json;
const path = (id) => `/api/host/events/${id}/live`;
check("a signed-out browser gets 401", (await client({ ip: "10.90.0.3", site: "host" }).get(path(evA.id))).status === 401);
const attendee = client({ ip: "10.90.0.4" });
await attendee.post("/api/profile", { name: "Zed Zebra", acceptTerms: true, over18: true });
const leak = client({ ip: "10.90.0.5", site: "host" });
leak.jar.set("lanyard_session", attendee.jar.get("lanyard_session"));
check("an attendee's cookie gets 401", (await leak.get(path(evA.id))).status === 401);
const viaMain = client({ ip: "10.90.0.6" });
viaMain.jar.set("__Host-lanyard_host", A.jar.get("__Host-lanyard_host"));
check("the main site refuses it, even with the host cookie (403)", (await viaMain.get(path(evA.id))).status === 403);
check("a host of another organisation gets 404 (no hint the event exists)", (await B.get(path(evA.id))).status === 404);
check("a made-up event gets 404", (await A.get(path("nope000000"))).status === 404);
const own = await A.get(path(evA.id));
check("the host of the event gets 200, with the code, theme and colour the page draws", own.status === 200 && own.json.event.code === evA.code && own.json.event.theme === "night" && own.json.event.strapColor === "#2244aa", own.json?.event);
check("the page's address resolves on the main site to this event", (await client({ ip: "10.90.0.7" }).get(`/api/e/${evA.code}`)).status === 200 && joinUrl(own.json.event.code).endsWith(`/e/${evA.code}`));

console.log("\n# Nothing per person");
await attendee.post(`/api/e/${evA.code}/checkin`, { name: "Zed Zebra", answers: {}, agreed: true });
const after = await A.get(path(evA.id));
check("the check-in is counted", after.json.checkins === 1, after.json.checkins);
const flat = JSON.stringify(after.json);
check("the response names nobody and has no email, photo or list", !/Zed|Zebra|@|selfie_key|photo/i.test(flat.replace(/a@alpha\.example\.com/g, "")) && !Array.isArray(after.json.people) && !("attendees" in after.json), flat.slice(0, 300));
check("the page uses only the event's details and the check-in count", /ev\.value|live\.value\??\.checkins/.test(present) && !/connections|selfies|presenceUsed|feedback\b|people|attendee/i.test(present.replace(/\/\/.*$/gm, "").replace(/<!--[\s\S]*?-->/g, "")), "");
check("it renders no HTML from data", !/v-html|innerHTML/.test(present));

summary();
