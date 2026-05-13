# Architecture Overview

A high-level view of Remediate components and interactions.

> **Current release**: `v2.6.2` (2026-05-14). See [`CHANGELOG.md`](CHANGELOG.md) for the full version history and [`docs/API.md`](docs/API.md) for the API surface.

![Architecture diagram](docs/images/architecture-diagram.svg)

## Runtime Stack
| Layer | Technology | Pinned Version |
| :--- | :--- | :--- |
| Web framework | Next.js (App Router, React 19) | `^16.2.6` |
| ORM | Prisma | `^6.19.2` |
| Job queue | BullMQ | `^5.76.8` |
| Cache / queue backend | Redis (ioredis) | `^5.10.1` |
| Database | PostgreSQL | 14+ |
| Auth | NextAuth (Auth.js v5 beta) + OIDC | `^5.0.0-beta.30` |
| Validation | Zod | `^4.3.6` |
| PDF parsing (in-process) | pdf-parse + pdfjs-dist (legacy build) | `^2.4.5` / `^4.7.76` |
| UI primitives | Tailwind CSS, lucide-react, recharts, shepherd.js | — |
| Pentest backend | Express + tsx | `^4.19.2` |

## Core Components
- **`app` (Next.js)**: User-facing web UI and API routes. Exposes endpoints for admin management and vulnerability ingestion. Runs on port 3000.
- **`worker` (BullMQ)**: Background job processor running **two parallel workers**:
    - **CSV ingest** — Nessus upload parsing, diffing, and historical archival on the `{queue-name}` queue.
    - **Pentest PDF ingest** — Downloads PDFs from the configured storage provider, parses them in-process via `lib/pentest-pdf-builtin.ts` (the built-in Trustmarque CHECK parser), and writes the returned findings into the same `Vulnerability` table on the `{pentest-pdf-queue}` queue (concurrency 2). No external API or admin configuration is required.
    - **Threat Intelligence Sync**: Hourly delta and daily full syncs from NVD, OSV, and CISA KEV.
    - **Notification Dispatcher**: Daily 08:00 AM email digests based on user-defined risk filters.
- **Built-in Pentest PDF Parser** (`lib/pentest-pdf-builtin.ts`): In-process Trustmarque CHECK PDF parser. Uses [`pdf-parse`](https://www.npmjs.com/package/pdf-parse) for raw text extraction and [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (legacy build, loaded dynamically) for yellow-highlight detection via operator-list inspection. Yellow rectangles are intersected with text items per-page, joined into phrase buckets, and emitted as `\u0001HL\u0002...\u0001/HL\u0002` private-use markers in the persisted Examples payload. The client (`renderPluginOutput`) HTML-escapes the payload, then unwraps the markers into XSS-safe `<mark>` spans.
- **Threat Intelligence Centre (Frontend)**: Real-time vulnerability feed with source-aware external linking.
- **Unified Risk Schema (Prisma)**: Relational datastore for Nessus findings, global threats, and user-specific intelligence subscriptions.
- **Redis**: Job coordination via BullMQ, worker heartbeats, and temporary upload cache.
- **Azure Blob Storage (Optional)**: Persistent storage for upload payloads as an alternative to Redis (recommended for production clusters).

## Data Flow
1. **Ingestion (CSV)**: User uploads Nessus CSV. The API saves the payload to Redis (2-hour TTL) and enqueues a BullMQ job on the `{queue-name}` queue.
2. **Ingestion (PDF)**: User uploads a pentest PDF via the Uploads → PDF toggle. The API persists the binary to the active storage provider as base64 (`pentest-${uploadId}.pdf.b64`) and enqueues a job on the `{pentest-pdf-queue}` queue. Uploads always succeed provided the file is a PDF ≤ 25 MB (no admin configuration is required).
3. **Processing**: The matching worker dequeues the job, parses the payload in-process (CSV via `lib/ingest.ts`, PDF via `lib/pentest-pdf-builtin.ts`), filters results based on grace periods, and diffs against existing vulnerabilities. Pentest payloads are flattened by `lib/pentest-pdf.ts#flattenPentestPayload` and severity values are normalised case-insensitively into Critical/High/Medium/Low/Info; comma-separated ports are exploded into individual rows; each finding is keyed by the report's stable identifier (e.g. `PT3195-WEB-001`) so the unique `(siteId, pluginId, host, port, cve)` index continues to drive deduplication. Each finding's Examples block is persisted to `Vulnerability.pluginOutput` and its References list to `Vulnerability.seeAlso`; PDF yellow highlights become `<mark>` spans in the rendered Examples panel.
4. **Persistence**: Current findings are written to the `Vulnerability` table, and remediated items are archived to `VulnerabilityHistory`.
5. **Intelligence Aggregation**: Global threats are fetched, normalized via fallbacks (NVD Crisis logic), and stored with enrichment (CVSS/CISA KEV).
6. **Notification**: The dispatcher matches new threats against user preferences (Risk level/CISA status) and sends scheduled email digests.
7. **Analytics**: The UI queries aggregates to render dashboard metrics and the live intelligence feed.

## Scalability & Resiliency
- Stateless `app` and `worker` images support horizontal scaling.
- Advisory-lock protected migrations (`scripts/migrate.js`) prevent race conditions during cluster startup.
- Use managed Postgres and Redis (e.g., Azure Database for PostgreSQL, Azure Redis Cache) for production reliability.
- **Redis Cluster Support**: Uses Redis Hash Tags (`{bull}`) to ensure cross-slot compatibility in clustered environments.

## Security
- **RBAC**: Enforced at the API level for sensitive admin and pentest tool routes. Role hierarchy prevents non-site-admins from escalating privileges. Last-admin protections use database transactions to prevent race conditions.
- **Input Validation**: All API boundaries validate inputs with Zod schemas — status enums, UUID formats, content length limits, regex patterns, and page/limit caps.
- **Inter-service Auth**: Communication with the pentest backend is secured with short-lived, signed JWTs using `AUTH_SECRET`.
- **Encryption**: OIDC, SMTP, and Azure storage credentials are stored encrypted in Postgres using AES-256-GCM via `AUTH_SECRET`.
- **CSP**: Middleware generates a cryptographic nonce (`crypto.randomUUID`) per request for script and style sources.
- **Rate Limiting**: Authenticated routes key on user identity; unauthenticated routes key on IP with header-spoofing mitigation.

## Vulnerability Lifecycle
- **Statuses**: `Open`, `InProgress`, `InProgressWithCR`, `Sunset`, `Remediated`, `FalsePositive`, `NoFixAvailable`.
- **Active Statuses**: `Open`, `InProgress`, `InProgressWithCR`, and `Sunset` remain in the triage queue.
- **Sunset**: Keeps items visible for tracking but excludes them from analytics metrics. A dedicated analytics section tracks sunset items separately.
- **Comments**: Vulnerabilities support threaded comments. Admins, assignees, and collaborators can add, edit, and delete comments. Comment counts are surfaced as badges on table rows.

## Testing
- **Unit Tests (Vitest)**: 94 test files, 380+ tests covering API routes, library modules, components, and integration scenarios. CI gates on 75% coverage threshold.
- **E2E Tests (Playwright)**: 45 tests across 14 files using a multi-project setup:
  - `setup` — Authenticates via local credentials and saves session state.
  - `unauthenticated` — Tests login flow, RBAC redirects, health API, and 404 handling.
  - `chromium` — Tests all authenticated pages (dashboard, vulnerabilities, uploads, buckets, analytics, threat intelligence, 9 admin pages, sidebar navigation) using stored session state.
- **CI/CD (GitHub Actions)**: Lint, unit tests (Postgres + Redis services), integration tests, E2E (Playwright with DB schema push + seed data), Docker build, and CodeQL security scanning.

## Key File Locations
- **Threat Intelligence**: `lib/threat-intelligence/`, `app/api/threat-intelligence/`, `app/(app)/threat-intelligence/`
- **Background Workers**: `lib/ingest.ts`, `lib/queue.ts`, `lib/threat-intelligence/worker.ts`, `lib/pentest-pdf.ts`, `scripts/worker.ts`
- **PDF Processing**: `lib/pentest-pdf.ts` (ingestion pipeline), `lib/pentest-pdf-builtin.ts` (in-process Trustmarque CHECK parser), `app/api/uploads/pentest/` (operator upload)
- **DB Schema**: `prisma/schema.prisma`
- **Pentest Service**: `pentest-backend/`

## Versioning & Release Management
- **SemVer**: Versions follow `MAJOR.MINOR.PATCH`. Breaking schema or API changes bump `MAJOR`; user-visible features bump `MINOR`; bug-fix and dependency-only releases bump `PATCH`.
- **Source of truth**: `package.json#version`. Container images receive the same value via the `APP_VERSION` build-arg, surfaced on `/admin/health`.
- **Changelog**: All notable changes are recorded in [`CHANGELOG.md`](CHANGELOG.md) under the relevant version heading.
- **What's New**: User-visible releases ship a one-time card (`components/WhatsNew.tsx`) gated by a tour ID stored in `User.completedTours`. Tour IDs must be added to the whitelist in `app/api/tours/complete/route.ts` before they will be accepted.
- **Dependency hygiene**: Dependabot opens PRs for direct and transitive bumps. Root `overrides` in `package.json` are used when an upstream package has not yet released a fix that flows through transitively. As of `v2.6.2` the pinned set covers `nodemailer`, `vite`, `defu`, `magicast`, `picomatch`, `lodash`, `brace-expansion`, `flatted`, `fast-xml-parser@5.8.0`, `fast-xml-builder@1.2.0`, `postcss@8.5.10`, and `uuid@14.0.0`. `npm audit --audit-level=high --omit=dev` reports **0 vulnerabilities** at the time of release.
