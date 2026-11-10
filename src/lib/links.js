// Profile links as rows (label + address) and the {label: url} object the API stores.
// Shared by Edit profile and the welcome steps (F14); only they import it.

// Rows to the {label: url} object the API stores. A bare "github.com/you"
// gets https:// put in front of it; rows missing either half are dropped.
export function buildLinks(rows) {
  const links = {};
  for (const { label, url } of rows) {
    const l = label.trim().slice(0, 40);
    let u = url.trim();
    if (!l || !u) continue;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    links[l] = u;
  }
  return links;
}

const KNOWN = [[/(^|\.)linkedin\.com$/, "LinkedIn"], [/(^|\.)github\.com$/, "GitHub"], [/(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"],
  [/(^|\.)instagram\.com$/, "Instagram"], [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"], [/(^|\.)behance\.net$/, "Behance"],
  [/(^|\.)dribbble\.com$/, "Dribbble"], [/(^|\.)medium\.com$/, "Medium"]];

// A label for a pasted address: "LinkedIn" for linkedin.com, otherwise the site's
// own name ("example.com" gives "Example"). Empty until it looks like an address.
export function labelForUrl(text) {
  let u = String(text || "").trim();
  if (!u || /\s/.test(u)) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  let host;
  try { host = new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
  if (!host.includes(".")) return "";
  for (const [re, name] of KNOWN) if (re.test(host)) return name;
  const parts = host.split(".");
  let i = parts.length - 2;
  if (i > 0 && /^(co|ac|org|gov|com)$/.test(parts[i])) i--; // example.co.uk is "Example"
  const word = parts[i] || host;
  return (word[0].toUpperCase() + word.slice(1)).slice(0, 40);
}
