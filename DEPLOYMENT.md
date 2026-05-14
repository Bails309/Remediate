# Deployment Guide

This document summarizes recommended deployment patterns for Remediate.

> **Targeted release**: `v2.6.2` (2026-05-14). The runtime expects Node.js 20 LTS, Next.js `^16.2.6`, BullMQ `^5.76.8`, Prisma `^6.19.2`, and PostgreSQL 14+. Always rebuild the container image after a `package.json` change so the lockfile-resolved versions ship together.

## Modes
- CI-driven (recommended for production): run migrations and DB optimizations in CI before updating containers. See `.github/workflows/migrations.yml`.
- Runtime fallback: containers run `scripts/migrate.js` on startup (advisory-lock protected) to apply any missing migrations and regenerate the Prisma Client. If migration deploy fails, the container startup fails rather than continuing on a partial schema.

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
   - `AUTH_SECRET` (Required - Used for OIDC encryption and session JWT signing)
   - `PENTEST_JWT_SECRET` (Required - Used for inter-service signing to backend. Must match Backend)
   - `NEXTAUTH_SECRET` (Required by NextAuth)
   - `NEXTAUTH_URL` / `AUTH_URL` (Required - Public URL of the app)
   - `ADMIN_EMAIL` (Recommended)
      - The primary admin account (email) that is always allowed to sign in and be provisioned.
        Useful for bootstrap access when SSO provisioning is restricted.
   - `BLOCK_UNKNOWN_SSO` (Recommended default: **block**) 
      - When unset or any value other than the literal string `false`, the app will block unknown
        SSO/OIDC sign-ins to prevent accidental account creation. To permit automatic provisioning
        of SSO users, set `BLOCK_UNKNOWN_SSO=false` in your environment.
   - `LOCAL_AUTH_ENABLED` (Set to `true` for first-time login without SSO)
   - `LOCAL_AUTH_USER` / `LOCAL_AUTH_PASS` / `LOCAL_AUTH_EMAIL` (Required if local auth enabled)
   - `PENTEST_BACKEND_URL` (Optional - Internal URL for backend)
   - **Azure Storage Config** (If enabled):
      - `AZURE_STORAGE_CONNECTION_STRING`
      - `AZURE_STORAGE_ACCOUNT_NAME`
      - `AZURE_STORAGE_ACCOUNT_KEY`
      - `AZURE_STORAGE_SAS_TOKEN`
      - `AZURE_STORAGE_CONTAINER_NAME`

- `remediate-worker` (Background Jobs) - **Minimal Config**:
   - `DATABASE_URL` (Required)
   - `REDIS_URL` (Required)
   - `AUTH_SECRET` (Required - Must match the App node. Used for inter-service JWT signing and for OIDC/SMTP/storage secret decryption.)

### Pentest PDF Processing (v2.6.1+)

Pentest PDF ingestion is **entirely in-process**. The worker uses the built-in Trustmarque CHECK parser (`lib/pentest-pdf-builtin.ts`) — backed by `pdf-parse` for text extraction and `pdfjs-dist` (legacy build, loaded dynamically) for yellow-highlight detection. No external API, no encrypted API key, no admin configuration, and no outbound network calls are involved.

- **Operator workflow**: Sign in as a site admin, switch the Uploads page to **PDF**, drop a Trustmarque CHECK PDF (≤ 25 MB), and the dedicated worker on the `{pentest-pdf-queue}` BullMQ queue will parse it and write findings into the same `Vulnerability` table that drives the CSV pipeline. Each finding inherits assign / archive / remediate workflows, audit history, threat-intelligence enrichment, and analytics surfaces.
- **Node configuration**: `lib/pentest-pdf-builtin.ts` and `pdfjs-dist` must be listed in `next.config.ts#serverExternalPackages` so Next.js doesn't try to bundle them. This is already configured in the shipped image.
- **No 412 responses**: `POST /api/uploads/pentest` no longer returns HTTP 412 — the endpoint succeeds for any admin-uploaded PDF ≤ 25 MB. Worker failures (corrupt or non-Trustmarque PDFs) surface on the Live Progress card.

- `remediate-pentest-backend` (Pentest Toolkit) - **Minimal Config**:
   - `DATABASE_URL`: Your production PostgreSQL connection string.
   - `REDIS_URL`: Your production Redis connection string.
   - `REDIS_CLUSTER_MODE`: **Mandatory** if using Azure Cache for Redis with Clustering enabled. Set to `true` for **App**, **Worker**, and **Backend**.
   - `PENTEST_JWT_SECRET`: **Mandatory.** Shared secret used to validate the short-lived JWTs the app issues for toolkit proxy calls. **Must be identical** on the app, worker, and backend containers — desynchronized values silently fail every toolkit call. Generate with `npx auth secret` or `openssl rand -base64 48`.
   - `AUTH_SECRET`: A secret generated by `npx auth secret`. Used for OIDC/SMTP/storage secret decryption. Must match the App + Worker.
   - `AUTH_TRUST_HOST`: Set to `true`. **Mandatory** when running behind a proxy (like Azure Container Apps) to allow auth redirects to work correctly.
   - `PENTEST_JWT_ISSUER` / `PENTEST_JWT_AUDIENCE`: **Mandatory for Prod**. Identifiers for JWT validation. The app defaults to `remediate-prod` and `pentest-backend-prod` to guarantee a synchronized handshake in production environments.

> [!IMPORTANT]
> `PENTEST_JWT_SECRET` is mandatory on **all three** containers (app, worker, pentest-backend). The README and `.env.example` both treat it as a required variable. If the backend rejects every request with a 401 after deployment, the most common cause is a mismatched or missing `PENTEST_JWT_SECRET`.

### Redis Cluster Compatibility

For production environments using **clustered Redis** (like Azure Cache for Redis with clustering enabled), the application uses **Redis Hash Tags** to ensure related keys are stored on the same shard.

- **Job Queues**: All BullMQ-related keys are tagged with `{bull}` (e.g., `{bull}:upload-queue`).
- **Markers**: Queue control markers are similarly tagged to prevent `CROSSSLOT` errors.

Ensure `REDIS_CLUSTER_MODE=true` is set on all service instances to enable this behavior.

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

## Production vs Development Builds

The application uses a multi-stage `Dockerfile` to optimize for both local development (fast refresh) and production (high performance).

### Local Development (Default in Compose)
The `docker-compose.yml` is configured to use the `dev` stage. This enables Turbopack and fast-refresh, but it is **not recommended for production**.
- **Stage**: `dev`
- **Command**: `npm run dev`

### Service Configuration (ACA)

| Service | Image Target | Ingress | Port |
| :--- | :--- | :--- | :--- |
| **App** | `app-runner` | Enabled (External) | 3000 |
| **Worker** | `worker-runner` | **Disabled** | N/A |
| **Backend** | `(default)` | Enabled (Internal/External) | 8000 |

> [!NOTE]
> The **Worker** is a pure background process that pulls tasks from Redis. It does not need a public URL or an active Ingress.

### Production Builds (For Azure Container Apps)
For production, you should build the `app-runner` and `worker-runner` targets. These create highly optimized images that run `next start` and the background worker respectively without any command overrides.

**1. Create the Main App Image:**
```bash
docker build --target app-runner -t <REGISTRY>/remediate-app:latest .
```

**2. Create the Worker Image:**
```bash
docker build --target worker-runner -t <REGISTRY>/remediate-worker:latest .
```

**Why separate images?**
- **Out of the box**: Each image has the correct `CMD` set internally. You don't need to manually override start commands in ACA.
- **Performance**: `next start` is used instead of the dev compiler.
- **Reliability**: Images include pre-compiled assets and only necessary production files.

> [!TIP]
> Each service will automatically run its own initialization (migrations, maintenance) on startup.

## Local dev (docker-compose)
- `docker compose up -d --build` will start `db`, `redis`, then `app` and `worker`.
- `app` runs `node /app/scripts/migrate.js` on start, then starts Next.js.
- `worker` runs `node /app/scripts/migrate.js`, then `npx tsx /app/scripts/optimize-db.ts` on start.

## Rollback considerations
- Migrations are not automatically reversible. Test migrations in staging and create explicit rollback strategies (data exports, revert deployments).

Files of interest:
- `.github/workflows/migrations.yml`
- `scripts/migrate.js`
- `scripts/optimize-db.ts`
- `docker-compose.yml`
