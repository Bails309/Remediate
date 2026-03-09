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

- `remediate-app` (Web UI / API) - **Full Config**:
   - `DATABASE_URL` (Required)
   - `REDIS_URL` (Required)
   - `AUTH_SECRET` (Required - Used for OIDC encryption and JWT signing)
   - `NEXTAUTH_SECRET` (Required by NextAuth)
   - `NEXTAUTH_URL` / `AUTH_URL` (Required - Public URL of the app)
   - `ADMIN_EMAIL` (Recommended)
   - `LOCAL_AUTH_ENABLED` (Set to `true` for first-time login without SSO)
   - `LOCAL_AUTH_USER` / `LOCAL_AUTH_PASS` / `LOCAL_AUTH_EMAIL` (Required if local auth enabled)
   - `PENTEST_BACKEND_URL` (Optional - Internal URL for backend)

- `remediate-worker` (Background Jobs) - **Minimal Config**:
   - `DATABASE_URL` (Required)
   - `REDIS_URL` (Required)
   - `AUTH_SECRET` (Required - Must match the App node)

- `remediate-pentest-backend` (Pentest Toolkit) - **Minimal Config**:
   - `DATABASE_URL` (Required)
   - `AUTH_SECRET` (Required - Must match the App node to validate tokens)
   - `PENTEST_JWT_ISSUER` / `PENTEST_JWT_AUDIENCE` (Optional - Defaults exist)

Notes on Redis TLS and external services:
- To use TLS with Redis set `REDIS_URL` to `rediss://...` and optionally set `REDIS_TLS_REJECT_UNAUTHORIZED=true|false` depending on certificate trust. The app supports `rediss://` and will pass a `tls` option to the Redis client when `rediss://` is used.
- Provide secrets in ACA using the platform's secret store and reference them as environment variables in your container app definitions.

### Setting `APP_VERSION` in CI and images

For reliable version tracking displayable on `/admin/health`, set an `APP_VERSION` environment variable at build or deploy time. Recommended approaches:

- GitHub Actions + ACR build (inject git SHA as build-arg):

```yaml
jobs:
   build:
      runs-on: ubuntu-latest
      steps:
         - uses: actions/checkout@v4
         - name: Set version
            run: echo "APP_VERSION=$(git rev-parse --short HEAD)" >> $GITHUB_ENV
         - name: Build and push to ACR
            run: |
               az acr build --registry ${{ secrets.ACR_NAME }} \
                  --image remediate:${{ env.APP_VERSION }} \
                  --build-arg APP_VERSION=${{ env.APP_VERSION }} .
```

- Docker build + push (CI):

```bash
docker build --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t myregistry/remediate:$(git rev-parse --short HEAD) .
docker push myregistry/remediate:$(git rev-parse --short HEAD)
```

- Azure Container Apps: set an environment variable referencing the image tag or secret. Example using `az containerapp update`:

```bash
az containerapp update --name my-app --resource-group my-rg \
   --set-env-vars APP_VERSION="$(git rev-parse --short HEAD)"
```

Notes:
- The app prefers `APP_VERSION` env var. If not provided, it falls back to `package.json` version.
- Consider using the image tag (e.g., `v1.2.3` or commit SHA) as `APP_VERSION` for clearer traceability.
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
