// F58: writes every email, with sample data, to scratch/mail-preview/ so it can be opened in a browser.
// Files only: nothing is sent, nothing is fetched. Run: npm run mail:preview
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLES } from "./mail-samples.mjs";
import { escapeHtml } from "../worker/mail-layout.js";

const out = join(fileURLToPath(new URL("..", import.meta.url)), "scratch", "mail-preview");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const rows = [];
for (const s of SAMPLES) {
  const m = s.build();
  writeFileSync(join(out, `${s.id}.html`), m.html);
  writeFileSync(join(out, `${s.id}.txt`), `Subject: ${m.subject}\n${m.headers ? Object.entries(m.headers).map(([k, v]) => `${k}: ${v}\n`).join("") : ""}\n${m.text}\n`);
  rows.push(`<tr><td><a href="${s.id}.html">${escapeHtml(s.id)}</a></td><td>${escapeHtml(m.subject)}</td><td>${s.kind}</td><td>${escapeHtml(s.from)}</td><td>${(m.html.length / 1024).toFixed(1)} KB</td><td><a href="${s.id}.txt">text</a></td></tr>`);
}
writeFileSync(join(out, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Lanyard emails</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px;background:#F4F1EA;color:#1B1A17}a{color:#C4441E}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #D8D2C5;padding:6px 10px;text-align:left}@media (prefers-color-scheme:dark){body{background:#141311;color:#F4F1EA}a{color:#EA7552}td,th{border-color:#3A362F}}</style></head><body>
<h1>Lanyard emails (${SAMPLES.length})</h1><p>Sample data only. Nothing here was sent. Open a page at a narrow width and in dark mode to check it. The text link is the plain-text part.</p>
<table><tr><th>Page</th><th>Subject</th><th>Sent as</th><th>Sent from (worker/)</th><th>HTML size</th><th></th></tr>${rows.join("")}</table></body></html>`);
console.log(`Wrote ${SAMPLES.length} emails to ${out}`);
