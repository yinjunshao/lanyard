// node capture.mjs frames            -> work/frames/f0000.jpg ...
// node capture.mjs stills 1.5,3.5    -> work/stills/t1.50.jpg ...
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import { fileURLToPath } from "node:url";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, DUR = 24.5;
const [, , mode = "stills", arg = ""] = process.argv;
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const TYPES = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".js": "text/javascript" };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;

const profile = path.join(ROOT, "edge-profile");
const edge = spawn(EDGE, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profile}`,
  "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1920,1080", "--mute-audio", "about:blank"], { stdio: "ignore" });

let ver;
for (let i = 0; i < 50 && !ver; i++) {
  try { ver = await (await fetch("http://127.0.0.1:9333/json/list")).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
}
const target = ver.find((t) => t.type === "page");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url: `http://127.0.0.1:${port}/index.html` });
for (let i = 0; i < 100; i++) { if (await evalJs("!!window.__ready")) break; await new Promise((r) => setTimeout(r, 100)); }

async function shot(t, file) {
  await evalJs(`render(${t}); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const { result } = await send("Page.captureScreenshot", { format: "jpeg", quality: 93, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
}

if (mode === "frames") {
  const dir = path.join(ROOT, "frames"); fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(DUR * FPS);
  for (let f = 0; f < n; f++) {
    await shot(f / FPS, path.join(dir, `f${String(f).padStart(4, "0")}.jpg`));
    if (f % 60 === 0) console.log(`frame ${f}/${n}`);
  }
} else {
  const dir = path.join(ROOT, "stills"); fs.mkdirSync(dir, { recursive: true });
  for (const t of arg.split(",").map(Number)) await shot(t, path.join(dir, `t${t.toFixed(2)}.jpg`));
}
ws.close(); edge.kill(); server.close();
console.log("done");
