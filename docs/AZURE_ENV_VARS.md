# Minimum Environment Variables for Azure Container Apps

Store these values as ACA secrets (or map to Key Vault):

## Required on every container (app, worker, pentest-backend)
- `DATABASE_URL`: Postgres connection string (use Azure Database for PostgreSQL Flexible Server). Append `?sslmode=require` for managed Postgres.
- `AUTH_SECRET`: Application encryption key used for OIDC/SMTP/storage secret encryption and inter-service JWT signing. Must be identical across every container.
- `PENTEST_JWT_SECRET`: Shared secret used by the app to sign — and by the pentest backend to verify — short-lived JWTs that authorize toolkit calls. Must be identical across every container. Generate with `npx auth secret` or `openssl rand -base64 48`.
- `NODE_ENV=production`

## App + worker
- `REDIS_URL`: Redis connection string (Azure Cache for Redis). Use `rediss://` for TLS.
- `REDIS_CLUSTER_MODE=true`: **Mandatory** if Azure Cache for Redis has clustering enabled.

## App only
- `NEXTAUTH_URL` / `AUTH_URL`: Public URL of the app (e.g., `https://app.example.com`).
- `NEXTAUTH_SECRET`: Strong random secret for NextAuth session encryption.
- `ADMIN_EMAIL`: Primary administrator email populated by the seed script.
- `BLOCK_UNKNOWN_SSO`: Defaults to blocking unknown SSO logins. Set to `false` only when auto-provisioning is desired.
- `PENTEST_BACKEND_URL`: Internal URL of the pentest backend container (e.g., `https://pentest-backend.internal...`).

## Pentest backend only
- `PENTEST_JWT_ISSUER` / `PENTEST_JWT_AUDIENCE`: JWT validation claims. Default to `remediate-prod` / `pentest-backend-prod` — override only if you intentionally differ from the app.
- `AUTH_TRUST_HOST=true`: Required when running behind the ACA ingress proxy.
- `TOOLS_CONFIG_PATH`: *(Optional)* Override path to `tools.json` (defaults to `/config/tools.json`).
- `PORT`: *(Optional)* Listen port (defaults to `8000`).

## Optional (Azure Blob Storage — application payload storage)
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME` / `AZURE_STORAGE_ACCOUNT_KEY`
- `AZURE_STORAGE_SAS_TOKEN`
- `AZURE_STORAGE_CONTAINER_NAME` (required when any of the above is set)

> These variables configure the **application's own payload storage** (where uploaded CSV / PDF blobs are persisted while the worker processes them). They can also be configured through the admin **Storage** page.

## Optional (Azure Container Registry Blob Ingest — v2.8.0)
The ACR blob-ingest pipeline reads its configuration from the `AzureBlobIngestConfig` database table (managed under `/admin/azure-blob-ingest`), **not** from environment variables. This keeps its credentials, container, and default site independent from the application payload store above and lets you rotate them without a redeploy.

Two operational knobs are still relevant at the container level:
- **BullMQ / Redis**: the ACR ingest scheduler runs inside the worker container and enqueues on the shared `{upload-queue}` queue \u2014 no additional Redis config is required beyond the standard `REDIS_URL` / `REDIS_CLUSTER_MODE`.
- **Migrations**: applying the `20260715120000_add_acr_scanner_type` migration is a prerequisite for the `/admin/azure-blob-ingest` console to load. `scripts/migrate.js` handles this automatically on container startup with an advisory lock.

## Optional (AI-Powered Insights — v2.9.0)
Powers the natural-language search on the Vulnerabilities page. Preferred configuration is the **AI Insights** tab under `/admin/settings` (endpoint + key are AES-256-GCM encrypted in the `AiConfig` table). These environment variables are a declarative fallback used only when no database row exists:
- `AI_PROVIDER`: one of `azure-openai`, `foundry`, `openai-compatible`.
- `AI_BASE_URL`: provider endpoint. Azure OpenAI resource root (`https://<res>.openai.azure.com`); Foundry resource root (`https://<res>.services.ai.azure.com` — a `/models`, `/openai/v1`, or `/api/projects/<name>` suffix is trimmed automatically); or any OpenAI-compatible base including the version segment (`https://api.openai.com/v1`, `http://ollama:11434/v1`).
- `AI_API_KEY`: provider API key.
- `AI_MODEL`: model name — the **deployment name** for `azure-openai`.
- `AI_API_VERSION`: *(Azure only)* e.g. `2024-10-21`.
- `AI_INSIGHTS_ENABLED`: set to `false` to keep the feature switched off even when the other vars are present.

> The model never receives vulnerability data — it only produces a validated query plan that the app executes under existing RBAC. Configuring this is optional; the "Ask AI" bar stays hidden until it is enabled.

## Optional (local/dev only)
- `LOCAL_AUTH_ENABLED`, `LOCAL_AUTH_USER`, `LOCAL_AUTH_PASS`, `LOCAL_AUTH_EMAIL`, `LOCAL_AUTH_NAME`

## Recommendations
- Keep secrets in Azure Key Vault and reference them via ACA Key Vault integration.
- Use managed identities for accessing other Azure resources where possible.
- Ensure `DATABASE_URL` uses SSL — Azure-managed Postgres requires TLS. Example: `postgresql://user:pass@host:5432/db?sslmode=require`.
- Rotate `AUTH_SECRET` and `PENTEST_JWT_SECRET` together — desynchronized values will silently fail every toolkit call.
