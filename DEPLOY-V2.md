# Deploying Lanyard v2 to workers.dev

`DEPLOY.md` describes v1 (KV). v2 uses D1 + R2. The v1 demo is the Worker named
`lanyard` at `lanyard.musea-moderation.workers.dev`. **Deploying v2 under the same
name replaces it**, so this guide deploys v2 as `lanyard-v2` and leaves v1 alone.

## One-time setup

```bash
cd D:/Hackathons/ClaudeBuildersClub/lanyard
npx wrangler login
npx wrangler d1 create lanyard_db        # prints a database_id
npx wrangler r2 bucket create lanyard-media
```

Edit `wrangler.toml`:

```toml
name = "lanyard-v2"                       # was "lanyard" (the v1 demo)

[[d1_databases]]
database_id = "<paste the id from d1 create>"

[vars]
APP_ORIGIN = "https://lanyard-v2.musea-moderation.workers.dev"
RP_ID      = "lanyard-v2.musea-moderation.workers.dev"
```

`RP_ID` must be the full hostname on workers.dev (workers.dev is a public suffix,
so a shorter ID is rejected by browsers). Passkeys made on one hostname do not
work on another, so a host.* subdomain later means new passkeys unless RP_ID is
the shared parent domain (see below).

## Deploy

```bash
npm run db:remote                 # applies migrations 0001-0006 to the remote D1 (the daily purge cron in wrangler.toml deploys with the Worker)
npm run build
npx wrangler deploy               # prints the workers.dev URL
```

Redeploy after changes: `npm run build && npx wrangler deploy`. Run
`npm run db:remote` whenever you add a migration file.

## Smoke test after deploy

1. Open the URL, create a profile, check **My card** shows a card and a backup code.
2. Open the card link in a private window and connect.
3. `/host`: create a host account (passkey), set up an organisation, create an event.

## Selling credits before Stripe exists

Hosts submit a request under **Host portal → Billing**. See open requests:

```bash
npx wrangler d1 execute lanyard_db --remote --command \
  "SELECT id, org_id, sku, quantity, amount_pence, contact_email, po_number, note, status FROM billing_requests WHERE status='open'"
```

After you've invoiced and been paid, grant the credits and close the request
(example: society_5 = 5 credits for 365 days; term pass = 99 credits for 120 days):

```bash
npx wrangler d1 execute lanyard_db --remote --command \
  "INSERT INTO credits (id, org_id, events_granted, events_used, expires_at, reason, granted_by, created_at) VALUES (lower(hex(randomblob(5))), '<ORG_ID>', 5, 0, (strftime('%s','now') + 365*86400) * 1000, 'purchase:society_5', 'manual', strftime('%s','now') * 1000); UPDATE billing_requests SET status='paid' WHERE id='<REQUEST_ID>';"
```

## Custom domain and the host subdomain (later)

1. Add the domain to Cloudflare (nameservers), then in the Worker's
   **Settings → Domains & Routes** add two custom domains: `yourdomain.com` and
   `host.yourdomain.com`, both pointing at this one Worker.
2. `wrangler.toml`:
   - `APP_ORIGIN = "https://yourdomain.com,https://host.yourdomain.com"`
   - `RP_ID = "yourdomain.com"` (the parent domain, so one passkey works on both)
3. Build with `VITE_HOST_ORIGIN=https://host.yourdomain.com npm run build` so
   "Open the host portal" links go to the subdomain.
4. On `host.*` the app only serves `/host/*` and sends everything else to the main
   site. Sessions are per hostname, so a host account stays separate from the
   personal card of the same person.
