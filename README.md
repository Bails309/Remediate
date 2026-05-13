<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.jpg">
    <source media="(prefers-color-scheme: light)" srcset="public/logo-light.jpg">
    <img alt="Remediate Logo" src="public/logo-light.jpg" width="200">
  </picture>
  
  # Remediate
  <p><strong>Version:</strong> 2.6.2 (2026-05-14)</p>
  ### Direct, Serious, Zero Fluff
</div>

## Overview
Remediate is a Nessus remediation triage app built with Next.js, Prisma, PostgreSQL, and Redis. It ingests Nessus CSVs, diffs weekly uploads, tracks remediation status, and supports assignment workflows.

The platform now features **Organizational Buckets** (formerly Sites), providing a more flexible way to group and manage vulnerability scopes. It also includes **Enterprise Azure File Share Automation**, a comprehensive **Threat Intelligence Centre**, and a robust **Vulnerability Remediation Lifecycle** supporting managed "In Progress" states.

Administration has been streamlined into two consolidated hubs: **Settings** (Authentication, Storage, Import, Reports) and **Operations** (System Health, Dead Letters), significantly reducing interface clutter.

Additionally, Remediate features an isolated pentest toolkit service. The main app proxies requests to the pentest backend over an internal Docker network and enforces role-based access control for the `/tools` UI.

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

### Core (All Nodes)
- `DATABASE_URL`: Postgres connection string.
- `AUTH_SECRET`: Shared secret used for encryption and JWT signing. Must be consistent across all nodes.
- `NVD_API_KEY`: (Optional) NIST NVD API Key to increase rate limits for threat intelligence sync.

### App Node (`remediate-app`)
- `REDIS_URL`: Redis connection string.
- `NEXTAUTH_URL` / `AUTH_URL`: Public URL of the application.
- `NEXTAUTH_SECRET`: Random string for session encryption.
- `ADMIN_EMAIL`: Initial admin account.
- **Local Auth**:
  - `LOCAL_AUTH_ENABLED`: Set to `true` to enable credentials-based login.
  - `LOCAL_AUTH_USER` / `LOCAL_AUTH_PASS`: Credentials for the local admin.

### Worker Node (`remediate-worker`)
- `REDIS_URL`: Redis connection string.
- `NVD_API_KEY`: (Optional) API key for authenticated NVD requests.

### Pentest Node (`remediate-pentest-backend`)
- `PENTEST_JWT_ISSUER` / `PENTEST_JWT_AUDIENCE`: Optional JWT validation overrides.

Pentest toolkit:
- PENTEST_BACKEND_URL (defaults to http://pentest-backend:8000 in Docker)

AUTH_SECRET is used to encrypt OIDC config stored in Postgres.

External DB/Redis/Storage support:
- Set `DATABASE_URL` and `REDIS_URL` to your external services.
- The app does not depend on container-local storage for either service.
- **Azure Blob Storage**: Optionally use Azure Blob Storage for persistent upload storage. Configure via the Admin dashboard or env vars:
  - `AZURE_STORAGE_CONNECTION_STRING`
  - `AZURE_STORAGE_ACCOUNT_NAME` / `AZURE_STORAGE_ACCOUNT_KEY`
  - `AZURE_STORAGE_SAS_TOKEN`
  - `AZURE_STORAGE_CONTAINER_NAME` (required for Azure)

### Redis Requirements
- **Modules**: None required.
- **Eviction Policy**: `noeviction` is strongly recommended. Redis is used for job queueing and temporary payload storage; enabling eviction may lead to silent job loss if memory limits are reached.
- **Protocol Support**: Supports `redis://` (standard) and `rediss://` (TLS). TLS certificate validation can be toggled via `REDIS_TLS_REJECT_UNAUTHORIZED`.
- **Recommended Sizing**:
  - **Small/Standard**: 1GB - 2GB (e.g., Azure Cache for Redis C0/C1). Suitable for most use cases with moderate upload sizes and concurrency.
  - **Large/Enterprise**: 4GB+ (e.g., Azure Cache for Redis C2+). Recommended if you frequently process very large Nessus CSVs (>100MB) or have high concurrent upload activity.
  - **Note**: Memory usage is driven by CSV payloads which are stored in Redis for up to 2 hours during processing.

Docker compose overrides DATABASE_URL and REDIS_URL to use the db/redis service names.

## Upload Processing
- Uploads are queued in Redis and processed by the `worker` service.
- The API stores CSV payloads in Redis temporarily (2-hour TTL) for the worker to consume.
- Failed uploads retry up to 3 times with exponential backoff before landing in a dead-letter queue.
- Admins can requeue failed uploads from **Operations > Dead Letters**.

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
- app/: Next.js app router
- prisma/: Prisma schema
- Dockerfile: Multi-stage container build
- docker-compose.yml: Local dev stack (app, Postgres, Redis)

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
- **Testing**: Comprehensive E2E Playwright test suite — 45 tests across 14 files covering all application pages, login flow, RBAC enforcement, sidebar navigation, admin pages, health API, and 404 handling.
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
