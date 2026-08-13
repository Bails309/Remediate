# Deployment Guide

This document summarizes recommended deployment patterns for Remediate.

> **Targeted release**: `v2.16.1` (2026-08-13). The runtime is **Node.js 24 LTS** (the `Dockerfile` builds `FROM node:lts-slim`, which currently resolves to 24.x), Next.js `^16.2.11`, BullMQ `^6.0.10`, Prisma `^6.19.2`, and PostgreSQL 14+. Always rebuild the container image after a `package.json` change so the lockfile-resolved versions ship together.
>
> ⚠️ **`node:lts-slim` is a floating tag.** A new Node LTS moves your runtime a whole major version on the next image build with no change to this repository — that is how the images went from Node 20 to Node 24. CI now pins `node-version: '24'` to match, but the two can silently diverge again. Consider pinning the Dockerfile to `node:24-slim`; Dependabot is configured for Docker and will raise the upgrade as a reviewable PR.
>
> **v2.16.1 upgrade notes**:
> - **Migrations** (two, both additive or behaviour-preserving):
>   - `20260813210000_ai_assistant_name` — adds one nullable `AiConfig.assistantName` column. `NULL` preserves existing behaviour.
>   - `20260813220000_storage_provider_drop_local` — drops the dead `LOCAL` variant from the `StorageProvider` enum and moves the `StorageConfig.provider` default from `LOCAL` to `REDIS`, reconciling a drift that had existed since `20260315012500_force_sync_schema`. **Any row still set to `LOCAL` is rewritten to `REDIS` first.** This is a semantic no-op: `getStorageProvider()` has always treated anything other than `AZURE` as Redis, so a `LOCAL` row was already being served by the Redis provider. Installations using Azure Blob storage are untouched.
> - **No configuration change required.** Optionally set `AI_ASSISTANT_NAME` (max 40 characters) if you provision the AI feature declaratively; the database value set under **Settings → AI Insights** takes precedence, as with every other `AI_*` variable.
> - **Read this if you chose your AI provider on a data-residency basis.** Prior to this release the AI Insights admin page claimed vulnerability data was never sent to the provider. That was accurate for the v2.9.0 query planner but has been false since v2.12.0, when a tool-using assistant replaced it. The assistant sends findings the asking user can already see to whichever provider you configured. If that conflicts with your data policy, disable the feature or point `AI_PROVIDER=openai-compatible` at a self-hosted endpoint. The UI copy has been corrected.
> - **New CI gates**, if you build from this repository's workflows: Trivy image scanning, CodeQL, and a Prisma schema-drift check that fails the build when `schema.prisma` has no matching migration. The `unit` job no longer masks migration failures with `|| true`.
> - **Two dependency majors landed via Dependabot in this release**: **BullMQ 5 → 6** and **recharts 2 → 3**. Neither needs a configuration change, but note that BullMQ 6 removes `paused` as a job *state* — pausing is queue-wide, so anything reading a per-state `paused` count must call `queue.isPaused()` instead. `scripts/diagnose-queue.ts` was updated accordingly; no runtime queue code depended on it.
>
> **v2.16.0 upgrade notes**:
> - **Migrations** (three, all additive — no existing table is altered destructively). Runtime fallback via `scripts/migrate.js` applies them on first boot under an advisory lock; the CI job in `.github/workflows/migrations.yml` remains the recommended path for production.
>   - `20260813150000_threat_actors` — `ThreatActor` table backing the MITRE ATT&CK adversary catalogue.
>   - `20260813170000_threat_actor_technologies` — adds the derived `technologies` array used by the *Top Targeted Technologies* card.
>   - `20260813190000_dashboards` — `Dashboard` + `DashboardWidget` tables for personal/published dashboards.
> - **⚠️ Privilege change — review role assignments before upgrading.** `web_app_admin` no longer implies site administration. Installation configuration (`/admin/configuration`), identity/OIDC, user and group management, audit logs and platform health are now **`site_admin` only**, enforced at the edge (`proxy.ts`), in the page component and in every route handler. `web_app_admin` retains dashboards, vulnerabilities, analytics, automation and inventory. Any operator who relied on `web_app_admin` for installation settings must be promoted to `site_admin` **before** the new image is rolled out, or they will receive 403s.
> - **Worker egress**: the threat-actor sync runs inside the existing worker container (on boot, then weekly) and fetches the MITRE ATT&CK STIX bundle from `raw.githubusercontent.com`. No new container or env var is required. If egress is blocked the sync fails closed, logs a warning, and every other scheduler continues unaffected — the Threat Actors page simply shows no data.
> - **Scheduler behaviour change**: threat-intelligence and threat-actor syncs now run **before** the scheduled-reporting configuration guard, so they no longer stop when reporting is unconfigured or disabled. Estates that deliberately left reporting off will start seeing threat-feed traffic from the worker after upgrading.
> - **AI is still optional.** The dashboard widget planner reuses the existing `AiConfig` provider; if AI is not configured, widgets are built manually and nothing else changes. The planner only ever receives a schema description and returns a JSON widget spec — no SQL and no database access — which the server re-validates and executes under the caller's own permissions.
> - **No key rotation impact.** No new secrets were introduced in this release.
>
> **v2.9.0 upgrade notes**:
> - **Migration**: `20260803120000_add_ai_config` creates the `AiConfig` table (encrypted provider endpoint + API key, non-secret model / api-version) that backs the new AI-Powered Insights feature. It is additive and touches no existing tables. Runtime fallback via `scripts/migrate.js` applies it on first boot; the CI job in `.github/workflows/migrations.yml` is the recommended path for production.
> - **AI assistant is optional and disabled by default.** No new container is required — the tool-using chat runs inside the existing `remediate-app` node. To enable, either configure a provider under **Settings > AI Insights** or set the `AI_*` env vars (see [`docs/AZURE_ENV_VARS.md`](docs/AZURE_ENV_VARS.md)). The provider must support tool/function calling. Ensure `remediate-app` has network egress to your chosen AI endpoint (Azure OpenAI, Azure AI Foundry, or an OpenAI-compatible `/v1` host) **and** to the public package registries the `get_latest_version` tool queries (npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist, Go). The assistant shares findings the caller can already see with the model, so for air-gapped estates point `AI_PROVIDER=openai-compatible` at a self-hosted model and expect registry lookups to be unavailable without an internal mirror.
> - **No key rotation impact** unless you enable the feature: the endpoint and API key are encrypted with `AUTH_SECRET`, so rotating `AUTH_SECRET` requires re-entering the AI key alongside the existing OIDC / SMTP / storage secrets.
>
> **v2.8.0 upgrade notes**:
> - **Migration**: `20260715120000_add_acr_scanner_type` introduces the `ScannerType` enum (`NESSUS`, `ACR`), backfills every existing `Vulnerability` and `VulnerabilityHistory` row to `NESSUS`, adds the `AzureBlobIngestConfig` table (FK: `defaultSiteId → Site.id ON DELETE SET NULL`), and extends the composite dedup key to `(siteId, scannerType, pluginId, host, port)`. Runtime fallback via `scripts/migrate.js` will apply it on first boot; the CI job in `.github/workflows/migrations.yml` is the recommended path for production.
> - **Worker**: The ACR blob-ingest scheduler runs inside the existing worker container \u2014 no new container is required. Ensure the worker has network egress to any Azure Blob accounts you configure through `/admin/azure-blob-ingest`.
> - **v2.7.1 hotfix** (rolled into v2.8.0): Every BullMQ Queue / Worker now owns its own IORedis connection with `keepAlive: 30_000` and reconnect-on-`READONLY`/`ECONNRESET`. No env-var change required, but Azure Redis idle-socket drops that previously stranded jobs in `active` will now surface as `waiting` on reconnect.

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
