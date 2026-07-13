# Breadcrumb Vercel gateway

A single-owner Breadcrumb ingestion endpoint for Vercel Functions backed by a Vercel
Marketplace PostgreSQL integration. The implementation uses standard PostgreSQL and is not
coupled to a particular database vendor.

This is the first hosted integration slice. It intentionally does not include a report-listing
route or dashboard; reports must never be exposed through an unauthenticated endpoint.

## Routes

- `GET /.well-known/breadcrumb` — owner manifest
- `POST /api/agent-feedback` — validated, privacy-safe ingestion
- `GET /api/prune-rate-limits` — Vercel Cron maintenance, protected by `CRON_SECRET`

## Database setup

Provision a PostgreSQL integration in the Vercel Marketplace and connect its **pooled**
connection string to the gateway as `DATABASE_URL`. Neon is convenient for Vercel Functions,
but any PostgreSQL service with a compatible pooled connection string can be used.

Copy `.env.example` to `.env.local` at the repository root (it is gitignored) and set:

- `DATABASE_URL` — pooled PostgreSQL URL
- `BREADCRUMB_PUBLIC_ORIGIN` — stable HTTPS production origin for this gateway
- `BREADCRUMB_TARGET_ORIGIN` — canonical owner origin this gateway accepts reports for
- `BREADCRUMB_RATE_LIMIT_SECRET` — at least 32 random characters
- `CRON_SECRET` — separate bearer secret supplied automatically to the Vercel Cron request
- `BREADCRUMB_MAX_REPORTS_PER_MINUTE` — optional, defaults to `20`

Apply migrations as a release step, never from an ingestion request. Let Node parse the env
file directly; shell-sourcing an unquoted PostgreSQL URL can fail when its query contains `&`:

```bash
pnpm build
node --env-file=.env.local --import tsx examples/vercel-gateway/src/migrate.ts
```

If the variables are already exported by CI or the deployment environment, use the package
script instead: `pnpm --filter @breadcrumb/vercel-gateway db:migrate`.

The migration creates the report table and distributed rate-limit buckets. Client network
keys are HMACed before persistence; raw addresses are not stored in the rate-limit table.
The configured daily Vercel Cron calls the authenticated cleanup route to prune old buckets.

The repository integration suite invokes all three Vercel Web Handler modules against local
Docker PostgreSQL without contacting Vercel:

```bash
DATABASE_URL=postgresql://breadcrumb:breadcrumb@localhost:5432/breadcrumb \
  pnpm test:integration
```

## Vercel deployment settings

Set the Vercel project root directory to `examples/vercel-gateway` and enable **Include source
files outside of the Root Directory** so workspace packages are available. Use:

```text
Install Command: pnpm install --frozen-lockfile
Build Command: cd ../.. && pnpm build
```

Enable Fluid Compute. `@breadcrumb/vercel` creates one module-level PostgreSQL pool and calls
Vercel's `attachDatabasePool()` so idle clients are released before a function instance is
suspended. Do not call `storage.close()` from request handlers.

Use a production-only database connection for the production deployment. Preview deployments
should use an isolated database or have ingestion disabled.

## Advertise the gateway

The included rewrite exposes the manifest at `/.well-known/breadcrumb`. Link that manifest from
the owner website's `.breadcrumb.json`, `robots.txt`, and `llms.txt` so agents can discover it.
The manifest's `submission_url` points to this gateway.

By default, the manifest links to Breadcrumb's public protocol and report schema. Owners that
serve pinned copies can advertise those instead:

```ts
const gateway = createVercelGateway({
  publicOrigin,
  targetOrigin,
  storage,
  rateLimiter,
  protocolUrl: `${publicOrigin}/breadcrumb/protocol-0.1.json`,
  reportSchemaUrl: `${publicOrigin}/breadcrumb/report-0.1.schema.json`,
  documentationUrl: `${publicOrigin}/agent-feedback/`,
});
```

Keep owner-hosted copies synchronized with the protocol version accepted by the endpoint.

## Security boundary

- Payload size, schema, event policy, canonical target origin, privacy claims, and deduplication
  are validated before storage.
- Rate limiting is shared across function instances through PostgreSQL.
- No report body is logged by the integration.
- There is no public report-reading API.
- Database migrations and rate-limit pruning run only as trusted maintenance operations.

This example is intentionally single-owner and keeps reports in infrastructure controlled by
that owner.
