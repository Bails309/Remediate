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
