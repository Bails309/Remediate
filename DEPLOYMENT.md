# Deployment Guide

This document summarizes recommended deployment patterns for Remediate.

## Modes
- CI-driven (recommended for production): run migrations and DB optimizations in CI before updating containers. See `.github/workflows/migrations.yml`.
- Runtime fallback: containers run `scripts/migrate.js` on startup (advisory-lock protected) to apply any missing migrations.

## CI (GitHub Actions) - recommended
1. Add `DATABASE_URL` to repository secrets.
2. Ensure CI runs:
   - `npm ci`
   - `npx prisma generate`
   - `npx prisma migrate deploy`
   - `npx tsx scripts/optimize-db.ts`
3. Only promote new container images after the `migrate` job succeeds.

## Azure Container Apps (example)
1. Build and push image to ACR:
   ```bash
   az acr build --registry <ACR_NAME> --image remediate:$(git rev-parse --short HEAD) .
   ```
2. Deploy to ACA and set secrets (`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, etc.).
   - For Azure Cache for Redis, ensure the **eviction policy** is set to `noeviction` to prevent loss of queued jobs.
   - Recommended Tier: **Standard C1 (1GB)** is generally sufficient. Use **C2 (2.5GB)** or higher if processing exceptionally large datasets or high volumes of concurrent uploads.
3. Minimum environment variables per image (Azure Container Apps)

- `remediate-app` (web UI / API) - minimum:
   - `DATABASE_URL` - Postgres connection string (required)
   - `REDIS_URL` - redis or rediss connection string (required)
   - `NEXTAUTH_SECRET` - secret for next-auth (required)
   - `AUTH_SECRET` - application auth secret (required)
   - `NEXTAUTH_URL` / `AUTH_URL` - app base URL (required)
   - `ADMIN_EMAIL` - initial admin email (recommended)
   - `PENTEST_BACKEND_URL` - set if using pentest/scanning features (optional)

- `remediate-worker` (background jobs) - minimum:
   - `DATABASE_URL` (required)
   - `REDIS_URL` (required)
   - `AUTH_SECRET` (required)
   - `NEXTAUTH_SECRET` (required)
   - `ADMIN_EMAIL` (recommended)

- `remediate-pentest-backend` (pentest/scanner) - minimum:
   - `DATABASE_URL` (required)
   - `AUTH_SECRET` (required)
   - `TOOLS_CONFIG_PATH` or mount `/config` with `tools.json` (required)
   - `PENTEST_JWT_ISSUER` / `PENTEST_JWT_AUDIENCE` (defaults exist but set explicitly in production)

Notes on Redis TLS and external services:
- To use TLS with Redis set `REDIS_URL` to `rediss://...` and optionally set `REDIS_TLS_REJECT_UNAUTHORIZED=true|false` depending on certificate trust. The app supports `rediss://` and will pass a `tls` option to the Redis client when `rediss://` is used.
- Provide secrets in ACA using the platform's secret store and reference them as environment variables in your container app definitions.
3. Option A (CI-first): run migrations in CI before updating ACA.
4. Option B (ACA Job): create a one-off Container Apps Job to run migrations:
   ```bash
   az containerapp job create ... --image <registry>/remediate:latest --command "npx prisma migrate deploy && npx tsx scripts/optimize-db.ts"
   az containerapp job run --name run-migrations
   ```

## Local dev (docker-compose)
- `docker compose up -d --build` will start `db`, `redis`, then `app` and `worker`.
- `app`/`worker` run `npx prisma generate && node /app/scripts/migrate.js && npx tsx /app/scripts/optimize-db.ts` on start.

## Rollback considerations
- Migrations are not automatically reversible. Test migrations in staging and create explicit rollback strategies (data exports, revert deployments).

Files of interest:
- `.github/workflows/migrations.yml`
- `scripts/migrate.js`
- `scripts/optimize-db.ts`
- `docker-compose.yml`
