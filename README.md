<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.jpg">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.jpg">
    <img alt="Remediate Logo" src="public/logo-light.jpg" width="200">
  </picture>
  
  # Remediate
  <p><strong>Version:</strong> 2.16.2 (2026-08-14)</p>
  ### Direct, Serious, Zero Fluff
</div>

## Overview
Remediate is a unified vulnerability remediation triage app built with Next.js, Prisma, PostgreSQL, and Redis. It ingests findings from multiple scanner families — **Nessus** CSVs, **pentest** PDFs, and **Azure Container Registry** CSV exports — diffs successive uploads, tracks remediation status, and supports full assignment / RBAC / notification workflows on top of a single `Vulnerability` table.

The platform features **Organizational Buckets** (formerly Sites), providing a flexible way to group and manage vulnerability scopes. It also includes **Enterprise Azure File Share Automation** and **Azure Blob Container Automation for ACR exports** (new in v2.8.0), a comprehensive **Threat Intelligence Centre**, and a robust **Vulnerability Remediation Lifecycle** supporting managed "In Progress" states.

**Group / Department RBAC** (v2.7.0) extends the single-team assignment model to enterprise group-based ownership: vulnerabilities can be scoped to organisational groups (departments) with member/leader roles, enforcing a server-side **visibility wall** so non-members cannot see grouped items even via direct URL or API. Group leaders receive a weekly Leader Digest summarising every active item their group owns.

**Multi-scanner ingest** (v2.8.0) introduces a `ScannerType` enum (`NESSUS`, `ACR`) that scopes every reconciliation query so ACR and Nessus scans of the same bucket cannot archive each other. See the [Azure Container Registry Ingest](#azure-container-registry-ingest-v280) section below for the operator overview.

**AI Assistant** (v2.10.0) adds a multi-turn chat to the Vulnerabilities page: operators can ask questions like *"Show me the most critical vulnerabilities that already have fixes available"* or *"Which packages should I prioritise updating first?"* instead of hand-assembling filters. The assistant reads findings through an **RBAC-scoped** `search_vulnerabilities` tool (it can only see rows the caller could already see) and checks a fixed allow-list of public package registries via `get_latest_version` to advise on upgrades. Because finding data is shared with the configured model, point it at a self-hosted/air-gapped endpoint if that data must not leave your network. The feature is **provider-abstracted** (Azure OpenAI, Azure AI Foundry, or any OpenAI-compatible `/v1` endpoint that supports tool calling) and stays hidden until an administrator enables it. See the [AI Assistant](#ai-assistant-v2100) section below.

Administration is split by privilege tier. **Site Admins** own installation configuration (Authentication, Storage, Scanner Import, Reporting, AI provider), identity (Users, Groups), the audit log and platform health. **Workspace Admins** own the workspace itself — dashboards, findings, Inventory (buckets, manual uploads, dead-letter queue) and upload Automation. Each administration area is its own page rather than a tab inside a hub, so every screen is linkable. See [Navigation & Roles](#navigation--roles-v2160).

**Custom dashboards** (v2.16.0) let any user build their own view — drag and resize widgets over vulnerability, threat-actor and upload data, keep it private, or publish it to the organisation. Widgets store the *query* rather than the *results*, so a published board is always current and every viewer sees it through their own permissions. If an AI provider is configured you can describe a widget in a sentence and have it drafted for you; the model only ever emits a validated JSON spec, never a database query. See [Custom Dashboards](#custom-dashboards-v2160).

**Threat Actors** (v2.16.0) adds the MITRE ATT&CK adversary catalogue to the Threat Intelligence Centre — 170+ groups with their tactics, tooling, attributed origin and targeting, refreshed weekly by the worker.

Additionally, Remediate features an isolated pentest toolkit service. The main app proxies requests to the pentest backend over an internal Docker network and enforces role-based access control for the `/tools` UI.

## Vulnerability Lifecycle & Archive Restore (v2.15.0)

Findings live in one of two tables, and the status you pick decides which:

| Tier | Statuses | Table | Where it shows up |
| :--- | :--- | :--- | :--- |
| **Active** | `Open`, `InProgress`, `InProgressWithCR`, `AwaitingVendor`, `Sunset` | `Vulnerability` | Triage queue, dashboard, digests, analytics |
| **Terminal** | `Remediated`, `FalsePositive`, `NoFixAvailable` | `VulnerabilityHistory` | **Archived Findings** view only |

Setting a terminal status **moves** the row between tables rather than updating it in place, which is what keeps the triage queries fast as the 12-month archive grows. Switch the scope dropdown on the Vulnerabilities page from **Active Findings** to **Archived Findings** to browse the archive, optionally narrowed by an archived-date range (Last 7 Days / Last 30 Days / This Quarter, or a custom `from`/`to`).

**Restoring an archived finding.** Archiving used to be a one-way door — a mis-clicked "Remediated", a false-positive call that later turned out to be real, or a vendor fix that regressed all needed manual database surgery. As of v2.15.0, an administrator can open any archived finding and click **Restore to active queue** in the detail sheet:

- The finding returns to the queue with status **`Open`**, keeping its original id, assignee, group, CR number, creation/last-seen timestamps, scanner type and ACR image details — so it lands back with its previous owner rather than as an orphan.
- Restore is **admin-only** (`site_admin` / `web_app_admin`) even though assignees and group leaders can archive. The archive is the record that someone accepted a risk or signed off a fix, so reversing it is a privileged action; the API returns `403` for everyone else regardless of the UI.
- If a scan run *after* the archive already re-created the same finding as a live row, the restore is refused with a clear message instead of creating a duplicate that would diverge and double-count in analytics.
- Both directions are written to the audit log — `vulnerability.archived` on the way in, `vulnerability.restored` on the way out — so `/admin/audit-log` shows who reopened what and which determination they overrode.

See [`docs/API.md` → Archiving & restoring](docs/API.md#archiving--restoring-v2150) for the full endpoint contract and [`SECURITY.md`](SECURITY.md#archive-restoration-v2150) for the control rationale.

## Navigation & Roles (v2.16.0)

The interface is an icon rail pinned to the left edge. Sections open on hover and can be **pinned** open by clicking them; a pinned panel stays put while you work and closes only when you dismiss it, press `Escape`, or click its close button.

| Section | Contains | Who sees it |
| :--- | :--- | :--- |
| **Insights** | Command Centre, Analytics, My Dashboards | Everyone signed in |
| **Vulnerabilities** | The triage queue (rail link, no flyout) | Everyone signed in |
| **Intelligence** | Threat Feed, Threat Actors | Toolkit users, auditors, workspace admins |
| **Inventory** | Buckets, Nessus CSV, Pentest PDF, ACR CSV, Dead Letter Queue, Tools | Workspace admins (Tools: toolkit roles) |
| **Automation** | Nessus File Share, ACR Blob Ingest | Workspace admins |
| **Settings** | Authentication, Storage, Scanner Import, Reporting, AI Insights, Users, Groups, Logs, System Status | **Site admins only** |

### Role model

| Role | Grants |
| :--- | :--- |
| **Site Admin** (`site_admin`) | Everything, including installation configuration, users, groups, audit logs and platform health. |
| **Workspace Admin** (`web_app_admin`) | Dashboards, analytics, vulnerabilities, Inventory and Automation. **No** access to site settings, identity or audit logs. |
| **Workspace User** (`web_app_user`) | Work findings within the group visibility wall. |
| **Workspace Auditor** (`web_app_auditor`) | Read-only workspace access; assigning it strips write-granting roles. |
| **Toolkit Admin / User** (`toolkit_admin`, `toolkit_user`) | The isolated pentest toolkit. |

> **Upgrading from ≤ 2.15.x**: `web_app_admin` previously behaved as a full administrator. After upgrading, users who genuinely need to manage OIDC, storage, users, groups or the audit log must hold `site_admin`. Nothing is silently migrated — review your role assignments in **Settings → Users**, where each role pill now carries a tooltip describing exactly what it grants.

## Custom Dashboards (v2.16.0)

**Insights → My Dashboards.** Create a board, then add widgets over three data sources:

| Source | Group by | Metrics |
| :--- | :--- | :--- |
| Vulnerabilities | Severity, Status, Bucket, Assignee, Group, Scanner, Month discovered | Count, Average CVSS |
| Threat actors | Actor type, Attributed origin, MITRE tactic, Target industry, Target region, Targeted technology | Count |
| Uploads | Status, Bucket, Month | Count |

Each widget renders as a single number, bar chart, donut, line chart or table, and can be dragged and resized on a 12-column grid (click **Arrange** to unlock the grid). Vulnerability widgets also accept severity and status filters.

**Describe it instead.** When an AI provider is configured (**Settings → AI Insights**), the builder offers a free-text box: *"open critical findings by bucket"* drafts the widget for you. The model is only ever asked for a small JSON object naming a source, a grouping and filters — it never sees your data and never writes a query. Whatever it returns is validated against the same allowlist the manual picker uses before anything runs.

**Publishing.** Boards start private. Publishing makes a board readable by everyone signed in, and **Make a copy** clones someone else's board into your own space so you can tailor it.

> **Why published boards are safe to share**: a widget stores its *query*, not its *results*. Every time a board is opened, each widget re-runs under the **viewer's** permissions and group memberships. Two people can open the same published board and legitimately see different numbers; nobody ever sees data through the author's eyes. Results are cached for 60 seconds, keyed by both the query and the viewer's scope.

Limits: 24 widgets per board, 50 rows per widget. See [`docs/API.md` → Dashboards](docs/API.md#13-dashboards-v2160) for the endpoint contract and the full spec grammar.

## Threat Actors (v2.16.0)

**Intelligence → Threat Actors** mirrors the MITRE ATT&CK Enterprise catalogue: every adversary group with its aliases, MITRE id, tactics, technique count and tooling, plus summary panels for tactic coverage, an industry/region heatmap, targeted technologies and most-used tooling.

- **Refresh** is automatic — the worker syncs on boot and weekly thereafter (ATT&CK publishes only a few releases a year). Site admins can force a refresh with `POST /api/threat-intelligence/actors`.
- **What is fact and what is inference**: tactics, technique counts, tooling, aliases and links come straight from ATT&CK. Actor type, attributed origin, target industries, target regions and targeted technologies are **keyword-derived from each group's description** because ATT&CK does not publish them as structured data. The UI labels these as derived; treat them as indicative, not authoritative.

## Prerequisites
- Docker Desktop (for local development)

## Local Development (Docker)
1. Copy env file:

   ```bash
   # Windows (PowerShell)
   copy .env.example .env

   # macOS / Linux
   cp .env.example .env
   ```

2. Start services:

   ```bash
   docker compose up -d --build
   ```

3. Open http://localhost:3000

4. Apply Prisma schema:

   ```bash
   # Alternatively run migrations from the host
   npx prisma migrate dev

   # Or inside a container (Windows example)
   docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:push
   ```

5. Optional seed data:

   ```bash
   docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:seed
   ```

## Seed Data
Seed an admin user and a sample bucket:
```bash
docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:seed
```

## Prisma
- Generate client:
  ```bash
  docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run prisma -- generate
  ```
- Apply schema to local DB:
  ```bash
  docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:push
  ```

## Environment Variables

> **TL;DR — minimum required to boot a production deployment**: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` / `AUTH_URL`, `PENTEST_JWT_SECRET` (must match across **app**, **worker**, and **pentest-backend** containers), and `ADMIN_EMAIL`.

### Core (All Nodes)
- `DATABASE_URL`: Postgres connection string. **Required.**
- `AUTH_SECRET`: Application encryption key used for OIDC/SMTP/storage secret encryption and inter-service JWT signing. **Required**, must be identical on every node.
- `PENTEST_JWT_SECRET`: Shared secret used by the app to sign — and by the pentest backend to verify — short-lived JWTs that authorize toolkit calls. **Required**, must be identical on the **app**, **worker**, and **pentest-backend** containers. Generate with `npx auth secret` or `openssl rand -base64 48`.
- `NVD_API_KEY`: *(Optional)* NIST NVD API key. Raises rate limits for the threat-intelligence sync.
- `NODE_ENV`: `production` for deployed environments.

### App Node (`remediate-app`)
- `REDIS_URL`: Redis connection string. **Required.**
- `NEXTAUTH_URL` / `AUTH_URL`: Public URL of the application. **Required** for OIDC/SSO redirects.
- `NEXTAUTH_SECRET`: Random string for session encryption. **Required.**
- `ADMIN_EMAIL`: Initial admin account (also used as the bootstrap account that is always allowed to sign in). **Recommended.**
- `BLOCK_UNKNOWN_SSO`: When unset or any value other than the literal `false`, unknown SSO/OIDC sign-ins are blocked to prevent silent account creation. Set to `false` to permit auto-provisioning. **Recommended default: blocked.**
- `PENTEST_BACKEND_URL`: URL of the pentest backend (defaults to `http://pentest-backend:8000` inside Docker; required when the backend lives on a separate hostname).
- **Local Auth**:
  - `LOCAL_AUTH_ENABLED`: Set to `true` to enable credentials-based login (useful for first-time bootstrap).
  - `LOCAL_AUTH_USER` / `LOCAL_AUTH_PASS` / `LOCAL_AUTH_EMAIL` / `LOCAL_AUTH_NAME`: Credentials for the local admin.

### Worker Node (`remediate-worker`)
- `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `PENTEST_JWT_SECRET` (all **Required** — values must match the app node).
- `NVD_API_KEY`: *(Optional)* API key for authenticated NVD requests during threat-intelligence syncs.

### Pentest Node (`remediate-pentest-backend`)
- `DATABASE_URL`, `REDIS_URL`: **Required** if the backend logs executions to the shared store.
- `PENTEST_JWT_SECRET`: **Required.** Must match the app and worker values exactly.
- `PENTEST_JWT_ISSUER` / `PENTEST_JWT_AUDIENCE`: *(Optional in dev, recommended in prod)* JWT validation claims. Default to `remediate-prod` / `pentest-backend-prod`.
- `AUTH_TRUST_HOST`: Set to `true` when running behind a proxy (e.g., Azure Container Apps).
- `TOOLS_CONFIG_PATH`: *(Optional)* Override path to `tools.json` (defaults to `/config/tools.json`).
- `PORT`: *(Optional)* Listen port, defaults to `8000`.

### Azure Blob Storage (Optional)
Configure via the Admin dashboard or env vars when persistent upload storage is desired:
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME` / `AZURE_STORAGE_ACCOUNT_KEY`
- `AZURE_STORAGE_SAS_TOKEN`
- `AZURE_STORAGE_CONTAINER_NAME` (required when any Azure storage var is set)

### AI-Powered Insights (Optional)
Preferred configuration is the **Settings > AI Insights** dashboard (endpoint + key encrypted at rest in the `AiConfig` table). These variables are a declarative fallback used **only when no database row exists**:
- `AI_PROVIDER`: one of `azure-openai`, `foundry`, `openai-compatible`.
- `AI_BASE_URL`: provider endpoint (Azure OpenAI resource root, Foundry resource root, or an OpenAI-compatible base including the `/v1` segment).
- `AI_API_KEY`: provider API key.
- `AI_MODEL`: model name — the **deployment name** for Azure OpenAI.
- `AI_API_VERSION`: *(Azure OpenAI / Foundry only)* Azure OpenAI uses a dated version, e.g. `2024-10-21`; Foundry uses `preview` (the default) or `v1`.
- `AI_INSIGHTS_ENABLED`: set to `false` to keep the feature off even when the other vars are present.

### Redis Requirements
- **Modules**: None required.
- **Eviction Policy**: `noeviction` is strongly recommended. Redis is used for job queueing and temporary payload storage; enabling eviction may lead to silent job loss if memory limits are reached.
- **Protocol Support**: Supports `redis://` (standard) and `rediss://` (TLS). TLS certificate validation can be toggled via `REDIS_TLS_REJECT_UNAUTHORIZED`.
- **Clustered Redis**: Set `REDIS_CLUSTER_MODE=true` on **all** containers when targeting Azure Cache for Redis with clustering enabled. BullMQ keys are tagged with `{bull}` to keep related keys on the same shard.
- **Recommended Sizing**:
  - **Small/Standard**: 1GB – 2GB (e.g., Azure Cache for Redis C0/C1). Suitable for most use cases with moderate upload sizes and concurrency.
  - **Large/Enterprise**: 4GB+ (e.g., Azure Cache for Redis C2+). Recommended if you frequently process very large Nessus CSVs (>100MB) or have high concurrent upload activity.
  - **Note**: Memory usage is driven by CSV payloads which are stored in Redis for up to 2 hours during processing.

Docker compose overrides `DATABASE_URL` and `REDIS_URL` to use the `db`/`redis` service names.

## Upload Processing
- Uploads are queued in Redis and processed by the `worker` service on the shared `{upload-queue}` BullMQ queue.
- The API persists the upload payload to the configured storage provider (Redis for the default 2-hour TTL path, or Azure Blob Storage / File Share when configured), then enqueues a job stamped with a `scannerType` (`NESSUS` or `ACR`).
- The worker dispatches by `scannerType`: `processNessusUpload` for CSVs / PDFs from Nessus and pentest sources, `processAcrUpload` for Azure Container Registry CSV exports. Every reconciliation query is scoped by `scannerType` so scanners never archive each other's findings.
- Failed uploads retry up to 3 times with exponential backoff before landing in a dead-letter queue.
- Admins can requeue failed uploads from **Operations > Dead Letters**.

### Azure Container Registry Ingest (v2.8.0)
Remediate ingests ACR vulnerability CSV exports two ways:

1. **Manual upload** — `/uploads` → **Manual** tab → **ACR CSV** selector. Same UI flow as the existing CSV upload; the API endpoint is `POST /api/uploads/acr`.
2. **Automated blob-container polling** — configure once under `/admin/azure-blob-ingest`. The worker scheduler polls the container on your configured interval, ingests every CSV matching the optional prefix, and (by default) **deletes each blob** after it's successfully queued so a rescan on the same repository lands as an update rather than a duplicate.

**CSV schema** (headers are case-insensitive, BOM-tolerant, and accept common aliases such as `CVE`, `Package Name`, `Registry Name`):

```
timeGenerated, registryName, repository, imageDigest, severity, cveId, packageName, installedVersion, description, remediation
```

**Dedup key**: `(siteId, scannerType=ACR, pluginId=cveId, host, port)` where `host = "{registryName}/{repository}"`, `port = packageName`, `protocol = "container"`. `imageDigest` is stored but **excluded** from the dedup key so rescans on new digests touch the same finding rather than creating duplicates.

**Storage credentials** are stored encrypted (AES-256-GCM via `lib/crypto.ts`) and never echoed back — the GET endpoint returns a `"****"` sentinel that means "keep the existing value" on save.

## AI Assistant (v2.10.0)
Chat with an AI assistant about your active findings instead of manually combining the risk / status / scanner / package filters. A floating launcher sits in the bottom-right corner of the Vulnerabilities page and opens a multi-turn chat panel that reads your findings and can check for newer package releases. A second, per-finding launcher inside the **Vulnerability Details** sheet opens a chat scoped to that one issue.

**Naming the assistant (v2.16.1).** Site admins can give it a name under **Settings → AI Insights** (max 40 characters). The name is used on the launcher, in the chat header and in the assistant's own system prompt, so it introduces itself correctly. Leave the field blank for the default of *Ask AI*, or set `AI_ASSISTANT_NAME` if you provision declaratively. Because the value reaches the model's system message, whitespace is collapsed to a single line and the length is capped — see [SECURITY.md](SECURITY.md#ai-assistant).

**Example questions**
- *"Show me the most critical vulnerabilities that already have fixes available."*
- *"Which container packages should I prioritise updating first?"*
- *"List internet-facing pentest findings with a CVSS of 7 or higher."*
- *"What's still open on host web-prod-01?"*

**How it works.** The assistant is a tool-using chat. To answer, the model calls a `search_vulnerabilities` tool whose results are executed under your existing **RBAC / group-visibility wall** — so it can only ever read rows you could already see — and a `get_latest_version` tool that queries a fixed allow-list of public package registries (npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist, Go) to tell you whether a newer, fixed release exists. Search arguments are validated against a strict [Zod schema](lib/ai/query-spec.ts) (unknown keys stripped) and there is no raw SQL in the path. Because finding data is sent to the configured model, point `AI_PROVIDER` at a self-hosted/air-gapped endpoint if that data must not leave your network. Every turn is rate-limited and written to the audit log as `ai_insight_chat`. The provider must support tool/function calling.

**Providers.** The integration is abstracted over three request shapes, all speaking the OpenAI chat-completions format:

| Provider | `AI_PROVIDER` | Endpoint (`AI_BASE_URL`) | Auth | `AI_MODEL` |
| :--- | :--- | :--- | :--- | :--- |
| Azure OpenAI | `azure-openai` | `https://<res>.openai.azure.com` | `api-key` header + `api-version` | Deployment name |
| Azure AI Foundry | `foundry` | `https://<res>.services.ai.azure.com` | `api-key` header | Deployment name |
| OpenAI-compatible | `openai-compatible` | e.g. `https://api.openai.com/v1`, `http://ollama:11434/v1` | `Authorization: Bearer` | Model name |

**Configuration.** Configure once under **Settings > AI Insights** (endpoint and API key are AES-256-GCM encrypted in the `AiConfig` table, matching the OIDC / SMTP / storage pattern) or via the optional `AI_*` environment variables above. Use the **Test Connection** button to verify credentials before saving. The bar is hidden for all users until the feature is enabled.

## Threat Intelligence & Reports
- **Live Feed**: View real-time vulnerability data from NVD, OSV, and CISA KEV in the Intelligence Centre.
- **Daily Digest**: Configure SMTP and schedule daily vulnerability summaries (08:00 AM) in /dashboard.
- **Risk Filtering**: Set minimum risk thresholds (Critical/High/etc.) to filter notification noise.
- **Intelligent Linking**: Direct access to NVD (NIST) and OSV.dev source records for verified intelligence.
- **Weekly Reports**: Schedule weekly Nessus triage summaries in **Settings > Reports**.
- Report settings and OIDC configurations are encrypted in Postgres using AUTH_SECRET.

### NVD API Access
The Threat Intelligence Centre performs bulk requests to the NVD CVE API (especially during initial sync).
- **Unauthenticated**: 5 requests per 30 seconds.
- **Authenticated**: 50 requests per 30 seconds (Recommended).

To obtain an API key, register at the [NVD Developer Portal](https://nvd.nist.gov/developers/request-an-api-key). Once obtained, set the `NVD_API_KEY` environment variable on your worker node.

## Migrations
On container startup the `app` and `worker` entrypoints run `prisma migrate deploy` inside `scripts/migrate.js`.

Key points:
- `scripts/migrate.js` waits for the database to be reachable, then acquires a Postgres advisory lock before running `npx prisma migrate deploy`. This ensures only one instance applies migrations at a time.
- The repository also includes a guarded `scripts/optimize-db.ts` script that applie(s) optional database optimizations (indexes, views, VACUUM). The app startup command runs this after migrations when appropriate.
- A CI workflow (.github/workflows/migrations.yml) is provided to run migrations + DB optimizations as part of your deploy pipeline — recommended for production.

Recommended patterns:
- CI-driven: run `npx prisma migrate deploy` in your CI before updating production containers (strongly recommended for Azure Container Apps).
- Runtime fallback: keep `scripts/migrate.js` as a startup fallback — advisory lock prevents concurrent runs but CI-first is preferred to avoid runtime surprises.

To run migrations locally:
```bash
# Run migrations (development)
npx prisma migrate dev

# Run migrations (deploy-style)
npx prisma migrate deploy
```

## Authentication
- OIDC is configured via .env or the **Settings > Authentication** UI.
- If you prefer UI configuration, set the values in the Admin page and redeploy or restart to pick them up.

To create a portal tile (for example Microsoft MyApplications) that immediately starts SSO when clicked, point the tile at your app's NextAuth provider signin URL. Example:

```
https://<your-domain>/api/auth/signin/keycloak

// Optionally include a callbackUrl to return users to a specific page after sign-in:
https://<your-domain>/api/auth/signin/keycloak?callbackUrl=https%3A%2F%2F<your-domain>%2Fdashboard
```

The provider id (`keycloak` above) matches the provider added in `auth.ts`.

Alternatively, you can point portal tiles at the login page which will automatically start the Keycloak flow and is often more reliable when embedded in portals:

```
https://<your-domain>/login?sso=keycloak

// With a callback:
https://<your-domain>/login?sso=keycloak&callbackUrl=https%3A%2F%2F<your-domain>%2Fdashboard
```

## Pentest Toolkit
- The pentest backend runs in a separate container without host-exposed ports.
- Tools are defined in `pentest-backend/config/tools.json` and mounted into the backend container.
- Only users with `pentest_user`, `pentest_admin`, or `site_admin` roles can access `/tools`.
- Execution logs are stored in Postgres in the `PentestExecution` table.

Local development notes (pentest-backend):

- The pentest backend is reachable from the app via the internal Docker network at `http://pentest-backend:8000`. For local Next.js running on the host you can set `PENTEST_BACKEND_URL=http://localhost:8000` in your `.env` and expose the backend with `ports: - "8000:8000"` in `docker-compose.yml` (not the default for security).
- If the pentest backend needs to resolve public domains, the compose file now configures DNS servers for the service and attaches it to the default network to allow outbound network access. See `docker-compose.yml` for the `dns:` and `networks:` entries.
- Tools are strictly allowlisted via `pentest-backend/config/tools.json`. Review allowed flags and inputs before enabling additional tools.
- The backend requires `AUTH_SECRET` to validate signed tokens issued by the app; the app signs short-lived JWTs for proxying requests to the toolkit.

Security note:
- The pentest toolkit executes native binaries. In production, run it in an isolated environment with strict network egress controls, resource limits, and audit logging. Consider running as a separate project with dedicated secrets and monitoring.

## Deployment (Azure Container Apps)
High-level steps:
1. Build and push image to ACR (or another registry).
2. Provision Azure Database for PostgreSQL and Azure Cache for Redis.
3. Create an Azure Container Apps environment and app.
4. Configure app secrets and environment variables in ACA.
5. Enable ingress, set the container port to 3000, and deploy.

Recommended ACA settings:
- Min replicas: 0, Max replicas: 3+
- Scale on HTTP concurrency
- Use managed identities for Azure resources where possible

Migration recommendation for ACA:
- Use a CI-driven migration step or an Azure Container Apps Job to run:
  - `npx prisma migrate deploy`
  - `npx tsx scripts/optimize-db.ts`
- Keep the runtime `scripts/migrate.js` as a safe fallback — it uses an advisory lock so multiple replicas won't race.

CI example: see `.github/workflows/migrations.yml` which runs migrations and DB optimizations on push to `main`.

## Repo Structure
- app/: Next.js app router (`(app)` authenticated shell, `(auth)` sign-in, `api/` route handlers)
- components/: Shared UI — including `dashboards/` (widget renderer + builder) and `analytics/` (recharts wrappers)
- lib/: Server-side domain logic — `ingest`, `dashboards/`, `ai/`, `threat-intelligence/`, `rbac`, `group-rbac`, `security-score`
- prisma/: Prisma schema and migrations
- scripts/: Worker entrypoint, migration runner, operational scripts
- tests/: `unit`/`api`/`lib`/`components`/`integration` (Vitest) and `e2e` (Playwright)
- Dockerfile: Multi-stage container build
- docker-compose.yml: Local dev stack (app, worker, Postgres, Redis, pentest backend)

## Documentation Map

| Document | Purpose |
| :--- | :--- |
| [README.md](README.md) | Operator-facing overview, environment variables, and quick-start. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Component breakdown, data flow, and runtime stack. |
| [SECURITY.md](SECURITY.md) | Security controls, secrets handling, and dependency policy. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Container build, ACA deployment, and migration patterns. |
| [CHANGELOG.md](CHANGELOG.md) | Full release history (Keep a Changelog + SemVer). |
| [docs/API.md](docs/API.md) | Comprehensive HTTP API reference for every route under `app/api`. |
| [docs/AZURE_ENV_VARS.md](docs/AZURE_ENV_VARS.md) | Azure-specific environment variable reference. |
| [docs/DEPLOY_AZURE_CONTAINER_APPS.md](docs/DEPLOY_AZURE_CONTAINER_APPS.md) | Detailed ACA deployment walkthrough. |
| [docs/LOCAL_DOCKER.md](docs/LOCAL_DOCKER.md) | Local Docker development workflows. |
| [docs/PRODUCT_TOUR_DEBUG.md](docs/PRODUCT_TOUR_DEBUG.md) | Debugging the Shepherd-based product tours. |

## Feedback & Audit APIs

### Submit Feedback (authenticated users)

```
POST /api/feedback
Content-Type: application/json
Cookie: <session cookie>

{
  "type": "bug" | "feature" | "general",
  "message": "Description (5–5000 chars)",
  "page": "/dashboard"          // optional — auto-populated by the UI
}
```

Returns `{ "success": true }` on 200. Rate limited per user.

### Retrieve Feedback (site_admin only)

```
GET /api/feedback
Cookie: <session cookie>
```

Returns the 100 most recent entries:

```json
[
  {
    "id": "...",
    "userEmail": "user@example.com",
    "newValue": { "type": "bug", "message": "...", "page": "/dashboard" },
    "createdAt": "2026-04-02T12:00:00.000Z"
  }
]
```

### Audit Log (site_admin only)

```
GET /api/admin/audit-log?page=1&limit=50&action=feedback.submit&entityType=Feedback
Cookie: <session cookie>
```

Supports filtering by `action` and `entityType`. Returns paginated results with total count.

## Release notes

> [`CHANGELOG.md`](CHANGELOG.md) is the canonical, complete history — every release including patch-level fixes, with full root-cause write-ups. The entries below are condensed highlights of the feature-bearing releases.

### [2.16.2] - 2026-08-14
- **Ask the assistant to "Generate a ticket to an external supplier"** from any finding. Produces a self-contained write-up — subject, plain-English impact, affected package/version/host, severity and CVSS, technical detail, and a requested action — with no internal ids or links, so it can be emailed or pasted into a vendor portal for a third party with no access to this system.

### [2.16.1] - 2026-08-13
- **The AI assistant can be given a name.** Set it under **Settings → AI Insights** (or `AI_ASSISTANT_NAME`); it appears on the launcher, in the chat header and in the assistant's own system prompt so it introduces itself correctly. Blank uses the default of *Ask AI*. The value reaches the model's system message, so whitespace is collapsed and the length capped at 40 characters.
- **The AI launcher moved to a floating bottom-right button**, the corner the chat window opens into, replacing the full-width banner above the filter grid and returning ~90px of vertical space to the findings list.
- **Security — corrected a false privacy claim.** The AI Insights admin page still stated that vulnerability data is never sent to the provider. That described the v2.9.0 query planner, replaced in v2.12.0 by a tool-using assistant that genuinely does send findings. The copy now says so plainly.
- **Security — CI gained the scanners it was missing**: Trivy on both runner images (`npm audit` only ever saw the JS tree), CodeQL for `javascript-typescript` and `actions`, and a Semgrep timeout fix — at the 5s default it was abandoning `vulnerabilities-client.tsx` entirely after three rule timeouts, leaving the largest component unscanned.
- **+103 unit tests** covering the three highest-risk untested surfaces from 2.16.0: `proxy.ts` (the edge RBAC layer), all eight dashboard routes, and `report-scheduler.ts`. Adds a Prisma schema-drift CI gate and a Dependabot configuration.
- **Fixed**: `?limit=abc` on the threat-actors API reached Prisma as `take: NaN` and returned `500`; CI ran `prisma migrate deploy || true`, so a broken migration passed and only failed on deploy.

### [2.16.0] - 2026-08-13
- **Personal dashboards with a spec-driven widget engine.** New `Dashboard` / `DashboardWidget` models, a drag/resize grid, five visualisations, and a builder with a live preview. A widget persists its **query**, never its results, so published boards stay current and every viewer sees them through their own permissions (Redis cache is keyed on spec **and** viewer scope).
- **AI widget planning.** `POST /api/dashboards/plan` turns a sentence into a widget. The model emits a strict-Zod-validated JSON spec only — no SQL, no database access, no field it could invent — and the server executes it deterministically with Prisma under the caller's RBAC.
- **Threat Actors.** MITRE ATT&CK Enterprise adversary catalogue (176 groups) with tactics, tooling, attributed origin and targeting, synced on worker boot and weekly. Structured ATT&CK data and keyword-derived attribution are visually distinguished throughout.
- **Security Score** gauge on the command centre — severity-weighted remediation posture with an 8-week discovery sparkline — plus an **audit log UI** for the previously headless `AuditLog` table, and a **System** option on the theme toggle.
- **Navigation rebuilt** as an 88px icon rail with pinnable hover flyouts (Insights · Vulnerabilities · Intelligence · Inventory · Automation · Settings), reclaiming ~56px for content. Administration hubs are split into standalone linkable pages, uploads are split per source, and upload automation moved under Automation.
- **Security — `web_app_admin` no longer implies site administration.** New `requireSiteAdmin()` / `checkSiteAdmin()` restrict installation configuration, users, groups, audit logs and platform health to `site_admin`, enforced at the edge, the page and the route handler. Three admin pages that had no server-side guard at all now have one. **Review your role assignments after upgrading.**
- **Fixed**: threat-intelligence syncs no longer stop when scheduled reporting is unconfigured; grouped widgets failed on an invalid `_avg: undefined` Prisma argument; failing widgets showed a permanent "Loading…"; three navigation flyout defects (unlayered `.glass-edge` beating Tailwind's `absolute`, hover-then-click cancelling itself, pinned panels closing on outside clicks).

### [2.15.0] - 2026-08-11
- **Archived findings can be restored to the active queue.** New admin-only `POST /api/vulnerabilities/{id}/restore` and a **Restore to active queue** button in the detail sheet for records in the Archived Findings view. The finding returns as `Open` with its original id, assignee, group, CR number, timestamps, scanner type and ACR image columns intact.
- **Safeguards**: the restore is refused with `409` when a later scan has already re-created the same `(siteId, scannerType, pluginId, host, port)` finding as a live row (prevents a duplicate that would diverge and double-count in analytics); the `VulnerabilityHistory` row is deleted rather than retained, because `lib/ingest.ts` treats a surviving `FalsePositive`/`NoFixAvailable` history row as a standing determination and would silently re-archive the finding on the next import.
- **Audit**: restores are logged as `vulnerability.restored` (old status → `Open`), completing the round trip with the existing `vulnerability.archived` entry.
- **Docs**: `docs/API.md` gains an *Archiving & restoring* deep-dive; `ARCHITECTURE.md` and `SECURITY.md` document the two-table lifecycle and the privilege boundary.

### [2.14.0] - 2026-08-07
- **Nessus imports are streamed end to end, removing the file-size ceiling.** Every stage previously held the whole CSV as one JS string, so files above Node's ~512MB string limit (e.g. a 773MB production export) could never import. `StorageProvider` gains `saveStream()`/`readStream()`, `parseNessusCsvStream()` yields row-at-a-time, and ingest flushes to Postgres in 500-row batches. Peak memory is now a function of batch size, not file size. `AZURE_FILE_SHARE_MAX_IMPORT_MB` default raised 128MB → 4096MB.

### [2.13.x] - 2026-08-05 → 2026-08-07
- **Ingest & worker stability series.** Root-caused and fixed a long-running "worker goes Stale / uploads stuck in Processing" incident: an `ERR_STRING_TOO_LONG` crash loop in the Azure File Share import (2.13.7), an uncached CISA KEV download parsed 1,604× per threat sync (2.13.5), unthrottled threat-ingest jobs starving the upload queue (2.13.6), 11 independent Redis Cluster clients per worker tripping Azure Managed Redis connection rate limits (2.13.3), and missing `(siteId, scannerType, status)` indexes that turned reconciliation into full sequential scans of the archive (2.13.1). Added event-loop-lag/heap diagnostics and per-phase ingest timings (2.13.4).
- **Negated search** on the vulnerabilities list — prefix a term with `!` or `-` to exclude matches (2.13.0).

### [2.12.x] - 2026-08-04 → 2026-08-05
- **Futuristic "command centre" UI pass** (2.12.0) — animated count-up stat numbers, HUD corner brackets, cursor-following spotlight, ambient backdrop and scanline sweep, all disabled under `prefers-reduced-motion`.
- **Ask AI panel refresh** (2.12.1, 2.12.2) — now a compact, non-modal floating chat window with `Escape` to close.
- **Reliability**: dedicated fail-fast heartbeat Redis connection so a healthy worker stops reporting "Stale" (2.12.3); ingest per-site lock acquire/release made fail-fast so a stalled Redis can no longer wedge the queue (2.12.5); clustered Redis slots-refresh timeout and TLS SNI pinning (2.12.6).

### [2.11.0] - 2026-08-04
- **Ask AI about a single finding** — a per-issue chat launched from the Vulnerability Details sheet. The client sends only the finding id; the server re-fetches it under the same group-visibility wall, so the assistant can never be pinned to a finding the caller cannot see. `focusId` is recorded in the `ai_insight_chat` audit entry.

### [2.10.0] - 2026-08-04
- **"Ask AI" becomes a multi-turn, tool-using assistant.** Replaces the v2.9.0 query planner. The model reads findings through an RBAC-scoped `search_vulnerabilities` tool and checks a hard-coded allow-list of public package registries (npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist, Go) via `get_latest_version`. New `GET|POST /api/vulnerabilities/chat` with a bounded 6-iteration tool loop; rate-limited and audited as `ai_insight_chat`. Removed the superseded `POST /api/vulnerabilities/insights`.
- **Privacy posture change (intentional)**: enabling the assistant now shares the finding rows a caller can already see with the configured model. Point `AI_PROVIDER=openai-compatible` at a self-hosted/air-gapped model where that data must not leave the network.

### [2.9.0] - 2026-08-03
- **AI-powered natural-language insights** on the Vulnerabilities page, provider-abstracted across Azure OpenAI, Azure AI Foundry, and any OpenAI-compatible `/v1` endpoint. New `AiConfig` table with AES-256-GCM encrypted endpoint + API key, and an **AI Insights** tab under Admin → Settings. Superseded by the v2.10.0 assistant.
- Follow-up patches added Azure AI Foundry project-endpoint normalisation and `gpt-5`/o-series reasoning-model support (2.9.1), and cleared five `undici` advisories (2.9.3).

### [2.8.16] - 2026-07-23
- **New `AwaitingVendor` status** for findings escalated to an upstream vendor where the fix is out of the team's hands. Treated as **active**, so the item stays in the triage queue, digests and analytics, but renders with a distinct teal dot. Added across the DB enum, API validation, ingest reconciliation, analytics/dashboard aggregates, and notification filters.

### [2.8.0] - 2026-07-15
- **Azure Container Registry (ACR) Vulnerability Ingest**: Manual **"ACR CSV"** upload option on the Uploads page and a new **Azure Blob container** automation that polls a blob container, ingests every matching CSV, and (by default) deletes each blob after it's queued so rescans on the same repository land as updates rather than duplicates. Independent from the existing Azure File Share pipeline — its own account, container, and credentials.
- **Multi-scanner data model**: New `enum ScannerType { NESSUS, ACR }` and `scannerType` columns on `UploadHistory` / `Vulnerability` / `VulnerabilityHistory` (all default `NESSUS`). Every reconciliation query in `lib/ingest.ts` is now scoped by `scannerType` so an ACR ingest never archives a Nessus finding (or vice versa). New optional columns (`registryName`, `repository`, `imageDigest`, `packageName`, `installedVersion`, `remediation`, `timeGenerated`) preserve ACR-specific fidelity without changing the Nessus shape.
- **New APIs**: `POST /api/uploads/acr`, `GET|POST /api/admin/azure-blob-ingest`, `POST /api/admin/azure-blob-ingest/poll`, `POST /api/admin/azure-blob-ingest/test`. Secrets are always AES-256-GCM encrypted at rest via `lib/crypto.ts`; the GET endpoint returns a `"****"` sentinel instead of plaintext, and `"****"` on save means "keep the existing value".
- **New admin console**: `/admin/azure-blob-ingest` — enable toggle, auth-method selector (`CONNECTION_STRING` | `ACCOUNT_KEY` | `SAS_TOKEN`), account / container / prefix inputs, default-bucket picker, poll-interval spinner, delete-after-import checkbox, and Test / Run Now / Save.
- **Schema**: Migration `20260715120000_add_acr_scanner_type` — fully idempotent, additive, and safe to re-apply.

### [2.7.1] - 2026-07-14
- **BullMQ stuck-in-Processing fix (long-term hardening)**: Root cause was a shared `ioredis` proxy across the BullMQ `Queue`, the `Worker` (which needs its own blocking `bclient`), and general app usage. When Azure Cache for Redis dropped the idle blocking socket, BullMQ could not recover and uploads sat forever in **Processing**. Fix: every `Queue`/`Worker` now uses `getBullmqConnection()` for a dedicated connection, `keepAlive: 30_000` at the socket layer, and explicit `reconnectOnError` for `READONLY|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND`. Adds a 60-second `[QueueDepth]` log and a new `scripts/diagnose-queue.ts` triage script.

### [2.7.0] - 2026-06-10
- **Group / Department RBAC**: Vulnerabilities can now be owned by organisational groups (departments). Groups are a server-enforced **visibility wall** — only members + leaders + admins can see grouped items, even via direct URL. New `/admin/groups` page for create / rename / delete / membership management. New `GET|POST /api/groups`, `GET|PATCH|DELETE /api/groups/{id}`, and `POST|PATCH|DELETE /api/groups/{id}/members` routes. New `Vulnerability.groupId` column (nullable, `ON DELETE SET NULL`) plus matching `VulnerabilityHistory.groupId`. Vulnerabilities client gains a Group MultiSelect filter, a Leader badge, an admin-only Group column, and scope-aware Assign-to-Me. Weekly assignment digest now also emails each group leader a per-group **Leader Digest** of every active item the group owns.
- **Security — X-Frame-Options removed**: Deprecated header dropped in favour of the existing `Content-Security-Policy: frame-ancestors 'none'` directive (flagged in a pentest as redundant). No functional change — modern browsers continue to refuse framing.
- **Schema**: Migration `20260610120000_add_groups` adds `Group`, `GroupMembership`, `enum GroupMemberRole { member, leader }`, `Vulnerability.groupId`, `VulnerabilityHistory.groupId`, and supporting indexes. Additive and safe to re-apply.
- **Coverage**: 39 new unit tests across `lib/group-rbac.ts` and the new group endpoints. CI line coverage rises to **69.3%** (above the 68% floor) without lowering any threshold.

### [2.6.2] - 2026-05-14
- **Security**: Cleared all six outstanding `npm audit` advisories (1 high, 5 moderate). `next` `^16.2.3` → `^16.2.6` (13 GHSA fixes spanning cache poisoning, middleware bypass, SSRF, XSS, and DoS), `bullmq` `^5.76.0` → `^5.76.8` (transitive `uuid` fix), and added/updated `overrides` for `fast-xml-parser@5.8.0`, `postcss@8.5.10`, and `uuid@14.0.0`. `npm audit --audit-level=high --omit=dev` now reports **0 vulnerabilities**.
- **Vulnerabilities UI**: Findings whose plugin id starts with `PT` are now flagged with an amber **Internet-Facing** badge (single rows, grouped rows, expanded members, and the side-sheet banner) so external-attack-surface issues stand out.
- **Examples — Highlighted Evidence**: Yellow highlights from the source PDF are now extracted and surfaced inline in the Examples panel as `<mark>` spans, scoped to the exact finding and occurrence the assessor highlighted.
- **Parser hardening**: Stripped the `PT…-EX-NNN` header row from Examples blocks, removed the stray ASCII `n` produced when older Trustmarque templates render the severity bullet as a Wingdings glyph, and tightened ID normalisation so `pdfjs`-split hyphens (`PT3195 - EPT - 001`) no longer confuse the per-page highlight scoper.

### [2.6.1] - 2026-05-13
- **External PDF Processing API removed**: The optional external API path (Azure Logic App / Document Intelligence) is gone. Pentest PDFs are now parsed exclusively in-process by the built-in Trustmarque CHECK parser — no admin configuration, no encrypted API key, no outbound network calls. The `/admin/pdf-processing` settings page, its API routes, and the `PdfProcessingConfig` table / `PdfProcessor` + `PdfApiAuthScheme` enums have all been dropped.
- **Examples & References on vulnerability details**: Each finding's Examples block is persisted to `Vulnerability.pluginOutput` and its References list to `Vulnerability.seeAlso`. The side-sheet renders both — a wrapped monospace **Examples / Plugin Output** panel and a clickable References list.
- **Pentest PDF parser hardening**: Hostnames that wrap onto a second line in the Systems Affected table are now merged with their IP/port row before tokenising (fixes duplicate findings on reports like `PT3195-EPT-002`). Where the report supplies both a hostname and an IP, the ingested host is now the hostname.

### [2.6.0] - 2026-05-12
- **PDF Upload Pipeline**: New CSV/PDF toggle on the Uploads page. Penetration-test PDFs (≤25 MB) are persisted via the configured storage provider and ingested in-process as `Vulnerability` rows that inherit the existing assign / archive / remediate workflows. Severities are normalised into Critical/High/Medium/Low/Info and deduplicated against the report's stable plugin identifier.
- **Animated Live Progress**: The Uploads → Live Progress card now has a pulsing dot, a shimmering progress bar, a live elapsed timer, and a rotating tip strip so multi-minute PDF processing never looks frozen.
- **Dual Worker Runtime**: `scripts/worker.ts` now starts two BullMQ workers (CSV ingest + pentest PDF ingest) backed by the dedicated `{pentest-pdf-queue}` so large PDF processing never starves CSV ingest.
- **Schema**: Adds `enum UploadType { CSV, PDF }`, the `UploadHistory.uploadType` column (defaults to `CSV`), the singleton `PdfProcessingConfig` model, and `enum PdfApiAuthScheme { X_API_KEY, BEARER, BOTH, NONE }` with the `PdfProcessingConfig.authScheme` column. Migrations `20260512100000_add_pdf_processing` and `20260512140000_pdf_api_auth_scheme` ship the changes.

### [2.5.2] - 2026-05-12
- **Security**: Dependabot dependency bumps applied — `bullmq` `^5.41.0` → `^5.76.0`, `fast-xml-builder` `1.1.4` → `1.2.0` (via root override), and confirmation of `uuid@11.1.0` as the bullmq-pinned runtime.
- **Build**: Regenerated `package-lock.json` so deterministic installs reflect the new versions.
- **Docs**: Refreshed README, Architecture, Security, Deployment, and added a consolidated [API reference](docs/API.md). What's New card refreshed with a May 2026 hardening summary.

### [2.5.1] - 2026-04-14
- **Security**: Bumped `next` and `eslint-config-next` to `16.2.3`, `nodemailer` to `8.0.5`, and overrode transitive `vite` (`8.0.5`) and `defu` (`6.1.6`) for the latest patches.

### [2.5.0] - 2026-04-02
- **Feature**: Sunset Status — new lifecycle state that keeps vulnerabilities in the triage queue while excluding them from analytics.
- **Feature**: Sunset Analytics — dedicated analytics section with risk breakdown and host distribution for sunset items.
- **Feature**: Comments — add, edit, and delete comments on vulnerabilities with permission controls for admins, assignees, and collaborators.
- **Feature**: Comment Count Indicators — cyan badge on issue rows showing active comment count at a glance.
- **Feature**: What's New Modal — one-time tour card on next login summarising all April 2026 additions.
- **Security**: Dependency bumps for lodash, brace-expansion, flatted, fast-xml-parser, picomatch, effect, and nodemailer.
- **Ingest**: Sunset items are now matched during re-upload to prevent duplication.
- **Analytics**: Sunset items excluded from all core analytics; tracked in their own dedicated section.

### [2.4.1] - 2026-03-23
- **Testing**: Comprehensive E2E Playwright test suite — 72 tests across 17 files covering all application pages, login flow, RBAC enforcement, rail navigation and flyout pinning, dashboards and the widget allowlist, threat actors, admin pages, health API, and 404 handling.
- **CI**: Fixed E2E pipeline — added database schema push, seed data, and local auth environment variables so Playwright tests can authenticate against a real server.
- **Infra**: Restructured Playwright config with multi-project setup (auth fixture, unauthenticated, authenticated) and stored session state for efficient test execution.

### [2.4.0] - 2026-03-23
- **Security**: 28 security and logic fixes including timing-safe auth, cryptographic CSP nonce, SQL pattern injection prevention, RBAC hardening, rate-limit improvements, and transaction-guarded admin operations.
- **Testing**: Expanded unit test suite to 93 files / 373 tests with full CI/CD coverage gating.

### [2.3.9] - 2026-03-23
- **Fixed**: Refined Dialog aesthetics. Standardized button styles to use themed semi-transparent gradients instead of high-contrast solid colors.

### [2.3.8] - 2026-03-23
- **Security**: Hardened bulk update and inline assignment APIs with consistent RBAC (non-admins restricted to self/unassign).
- **Improved**: Unified error handling across all vulnerability update paths (Bulk, Inline, and Detailed).

### [2.3.7] - 2026-03-23
- **Security**: Restricted standard users to self-assignment and unassignment only. Reassignment to others now requires Admin privileges.
- **Improved**: Descriptive, server-side error messages now display in the UI for unauthorized actions.

### [2.3.6] - 2026-03-23
- **Fixed**: Self-Assignment Permissions. Standard users can now correctly assign vulnerabilities to themselves from the detailed view, resolving a regression in the triage workflow.

### [2.3.5] - 2026-03-23
- **Feature**: Themed Bulk Prompt. Replaced the browser's native `window.prompt` with a custom, ultra-modern `Dialog` component for bulk CR number entry.
- **Improved**: Consistent visual style across the entire triage lifecycle.

### [2.3.4] - 2026-03-23
- **Feature**: Bulk CR Number Support. Users are now prompted for a Change Request (CR) number when updating multiple vulnerabilities (including folded groups) to 'In Progress with CR'.
- **Improved**: Streamlined triage process for large groups of related issues.

### [2.3.3] - 2026-03-23
- **Fixed**: Support for deep linking to vulnerabilities via both `id` and `ids` query parameters.
- **Fixed**: Corrected counts in "Vulnerability Aging (SLA)" chart tooltips (removed misleading "Days" suffix).
- **Fixed**: Resolved a reinforcement loop that could cause the vulnerability side sheet to reopen automatically after being closed.
- **Improved**: Automatic list filtering and side sheet opening upon deep link access, with a visual focus indicator.

### [2.3.2] - 2026-03-23
- **Fixed**: Core support for deep linking to individual findings from external sources.

### [2.3.1] - 2026-03-23
- **Fixed**: Refined Weekly Assignment Summary to exclude collaborations.
- **Fixed**: Automatically clear collaborators when "Ask for Help" is disabled.

- **v2.1.0 — 2026-03-17**
  - **Feature**: Dismissed Finding Persistence (prevents re-creation of False Positives/No Fixes in ingestion).
  - **Ingest**: Enhanced multi-table lookup for historical triage state.

- **v2.0.1 — 2026-03-17**
  - **Fix**: Resolved Checkbox Event Propagation in the vulnerability table.

- **v2.0.0 — 2026-03-17**
  - **Rebranding**: Complete migration from "Sites" to "Buckets" for organizational scoping.
  - **Admin Consolidation**: Redesigned administrative menu into unified **Settings** and **Operations** hubs.
  - **Stability**: Full test suite stabilization (152/152 tests passing).
  - **Documentation**: Comprehensive upgrade of README and internal walkthroughs.

- **v1.7.0 — 2026-03-15**
  - Feature: Managed Vulnerability Lifecycle (`InProgress` & `InProgressWithCR` statuses).
  - Feature: CR Tracking (Mandatory numeric validation for Change Requests).
  - Feature: Mobile UX overhaul with dedicated side navigation menu.
  - Analytics: Full integration of new statuses into counters and historical trend analysis.
  - Fix: Notification scheduler stabilization and dashboard count logic corrections.

- **v1.6.0 — 2026-03-15**
  - Feature: Enterprise Azure File Share Automation (Polling, Ingestion, & Site Mapping).
  - UI: Real-time automation dashboard with live poll countdowns and manual triggers.
  - Fix: Database schema hardening for automated system imports (Optional `uploadedBy`).
  - Fix: Robust CSV header mapping and date format parsing for diverse report versions.
