# Architecture Overview

A high-level view of Remediate components and interactions.

> **Current release**: `v2.8.0` (2026-07-15). See [`CHANGELOG.md`](CHANGELOG.md) for the full version history and [`docs/API.md`](docs/API.md) for the API surface.

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
    - **Ingest worker** — processes the shared `{upload-queue}` and dispatches by the job's `scannerType`:
        - `NESSUS` — CSV / pentest-PDF ingest via `lib/ingest.ts#processNessusUpload`, with diffing and historical archival against Nessus rows only.
        - `ACR` — Azure Container Registry CSV ingest via `lib/ingest.ts#processAcrUpload`, with diffing and archival scoped to `scannerType = ACR` so it never touches Nessus rows.
    - **Pentest PDF ingest** — downloads PDFs from the configured storage provider, parses them in-process via `lib/pentest-pdf-builtin.ts` (the built-in Trustmarque CHECK parser), and writes the returned findings into the same `Vulnerability` table on the `{pentest-pdf-queue}` (concurrency 2). No external API or admin configuration is required.
    - **Threat Intelligence Sync**: Hourly delta and daily full syncs from NVD, OSV, and CISA KEV.
    - **Notification Dispatcher**: Daily 08:00 AM email digests based on user-defined risk filters.
    - **Automation schedulers** — `startAzureFileShareScheduler()` and `startAzureBlobIngestScheduler()` run inside the worker process and poll their respective storage sources on the configured interval.
- **Built-in Pentest PDF Parser** (`lib/pentest-pdf-builtin.ts`): In-process Trustmarque CHECK PDF parser. Uses [`pdf-parse`](https://www.npmjs.com/package/pdf-parse) for raw text extraction and [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (legacy build, loaded dynamically) for yellow-highlight detection via operator-list inspection. Yellow rectangles are intersected with text items per-page, joined into phrase buckets, and emitted as `\u0001HL\u0002...\u0001/HL\u0002` private-use markers in the persisted Examples payload. The client (`renderPluginOutput`) HTML-escapes the payload, then unwraps the markers into XSS-safe `<mark>` spans.
- **Azure Blob Ingest service** (`lib/azure-blob-ingest.ts`): Standalone poller that reads its config from `AzureBlobIngestConfig`, lists blobs in the configured container / prefix, and for each matching CSV: validates headers before writing anything, persists the payload as `acr-{uploadId}.csv` in the active storage provider, creates the `UploadHistory` row (`scannerType = ACR`), enqueues on `{upload-queue}`, and — on successful enqueue — deletes the source blob (opt-out via the `deleteAfterImport` flag).
- **Threat Intelligence Centre (Frontend)**: Real-time vulnerability feed with source-aware external linking.
- **Unified Risk Schema (Prisma)**: Relational datastore for Nessus, pentest, and ACR findings, plus global threats and user-specific intelligence subscriptions.
- **Redis**: Job coordination via BullMQ, worker heartbeats, and temporary upload cache. Every BullMQ `Queue` / `Worker` opens its own connection via `lib/redis.ts#getBullmqConnection` (fixed in v2.7.1) with `keepAlive: 30_000` so idle-socket drops on managed Redis do not stall the queue.
- **Azure Blob Storage (Optional)**: Persistent storage for upload payloads as an alternative to Redis (recommended for production clusters).

## Data Flow
1. **Ingestion (Nessus CSV)**: User uploads a Nessus CSV via `POST /api/uploads/nessus`. The API saves the payload to the active storage provider and enqueues a BullMQ job on the shared `{upload-queue}` with `scannerType: NESSUS`.
2. **Ingestion (Pentest PDF)**: User uploads a pentest PDF via `POST /api/uploads/pentest`. The API persists the binary to the active storage provider as base64 (`pentest-${uploadId}.pdf.b64`) and enqueues a job on the dedicated `{pentest-pdf-queue}` queue. Uploads always succeed provided the file is a PDF ≤ 25 MB (no admin configuration is required).
3. **Ingestion (ACR CSV — manual)**: Admin uploads an ACR CSV via `POST /api/uploads/acr`. Payload saved to the active storage provider under `acr-${uploadId}.csv`; enqueued on `{upload-queue}` with `scannerType: ACR`.
4. **Ingestion (ACR CSV — automated)**: The `AzureBlobIngestScheduler` polls the configured blob container every `pollIntervalMinutes`. For each matching blob it validates the CSV headers, persists the payload via the active storage provider, creates the `UploadHistory` row with `scannerType: ACR`, enqueues the job, and (when `deleteAfterImport` is true) deletes the source blob only after the enqueue succeeds. Failures leave the blob in place for the next poll.
5. **Processing**: The matching worker dequeues the job, parses the payload in-process (Nessus CSV via `lib/ingest.ts#processNessusUpload`, pentest PDF via `lib/pentest-pdf-builtin.ts`, ACR CSV via `lib/ingest.ts#processAcrUpload`), filters results based on grace periods, and diffs against existing vulnerabilities **scoped by `scannerType`** so scanners never archive each other's findings. Pentest payloads are flattened by `lib/pentest-pdf.ts#flattenPentestPayload` and severity values are normalised case-insensitively into Critical/High/Medium/Low/Info; comma-separated ports are exploded into individual rows; each Nessus / pentest finding is keyed by the report's stable identifier so the unique `(siteId, scannerType, pluginId, host, port, cve)` composite continues to drive deduplication. ACR rows are keyed by `(siteId, scannerType=ACR, pluginId=cveId, host, port)` with `host = "{registryName}/{repository}"`, `port = packageName`, `protocol = "container"`, and `imageDigest` stored but excluded from the dedup key.
6. **Persistence**: Current findings are written to the `Vulnerability` table, and remediated items are archived to `VulnerabilityHistory` (each row carries its own `scannerType` for provenance).
7. **Intelligence Aggregation**: Global threats are fetched, normalized via fallbacks (NVD Crisis logic), and stored with enrichment (CVSS/CISA KEV).
8. **Notification**: The dispatcher matches new threats against user preferences (Risk level/CISA status) and sends scheduled email digests.
9. **Analytics**: The UI queries aggregates to render dashboard metrics and the live intelligence feed.

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

## Multi-Scanner Ingest (v2.8.0)
Remediate ingests findings from three scanner families into the **same** `Vulnerability` table so the entire remediation workflow (assignment, RBAC, comments, analytics, notifications) works uniformly regardless of source.

### Scanner types
| `ScannerType` | Sources | Dedup key |
| :--- | :--- | :--- |
| `NESSUS` | Nessus CSV (`POST /api/uploads/nessus`), pentest PDF (`POST /api/uploads/pentest`) | `(siteId, scannerType, pluginId, host, port, cve)` |
| `ACR` | ACR CSV \u2014 manual (`POST /api/uploads/acr`) or automated (`AzureBlobIngestScheduler` reading from an Azure Blob container) | `(siteId, scannerType, pluginId, host, port)` |

Every reconciliation query in `lib/ingest.ts` \u2014 the "still-present" lookup, the "archive as remediated" delete, the `createMany` skip-duplicates, and the `VulnerabilityHistory` diff \u2014 is scoped by `scannerType`. This means:
- An ACR scan of a bucket never archives a Nessus finding in the same bucket.
- A Nessus rescan of a bucket never touches ACR rows.
- Running both scanners against the same bucket is fully supported and expected.

### ACR semantic packing
ACR CSV rows are packed into the existing Nessus column layout so no new indexes are required:
- `pluginId` \u2190 `cveId`
- `host` \u2190 `"{registryName}/{repository}"`
- `port` \u2190 `packageName`
- `protocol` \u2190 `"container"` (literal)
- `name` \u2190 `"{cveId} \u2014 {packageName} {installedVersion}"`

The optional columns (`registryName`, `repository`, `imageDigest`, `packageName`, `installedVersion`, `remediation`, `timeGenerated`) are also written for full-fidelity reporting, but `imageDigest` is **excluded** from the dedup key so a rescan on a new digest touches the same finding rather than creating a duplicate.

### Automated blob-container polling
```
AzureBlobIngestConfig (singleton)
  \u2502 enabled, authMethod (CONNECTION_STRING | ACCOUNT_KEY | SAS_TOKEN)
  \u2502 accountName, containerName, prefix?
  \u2502 defaultSiteId  \u2192 FK Site.id ON DELETE SET NULL
  \u2502 pollIntervalMinutes, deleteAfterImport
  \u2502 connectionStringEnc / accountKeyEnc / sasTokenEnc  (AES-256-GCM via lib/crypto.ts)
  \u2514 lastPollAt
```

Poll cycle (`AzureBlobIngestService.pollAndIngest`):
1. Skip if disabled or `defaultSiteId` is null.
2. List blobs under `containerName` filtered by `prefix`.
3. For each blob: download, `validateAcrCsv(text)` **before** any DB write. If headers are missing, skip and log \u2014 do **not** delete the source blob.
4. Persist the CSV text as `acr-{uploadId}.csv` via the active storage provider.
5. Insert an `UploadHistory` row with `scannerType: ACR`, then enqueue on `{upload-queue}`.
6. Only after a successful enqueue: if `deleteAfterImport` is `true`, delete the source blob. Delete failures are logged but do not fail the cycle \u2014 the next poll will see the blob again and idempotency at the CSV row level ensures no duplicate findings.

Authentication supports three modes matching the existing Azure File Share pattern:
- **CONNECTION_STRING** \u2014 full connection string. Highest fidelity, includes account key.
- **ACCOUNT_KEY** \u2014 `accountName` + storage key. Constructs `https://{accountName}.blob.core.windows.net`.
- **SAS_TOKEN** \u2014 `accountName` + SAS. Constructs `https://{accountName}.blob.core.windows.net?{sasToken}`. Recommended when you want to scope down to a single container with an expiry.

The three secret fields are **always** stored encrypted. The GET endpoint replaces them with `"****"`; passing `"****"` back on POST is treated as "keep the existing encrypted value" so administrators can edit the non-secret fields without re-entering credentials.

## Group / Department RBAC (v2.7.0)
Remediate models organisational ownership through **Groups** (departments) layered on top of the existing single-team / individual-assignment model. The implementation is a server-enforced **visibility wall**, not just a filter — a request that tries to read a grouped vulnerability outside the requester's group context is rejected at the API boundary regardless of how the URL was constructed.

### Data model
```
Group (id, name UNIQUE, description, idpGroupId, createdAt, updatedAt)
  │
  ├── GroupMembership (groupId, userId, role: member|leader, createdAt)
  │     PK = (groupId, userId)
  │     IDX (userId), (groupId, role)
  │
  ├── Vulnerability.groupId       → FK ON DELETE SET NULL, IDX (groupId, status)
  └── VulnerabilityHistory.groupId → FK ON DELETE SET NULL, IDX (groupId)
```
The `idpGroupId` column is reserved for future OIDC / Microsoft Entra ID group synchronisation — today the platform manages membership through the in-app `/admin/groups` console.

### Permission helpers (`lib/group-rbac.ts`)
| Helper | When it returns `true` |
| :--- | :--- |
| `getGroupContext(userId)` | Always — returns `{ memberOf, leaderOf }` for a single user (one indexed query). |
| `canViewVulnerability(isAdmin, ctx, vuln)` | Admin, or `vuln.groupId === null`, or user is a member of `vuln.groupId`. |
| `canSelfAssign(isAdmin, ctx, vuln)` | Same as `canViewVulnerability` — if you can see it you can pick it up. |
| `canEditVulnerability(isAdmin, ctx, userId, vuln)` | Admin, current assignee, or leader of `vuln.groupId`. |
| `canReassign(isAdmin, ctx, userId, vuln, targetUserId)` | Admin (any target), self-assign / unassign, or leader assigning to another member of the same group. |
| `canChangeGroup(isAdmin)` | Admin only. Leaders are bounded to their own group's items. |
| `canManageGroupMembership(isAdmin, ctx, groupId)` | Admin (any group), or leader of `groupId`. |

### Enforcement points
- **`GET /api/vulnerabilities`** — intersects any `groupIds=` query token with the requester's `memberOf` set **before** issuing the SQL, then `OR`s in `groupId IS NULL` for the open queue.
- **`GET /api/vulnerabilities/{id}`** — short-circuits with `403` when `canViewVulnerability` returns `false`.
- **`PATCH /api/vulnerabilities/{id}` & `POST /api/vulnerabilities/bulk`** — evaluate `canEditVulnerability` / `canSelfAssign` / `canReassign` per item; bulk updates abort on the first blocked item.
- **`/api/vulnerabilities/{id}/comments`** — re-checks the visibility wall before exposing collaborator content or accepting an `askForHelp` toggle.
- **`/api/groups/**`** — every membership-mutating route runs through `authoriseMembershipChange()` which calls `canManageGroupMembership`. The last-leader guard (PATCH demote + DELETE remove) protects non-admin leaders from accidentally dissolving their own group; only an admin can.

### UI surfaces
- **`/admin/groups`** — admin-only console for create / rename / delete groups and add / promote / remove members.
- **Vulnerabilities table** — Group MultiSelect filter (admin-scoped tokens are intersected server-side anyway), a **Leader** badge on rows the viewer leads, an admin-only inline Group dropdown for moving items between groups, and a scope-aware Assign-to-Me bulk action.
- **Sidebar** — new **Groups** entry under the admin navigation cluster.

### Notifications
The weekly assignment dispatcher (`lib/assignment-notifications.ts`) executes two passes:
1. **Individual digest** (existing) — each assignee receives a per-user summary of their own active items.
2. **Leader digest** (new) — each group leader receives a per-group summary of every active item the group owns (open / in-progress / in-progress-with-CR), grouped by assignee with an "Unassigned" bucket. Each digest links to `/vulnerabilities?groupIds={groupId}` for one-click triage.

## Testing
- **Unit Tests (Vitest)**: 94 test files, 380+ tests covering API routes, library modules, components, and integration scenarios. CI gates on 75% coverage threshold.
- **E2E Tests (Playwright)**: 45 tests across 14 files using a multi-project setup:
  - `setup` — Authenticates via local credentials and saves session state.
  - `unauthenticated` — Tests login flow, RBAC redirects, health API, and 404 handling.
  - `chromium` — Tests all authenticated pages (dashboard, vulnerabilities, uploads, buckets, analytics, threat intelligence, 9 admin pages, sidebar navigation) using stored session state.
- **CI/CD (GitHub Actions)**: Lint, unit tests (Postgres + Redis services), integration tests, E2E (Playwright with DB schema push + seed data), Docker build, and CodeQL security scanning.

## Key File Locations
- **Multi-scanner ingest**: `lib/ingest.ts` (`processNessusUpload`, `processAcrUpload`), `lib/csv.ts` (`validateNessusCsv`, `parseNessusCsv`, `validateAcrCsv`, `parseAcrCsv`), `lib/queue.ts`, `scripts/worker.ts`
- **ACR blob automation**: `lib/azure-blob-ingest.ts`, `lib/azure-blob-ingest-scheduler.ts`, `app/api/admin/azure-blob-ingest/`, `app/(app)/admin/azure-blob-ingest/`
- **Group RBAC**: `lib/group-rbac.ts`, `app/api/groups/`, `app/(app)/admin/groups/`, `prisma/migrations/20260610120000_add_groups/`
- **Threat Intelligence**: `lib/threat-intelligence/`, `app/api/threat-intelligence/`, `app/(app)/threat-intelligence/`
- **Background Workers**: `lib/ingest.ts`, `lib/queue.ts`, `lib/threat-intelligence/worker.ts`, `lib/pentest-pdf.ts`, `scripts/worker.ts`
- **PDF Processing**: `lib/pentest-pdf.ts` (ingestion pipeline), `lib/pentest-pdf-builtin.ts` (in-process Trustmarque CHECK parser), `app/api/uploads/pentest/` (operator upload)
- **Azure File Share automation**: `lib/azure-file-share.ts`, `lib/azure-file-share-scheduler.ts`, `app/api/admin/azure-file-share/`
- **DB Schema**: `prisma/schema.prisma`
- **Pentest Service**: `pentest-backend/`

## Versioning & Release Management
- **SemVer**: Versions follow `MAJOR.MINOR.PATCH`. Breaking schema or API changes bump `MAJOR`; user-visible features bump `MINOR`; bug-fix and dependency-only releases bump `PATCH`.
- **Source of truth**: `package.json#version`. Container images receive the same value via the `APP_VERSION` build-arg, surfaced on `/admin/health`.
- **Changelog**: All notable changes are recorded in [`CHANGELOG.md`](CHANGELOG.md) under the relevant version heading.
- **What's New**: User-visible releases ship a one-time card (`components/WhatsNew.tsx`) gated by a tour ID stored in `User.completedTours`. Tour IDs must be added to the whitelist in `app/api/tours/complete/route.ts` before they will be accepted.
- **Dependency hygiene**: Dependabot opens PRs for direct and transitive bumps. Root `overrides` in `package.json` are used when an upstream package has not yet released a fix that flows through transitively. As of `v2.8.0` the pinned set covers `nodemailer`, `vite`, `defu`, `magicast`, `picomatch`, `lodash`, `brace-expansion`, `flatted`, `fast-xml-parser@5.8.0`, `fast-xml-builder@1.2.0`, `postcss@8.5.10`, and `uuid@14.0.0`. `npm audit --audit-level=high --omit=dev` reports **0 vulnerabilities** at the time of release.
