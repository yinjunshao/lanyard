// Compiles every .vue template with Vue's own compiler (dev build, which also
// validates expressions) and syntax-checks each <script setup> block.
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
// The browser build decodes entities through a DOM element; a tiny stand-in is enough.
const ent = (s) => s.replace(/&(lt|gt|amp|quot|#39|nbsp);/g, (_, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', "#39": "'", nbsp: " " })[e]);
globalThis.document = { createElement: () => {
  const el = { _v: "", set innerHTML(v) { this._v = v; }, get textContent() { return ent(this._v); },
    get children() { const m = /="([^"]*)"/.exec(this._v); return [{ getAttribute: () => ent(m ? m[1] : "") }]; } };
  return el; } };
const { compile } = await import("../node_modules/@vue/compiler-dom/dist/compiler-dom.esm-browser.js");

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : ["src/components", "src/views", "src"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".vue")).map((f) => join(d, f)));
const tmp = mkdtempSync(join(tmpdir(), "vc-"));
let bad = 0;
for (const f of [...new Set(files)]) {
  const src = readFileSync(f, "utf8");
  const errs = [];
  const start = src.search(/^<template>/m);
  const end = src.lastIndexOf("\n</template>");
  if (start >= 0) {
    const tpl = src.slice(start + "<template>".length, end);
    try {
      compile(tpl, { onError: (e) => errs.push("template: " + e.message), onWarn: () => {} });
    } catch (e) { errs.push("template: " + e.message); }
  }
  const m = /<script setup>([\s\S]*?)<\/script>/.exec(src);
  if (m) {
    const p = join(tmp, f.replace(/[\/]/g, "_") + ".mjs");
    writeFileSync(p, m[1]);
    try { execFileSync(process.execPath, ["--check", p], { stdio: "pipe" }); }
    catch (e) { errs.push("script: " + String(e.stderr).split("\n").slice(0, 5).join(" | ")); }
  }
  if (errs.length) { bad++; console.log("FAIL " + f + "\n  " + errs.join("\n  ")); }
}
console.log(bad ? `${bad} file(s) with errors` : `all ${files.length} components compile`);
process.exitCode = bad ? 1 : 0;
