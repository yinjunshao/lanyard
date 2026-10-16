# Deploying Lanyard

Current production deployment:

- URL: `https://lanyard.musea-moderation.workers.dev`
- Cloudflare account: `yinjunshao9@gmail.com`
- Worker: `lanyard`
- Production KV namespace binding: `LANYARD_KV`
- Production KV namespace id: `6fa2750047f94df78dc7814bd56b17b7`
- Pinned CLI: Wrangler `4.20.5` (newer `4.151.0` had a broken OAuth scope on Windows)

The temporary `trycloudflare.com` tunnel dies when the laptop sleeps and its URL changes.
For demo day, deploy one Cloudflare Worker that serves:

- the Vue/Vite SPA,
- all `/api/*` routes,
- KV-backed profiles, codes, connections/threads,
- compressed base64 photos.

## One-time setup

Run the login command yourself in an interactive terminal:

```bash
cd D:/Hackathons/ClaudeBuildersClub/lanyard
npx wrangler login
```

Then create the production KV namespace:

```bash
npx wrangler kv namespace create LANYARD_KV
```

Copy the printed namespace `id` into `wrangler.toml`, replacing `LOCAL_PLACEHOLDER`:

```toml
[[kv_namespaces]]
binding = "LANYARD_KV"
id = "REAL_PRODUCTION_NAMESPACE_ID"
```

## Deploy the app

```bash
npm run build
npx wrangler deploy
```

Wrangler prints a stable HTTPS URL such as:

```text
https://lanyard.<your-subdomain>.workers.dev
```

That URL runs without your laptop. Deep links like `/scan`, `/login`, `/qr`, and
`/p/:id` work because the Worker serves SPA fallback for unknown browser routes.

## Migrate existing local data (optional but currently planned)

Local development data is stored in:

```text
.wrangler/state/v3/kv/miniflare-KVNamespaceObject/*.sqlite
```

Do **not** manually copy that SQLite file to production. The production namespace is
remote Cloudflare KV and needs its keys written through Wrangler.

Use the migration script after the production namespace id is in `wrangler.toml`:

```bash
npm run migrate:kv -- --run
npm run build
npx wrangler deploy
```

The migration script defaults to a dry run and writes `.migrations/lanyard-kv.json`; the
`-- --run` flag uploads it. It should only be used once against an empty production namespace.
Profiles, permanent codes, credentials, connection list indexes, reciprocal connection
records, shared threads, and non-expired `photo:*` keys are all stored as KV entries.

## Redeploying after code changes

```bash
npm run build && npx wrangler deploy
```

Do not rerun the KV migration unless you intentionally want to overwrite production data.

## Custom domain later

A free `*.workers.dev` URL is enough for the hackathon. If you buy or already own a
domain, it can be attached as a Cloudflare Worker custom domain later; the Worker and
KV do not need restructuring.

## Free-tier fit

- Workers and KV free tier are ample for a demo.
- Photos are intentionally compressed client-side and capped server-side.
- Production photos currently have a 90-day TTL. If longer-lived photos become important,
  move `photo:*` values to Cloudflare R2 without changing the user-facing API.
