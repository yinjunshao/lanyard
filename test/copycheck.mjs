// F03: no example, placeholder, demo or email text may name a real university,
// students' union, street or society. Scans what users can see: src/, worker/,
// public/ and index.html. Names are matched as whole words so short ones
// (SU, LSE) do not fire inside other words.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { check, summary } from "./harness.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

// [label, regex]. Acronyms are case-sensitive so "su" and "Lse" never match.
const NAMES = [
  ["UCL / UCLSU", /\bUCL(SU)?\b/],
  ["KCL, LSE, SOAS, QMUL", /\b(KCL|LSE|SOAS|QMUL)\b/],
  ["SU used as a name", /\bSU\b/],
  ["a union-style code (UCLSU, LSESU)", /\b[A-Z]{2,6}SU\b/],
  ["Imperial College", /\bImperial (College|London)\b/i],
  ["King's College", /\bKing[’']?s College\b/i],
  ["Oxford / Cambridge", /\b(Oxford|Cambridge|Oxbridge)\b/i],
  ["Bartlett, Gower, Bloomsbury", /\b(Bartlett|Gower|Bloomsbury)\b/i],
  ["a named students' union", /\b[A-Z][A-Za-z]+ Students[’']? Union\b/],
  ["a real university address", /@(?!university\.ac\.uk\b)[a-z0-9-]+\.ac\.uk\b/i],
  ["a named society", /\b(?!Student|Students|The|A|An|Your|Each|Any|Every|Our|This|That|Their)[A-Z][a-z]+ (Society|Soc)\b/],
];

// Kept narrow on purpose. Each entry says why.
const ALLOW = [
  { file: "worker/codes.js", why: "reserved card codes are a blocklist, not copy" },
  { file: /^src\/data\/institutions-[^/]*\.json$/, why: "the institution list (F12) has to name them" },
  { file: /^src\/views\/(Terms|Privacy)\.vue$/, line: /address/i, why: "the operator's legal address lines" },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const TEXT = /\.(vue|js|mjs|json|html|css|webmanifest|txt|svg)$/;
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (SKIP_DIRS.has(n)) continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (TEXT.test(n)) out.push(p);
  }
  return out;
}

export function scan(files, rel = (f) => f) {
  const hits = [];
  for (const f of files) {
    const r = rel(f).split(sep).join("/");
    const allowFile = ALLOW.filter((a) => (typeof a.file === "string" ? a.file === r : a.file.test(r)));
    if (allowFile.some((a) => !a.line)) continue;
    readFileSync(f, "utf8").split(/\r?\n/).forEach((text, i) => {
      if (allowFile.some((a) => a.line.test(text))) return;
      for (const [label, re] of NAMES) if (re.test(text)) hits.push(`${r}:${i + 1} ${label}: ${text.trim().slice(0, 100)}`);
    });
  }
  return hits;
}

console.log("\n# The patterns catch real names and ignore plain words");
const probe = (s) => NAMES.filter(([, re]) => re.test(s)).length > 0;
for (const bad of ["UCL Careers Fair", "name@ucl.ac.uk", "the UCLSU stall", "Join the SU", "Step-free via Gower St", "Imperial College London", "King's College", "Oxford Union", "Robotics Society", "UCL Students' Union", "name@kcl.ac.uk"]) {
  check(`flags: ${bad}`, probe(bad));
}
for (const good of ["Spring networking night", "name@university.ac.uk", "a student society", "Student Society", "Society social", "students' union or university", "result", "Your university", "SUBMIT", "else", "Careers fair", "imperial units"]) {
  check(`allows: ${good}`, !probe(good));
}

console.log("\n# src/, worker/, public/ and index.html");
const files = [...walk(join(root, "src")), ...walk(join(root, "worker")), ...(statSync(join(root, "public"), { throwIfNoEntry: false }) ? walk(join(root, "public")) : []), join(root, "index.html")];
const hits = scan(files, (f) => relative(root, f));
check(`${files.length} files have no real university, union or society names`, hits.length === 0, hits.join("\n    "));

summary();
