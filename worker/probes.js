// Drops requests for files this app never serves (secrets, VCS metadata, PHP/WordPress
// paths) with a plain 404 before they reach the static-assets fallback. Without
// this the SPA fallback answers 200 with index.html, which scanners (and
// Cloudflare's vulnerability detection) read as "the file might exist".
const PROBE = new RegExp(
  [
    /(^|\/)\.(?!well-known(\/|$))/.source, // dotfiles: .env, .git, .aws, .ssh ...
    /\.(php\d?|phtml|asp|aspx|jsp|cgi|env|log|sql|bak|old|orig|swp|ini|yml|yaml|conf|config|toml|tar|gz|zip|7z|rar)$/.source,
    /(^|\/)(wp-[a-z-]+|wordpress|xmlrpc|phpmyadmin|pma|cgi-bin|vendor|node_modules|actuator|server-status|phpinfo)(\/|$)/.source,
  ].join("|"),
  "i"
);

export async function probeBlocker(c, next) {
  let path = new URL(c.req.url).pathname;
  try { path = decodeURIComponent(path); } catch { /* malformed escape: test it as sent */ }
  if (PROBE.test(path)) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  await next();
}
