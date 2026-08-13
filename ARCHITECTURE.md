# Architecture Overview

A high-level view of Remediate components and interactions.

> **Current release**: `v2.9.0` (2026-08-03). See [`CHANGELOG.md`](CHANGELOG.md) for the full version history and [`docs/API.md`](docs/API.md) for the API surface.

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
| AI insights (optional) | Azure OpenAI / Azure AI Foundry / OpenAI-compatible `/v1` | provider-supplied |

## Core Components
- **`app` (Next.js)**: User-facing web UI and API routes. Exposes endpoints for admin management and vulnerability ingestion. Runs on port 3000.
- **`worker` (BullMQ)**: Background job processor running **two parallel workers**:
    - **Ingest worker** — processes the shared `{upload-queue}` and dispatches by the job's `scannerType`:
        - `NESSUS` — CSV / pentest-PDF ingest via `lib/ingest.ts#processNessusUpload`, with diffing and historical archival against Nessus rows only.
        - `ACR` — Azure Container Registry CSV ingest via `lib/ingest.ts#processAcrUpload`, with diffing and archival scoped to `scannerType = ACR` so it never touches Nessus rows.
    - **Pentest PDF ingest** — downloads PDFs from the configured storage provider, parses them in-process via `lib/pentest-pdf-builtin.ts` (the built-in Trustmarque CHECK parser), and writes the returned findings into the same `Vulnerability` table on the `{pentest-pdf-queue}` (concurrency 2). No external API or admin configuration is required.
    - **Threat Intelligence Sync**: Hourly delta and daily full syncs from NVD, OSV, and CISA KEV. Since v2.16.0 these run **before** the scheduled-report guard in `lib/report-scheduler.ts`, so an installation with no `ReportConfig` still receives intelligence updates.
    - **MITRE ATT&CK actor sync** (v2.16.0): `syncThreatActorsIfStale()` refreshes the `ThreatActor` catalogue on worker boot and weekly thereafter.
    - **Notification Dispatcher**: Daily 08:00 AM email digests based on user-defined risk filters.
    - **Automation schedulers** — `startAzureFileShareScheduler()` and `startAzureBlobIngestScheduler()` run inside the worker process and poll their respective storage sources on the configured interval.
- **Built-in Pentest PDF Parser** (`lib/pentest-pdf-builtin.ts`): In-process Trustmarque CHECK PDF parser. Uses [`pdf-parse`](https://www.npmjs.com/package/pdf-parse) for raw text extraction and [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (legacy build, loaded dynamically) for yellow-highlight detection via operator-list inspection. Yellow rectangles are intersected with text items per-page, joined into phrase buckets, and emitted as `\u0001HL\u0002...\u0001/HL\u0002` private-use markers in the persisted Examples payload. The client (`renderPluginOutput`) HTML-escapes the payload, then unwraps the markers into XSS-safe `<mark>` spans.
- **Azure Blob Ingest service** (`lib/azure-blob-ingest.ts`): Standalone poller that reads its config from `AzureBlobIngestConfig`, lists blobs in the configured container / prefix, and for each matching CSV: validates headers before writing anything, persists the payload as `acr-{uploadId}.csv` in the active storage provider, creates the `UploadHistory` row (`scannerType = ACR`), enqueues on `{upload-queue}`, and — on successful enqueue — deletes the source blob (opt-out via the `deleteAfterImport` flag).
- **Threat Intelligence Centre (Frontend)**: Real-time vulnerability feed with source-aware external linking, plus the MITRE ATT&CK **Threat Actors** catalogue (`app/(app)/threat-intelligence/actors/`).
- **Dashboard widget engine** (`lib/dashboards/*`, v2.16.0): Spec-driven custom dashboards. `spec.ts` defines the allowlisted grammar, `execute.ts` is the only component that turns a spec into Prisma calls (always under the viewer's RBAC scope), `plan.ts` converts natural language into a spec via the AI provider, and `access.ts` resolves view/edit rights. See [Custom Dashboards](#custom-dashboards--widget-engine-v2160).
- **AI Assistant engine** (`lib/ai/*`): Optional tool-using chat for the Vulnerabilities page. `lib/ai/provider.ts` abstracts three OpenAI-compatible request shapes (Azure OpenAI, Azure AI Foundry, generic `/v1`) and adds a tool-calling round-trip; `lib/ai/chat.ts` orchestrates a bounded tool loop where the model calls `search_vulnerabilities` (RBAC-scoped, via `lib/ai/tools.ts` + `lib/ai/insights.ts`) to read findings and `get_latest_version` (`lib/ai/registry.ts`) to check public package registries. Finding data the caller can already see is shared with the model; configuration lives in the encrypted `AiConfig` table (falling back to `AI_*` env vars).
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
10. **AI Assistant (optional)**: A user chats with the assistant on the Vulnerabilities page. `POST /api/vulnerabilities/chat` runs a tool-using conversation: the model calls `search_vulnerabilities` (results scoped to the caller's group-visibility wall) to read findings and `get_latest_version` to check public package registries, then summarises and prioritises. The reply and the list of tools invoked are returned; the exchange is rate-limited and audited (`ai_insight_chat`).
11. **Custom dashboards (v2.16.0)**: A widget stores a validated JSON *spec*. On render, `POST /api/dashboards/{id}/widgets/{widgetId}/data` re-executes that spec **as the requesting user** — filters from the spec are `AND`-ed with the caller's visibility wall, Prisma aggregates run, foreign keys resolve to display names, and the result is cached in Redis for 60s under `sha256(spec + viewer scope)`. Results are never persisted, which is what allows a dashboard to be published without leaking the author's data.
12. **Adversary intelligence (v2.16.0)**: The worker fetches the MITRE ATT&CK Enterprise STIX bundle, projects `intrusion-set` objects into `ThreatActor` rows (tactics, technique counts and tooling resolved through `uses` relationships), and records the run in `ThreatFeedMetadata("MITRE_ATTACK")`.

## Scalability & Resiliency
- Stateless `app` and `worker` images support horizontal scaling.
- Advisory-lock protected migrations (`scripts/migrate.js`) prevent race conditions during cluster startup.
- Use managed Postgres and Redis (e.g., Azure Database for PostgreSQL, Azure Redis Cache) for production reliability.
- **Redis Cluster Support**: Uses Redis Hash Tags (`{bull}`) to ensure cross-slot compatibility in clustered environments.

## Security
- **RBAC**: Enforced at the API level for sensitive admin and pentest tool routes. Role hierarchy prevents non-site-admins from escalating privileges. Last-admin protections use database transactions to prevent race conditions.
- **Privilege tiers (v2.16.0)**: `requireSiteAdmin()` gates installation configuration, identity and audit surfaces (`site_admin` only); `requireAdmin()` gates workspace data (`site_admin` + `web_app_admin`). Enforced at the edge (`proxy.ts`), on the page, and in the route handler.
- **Input Validation**: All API boundaries validate inputs with Zod schemas — status enums, UUID formats, content length limits, regex patterns, and page/limit caps.
- **Inter-service Auth**: Communication with the pentest backend is secured with short-lived, signed JWTs using `AUTH_SECRET`.
- **Encryption**: OIDC, SMTP, and Azure storage credentials are stored encrypted in Postgres using AES-256-GCM via `AUTH_SECRET`.
- **CSP**: Middleware generates a cryptographic nonce (`crypto.randomUUID`) per request for script and style sources.
- **Rate Limiting**: Authenticated routes key on user identity; unauthenticated routes key on IP with header-spoofing mitigation.
- **Privileged reversals**: Un-archiving a finding (`POST /api/vulnerabilities/{id}/restore`) is restricted to admins even though assignees and group leaders may archive, so the archive remains trustworthy as an audit surface. Both directions are audited (`vulnerability.archived` / `vulnerability.restored`).
- **AI RBAC scoping**: The AI assistant reads finding data through a `search_vulnerabilities` tool whose results are always `AND`-combined with the same group-visibility wall used by `GET /api/vulnerabilities` (`visibilityWhere(isAdmin, memberOf)`), so the model can never surface rows the caller could not already see. The `get_latest_version` tool only reaches a fixed allow-list of public package registries (hard-coded hosts, validated package names) and cannot be steered to arbitrary URLs. Provider endpoint + API key are AES-256-GCM encrypted.
- **No model-authored queries**: Both AI surfaces (vulnerability chat, dashboard widget planning) constrain the model to emitting a Zod-validated JSON spec that the server executes deterministically with Prisma. There is no text-to-SQL path in the codebase.

## Vulnerability Lifecycle
- **Statuses**: `Open`, `InProgress`, `InProgressWithCR`, `AwaitingVendor`, `Sunset`, `Remediated`, `FalsePositive`, `NoFixAvailable`.
- **Active Statuses**: `Open`, `InProgress`, `InProgressWithCR`, `AwaitingVendor`, and `Sunset` remain in the triage queue.
- **Two-table split**: active findings live in `Vulnerability`; the three terminal statuses (`Remediated`, `FalsePositive`, `NoFixAvailable`) live in `VulnerabilityHistory`. Setting a terminal status is therefore a **move between tables**, not an in-place update — `PATCH /api/vulnerabilities/{id}` and `POST /api/vulnerabilities/bulk` copy the row into history (stamping `archivedAt`) and delete the active row inside one transaction. Keeping the archive in its own table is what lets the hot triage queries stay small as the 12-month history grows.
- **Scope discriminator**: `GET /api/vulnerabilities?scope=active|archived` selects the table, and every row is tagged `recordScope` so the client never has to infer its origin. Archived rows carry `archivedAt`, support `archivedFrom`/`archivedTo` range filters, and expose no comments or collaborators.
- **Restore (v2.15.0)**: `POST /api/vulnerabilities/{id}/restore` reverses an archive — admin-only, transactional, and audited as `vulnerability.restored`. It recreates the row in `Vulnerability` with status `Open` and the **original id**, preserving assignee, group, CR number, timestamps, `scannerType` and the ACR fidelity columns, then deletes the history row. Two invariants make it safe:
  - It refuses (`409`) when an active row already exists for the same `(siteId, scannerType, pluginId, host, port)`, because a scan run after the archive may already have re-created the finding under a new id — restoring anyway would put two divergent rows for one finding into triage and double-count it in analytics.
  - It **deletes** the history row rather than keeping it. `lib/ingest.ts` treats a surviving `FalsePositive`/`NoFixAvailable` history row as a standing user determination (`ARCHIVED_DETERMINATION_STATUSES`) and re-archives the finding on the next scan; leaving it behind would make the restore silently self-reverting.
- **AwaitingVendor**: For findings escalated to an upstream vendor/supplier where the fix is out of the team's hands. Counted alongside `InProgress*` in the active queue (analytics/dashboard/leader digest) so the workload stays visible, but visually distinguished (teal dot) so triage can filter or prioritise it.
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

## AI Assistant (v2.10.0)
A multi-turn, tool-using assistant over the active `Vulnerability` table. It replaces the earlier v2.9.0 query-planner: rather than translating English into a filter, the model now **reads finding data directly** to summarise, prioritise, and advise on upgrades. The trade-off is deliberate and bounded — the model only ever sees rows the caller could already see (RBAC enforced *inside* the search tool), and it reaches the outside world only through a fixed allow-list of public package registries.

### Request flow
```
Chat panel   ──POST /api/vulnerabilities/chat { messages[] }──▶  route handler
        │                                                              │
        │                                  getAiConfig()  (DB row or AI_* env)
        │                                                              │
        │                          runChat(history, config, { isAdmin, memberOf })
        │                                 │                             │
        │                                 ▼   (bounded tool loop ≤ 6)   │
        │                          AI provider (Azure OpenAI / Foundry / OpenAI)
        │                                 │  returns content and/or tool_calls
        │                                 ▼
        │        ┌── search_vulnerabilities(spec) ─▶ buildWhereFromSpec()+buildOrderBy()
        │        │        AND visibilityWhere(isAdmin, memberOf)  ─▶ prisma.findMany (capped)
        │        └── get_latest_version(ecosystem, pkg) ─▶ allow-listed registry (cached)
        │                                 │  tool results appended as `tool` messages
        │                                 ▼
        ◀──── { reply, tools } ◀── final assistant message  (+ writeAuditLog: ai_insight_chat)
```

### Modules (`lib/ai/`)
| File | Responsibility |
| :--- | :--- |
| `config.ts` | Resolve effective config: encrypted `AiConfig` DB row first, else `AI_*` env vars. Encrypt/decrypt endpoint + key via `lib/crypto.ts`. Also owns `normaliseAssistantName()` and the `DEFAULT_ASSISTANT_NAME` / `MAX_ASSISTANT_NAME_LENGTH` constants. |
| `provider.ts` | `buildChatRequest()` constructs the URL + auth header per provider type; `chatCompletion()` (single-shot) and `chatWithTools()` (tool-calling round-trip) perform the fetch with an `AbortController` timeout and normalise errors to `AiProviderError`. Pure `buildChatRequest` is unit-tested per provider. |
| `chat.ts` | `runChat()` — the orchestrator. Seeds the system prompt (parameterised on the configured assistant name), drives the bounded tool loop, executes each requested tool under the caller's `ToolContext`, and returns the final reply plus the list of tools invoked. |
| `tools.ts` | Tool declarations + executors. `search_vulnerabilities` reuses `query-spec` + `buildWhereFromSpec`/`buildOrderBy` and always `AND`s the group-visibility wall; `get_latest_version` delegates to the registry module. Results are trimmed and row-capped for token safety. |
| `registry.ts` | `getLatestVersion(ecosystem, package)` against a hard-coded allow-list of public registries (npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist, Go). SSRF-safe (fixed hosts, validated names), timed out, and cached in-process. |
| `query-spec.ts` | The `querySpecSchema` Zod contract (enum whitelists for risk/status/scanner, capped `limit`, bounded strings) that constrains the `search_vulnerabilities` arguments. |
| `insights.ts` | `buildWhereFromSpec()` (spec → Prisma `where`, incl. the `hasFix` / `internetFacing` derivations) and `buildOrderBy()` (severity-first default), shared by the search tool. |

### Provider matrix
| `providerType` | URL construction | Auth header | Model location |
| :--- | :--- | :--- | :--- |
| `azure-openai` | `{baseUrl}/openai/deployments/{model}/chat/completions?api-version={v}` | `api-key` | deployment in URL |
| `foundry` | `{root}/openai/v1/chat/completions?api-version=preview` (root auto-derived) | `api-key` | request body |
| `openai-compatible` | `{baseUrl}/chat/completions` | `Authorization: Bearer` | request body |

### Data model
```
AiConfig (singleton)
  │ enabled           Boolean   — feature master switch
  │ providerType      String    — azure-openai | foundry | openai-compatible
  │ baseUrlEnc        String    — AES-256-GCM (endpoint)
  │ apiKeyEnc         String    — AES-256-GCM (API key)
  │ model             String    — deployment/model name (non-secret)
  │ apiVersion        String?   — Azure/Foundry api-version (non-secret)
  └ assistantName     String?   — display name; NULL ⇒ AI_ASSISTANT_NAME ⇒ "Ask AI"
```
Migration `20260803120000_add_ai_config` creates the table; `20260813210000_ai_assistant_name` adds the nullable name column. No changes to the `Vulnerability` schema are required — the feature reads the existing columns (`risk`, `status`, `cvssScore`, `cve`, `host`, `packageName`, `solution`, `remediation`, `pluginId`, `scannerType`).

### Assistant naming (v2.16.1)
The name is resolved once, in `getAiConfig()`, and travels on the `AiConfig` object rather than being fetched separately — so the chat orchestrator, the settings API and the availability probe all agree by construction. It is used in three places:

1. **`runChat()`** interpolates it into the system prompt, so the model introduces itself correctly rather than defaulting to a generic identity.
2. **`GET /api/vulnerabilities/chat`** returns it alongside `available`, so the page labels its launcher from the probe it was already issuing.
3. **`AiChatPanel`** takes it as an optional `name` prop.

The panel does **not** import `DEFAULT_ASSISTANT_NAME` from `lib/ai/config`: that module imports `lib/prisma`, and a client component importing it would pull the Prisma client into the browser bundle. The fallback is duplicated as a local constant that names its source of truth — a deliberate, commented duplication rather than an accident. `normaliseAssistantName()` runs on both write and read, so a value persisted by an older client is still sanitised before it reaches a prompt.

### Domain mappings baked into the search tool
- *"already have fixes / patches available"* → `hasFix: true` → `status != NoFixAvailable` **and** (`solution` or `remediation` present).
- *"internet-facing / pentest"* → `internetFacing: true` → `pluginId` starts with `PT`.
- *"which packages should I prioritise"* → `scannerType: ACR`, `sortBy: cvssScore`, `sortDir: desc`, bounded `limit`.
- *"critical" / "critical and high"* → `risk: ["Critical"]` / `["Critical","High"]`.

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
- **`POST /api/vulnerabilities/{id}/restore`** — admin-only (`WEB_APP_ADMIN_ROLES`); the role check runs *before* the history lookup so the route cannot be used to probe which ids exist in the archive.
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

## Navigation Shell (v2.16.0)
The application chrome is an 88px icon rail flush to the viewport edge (`components/Sidebar.tsx`), with `MobileNav.tsx` mirroring the same grouping in a drawer below `lg`.

- **Sections** are data-driven exports — `insightsNavItems`, `toolsNavItems` (Intelligence), `inventoryNavItems`, `automationNavItems`, `adminNavItems` — so the rail, the flyouts and the mobile drawer all render from one source. Adding a page means adding one entry.
- **Flyout behaviour**: hover opens (with a 180ms grace period so the cursor can cross the gap), click **pins**. A pinned panel ignores outside clicks and survives navigation until explicitly closed; an unpinned one closes on mouse-leave, Escape or outside click.
- **Visibility** is per-section and per-item: Insights is universal, Intelligence follows toolkit/auditor/workspace-admin roles, Inventory filters its own items (`access: "workspace" | "toolkit"`) so a toolkit-only user still sees the Tools entry, Automation is workspace-admin, Settings is site-admin.
- **CSS caution**: `.glass-edge` in `app/globals.css` sets `position: relative`. Unlayered CSS beats Tailwind's `@layer utilities`, so a flyout must not combine `glass-edge` with `absolute` on the same element — positioning belongs on a wrapper.

## Custom Dashboards & Widget Engine (v2.16.0)
Users build personal dashboards, drag/resize widgets, and optionally publish them. The core invariant: **a widget stores its query, never its results.**

### Pipeline
```
user input ─┐
            ├─> WidgetSpec (JSON) ─> Zod strict allowlist ─> coherence check
AI planner ─┘                                   │
                                                ▼
                        AND viewer's group-visibility wall
                                                │
                                                ▼
                        Prisma aggregate (count | avgCvss | groupBy)
                                                │
                                                ▼
                    label resolution ─> row cap ─> Redis cache (60s)
                                                │
                                                ▼
                       { total, rows[], truncated } ─> WidgetRenderer
```

### Modules (`lib/dashboards/`)
| File | Responsibility |
| :--- | :--- |
| `spec.ts` | `widgetSpecSchema` (strict), `widgetSchema`, `assertSpecIsCoherent()`, `MAX_WIDGET_ROWS`. The complete grammar of what a widget may ask for. |
| `execute.ts` | The only spec → database path. Applies the visibility wall, runs Prisma aggregates, resolves FK labels, caches per `(spec, viewer scope)`. |
| `plan.ts` | `planWidget()` — natural language → `{ title, viz, spec }` via `chatCompletion`, validated against the same allowlist. |
| `access.ts` | `widgetContextFor()` (viewer RBAC context), `accessFor()` (view/edit), `loadDashboardForViewer()`. |

### Data model
- `Dashboard` — `ownerId`, `name`, `description`, `visibility` (`Private` \| `Published`).
- `DashboardWidget` — `title`, `viz` (`stat` \| `bar` \| `donut` \| `line` \| `table`), `spec` (JSON), `x`/`y`/`w`/`h` on a 12-column grid.

### Why results are not persisted
Caching a widget's output on the row would freeze the data at creation time **and** break publishing: the author's numbers are computed under the author's group membership. Re-executing per viewer means two people can open the same published board and each correctly sees their own scope. The Redis key therefore includes the viewer's scope, not just the spec hash.

### Limits
24 widgets per dashboard · 50 rows per widget · 50 layout items per save · rate limiting on preview, plan, create and data endpoints.

## MITRE ATT&CK Threat Actors (v2.16.0)
`lib/threat-intelligence/actors.ts` fetches the ATT&CK Enterprise STIX bundle (~40MB, 120s timeout, fixed URL) and projects it into the `ThreatActor` table.

- **Structured fields** come straight from ATT&CK: name, aliases, description, MITRE id/URL, `lastModified`, plus `tactics`, `techniqueCount` and `software` resolved by walking `relationship_type: "uses"` edges from each `intrusion-set` to `attack-pattern` (kill-chain phases) and `malware` / `tool` objects. `revoked` and `x_mitre_deprecated` objects are skipped.
- **Derived fields** — `actorType`, `origin`, `targetSectors`, `targetRegions`, `targetTechnologies` — are keyword-matched against the group description because ATT&CK models no attribution. The parsing helpers (`classifyActorType`, `deriveAttribution`, `deriveTechnologies`) are exported and unit-tested, and every UI surface labels them as derived.
- **Refresh**: `syncThreatActorsIfStale(maxAgeHours = 168)` on worker boot and on the scheduler tick; `POST /api/threat-intelligence/actors` for a manual run. State is tracked in `ThreatFeedMetadata("MITRE_ATTACK")`.

## Testing
- **Unit Tests (Vitest)**: 130+ test files covering API routes, library modules (including the dashboard spec/executor and the ATT&CK parser), components, and integration scenarios. CI gates on 75% coverage threshold.
- **E2E Tests (Playwright)**: 72 tests across 17 files using a multi-project setup:
  - `setup` — Authenticates via local credentials and saves session state.
  - `unauthenticated` — Tests login flow, RBAC redirects, health API, and 404 handling.
  - `chromium` — Tests all authenticated pages (command centre, vulnerabilities, uploads and their automation pages, buckets, analytics, threat intelligence + threat actors, dashboards, admin pages) plus rail navigation, flyout hover/pin behaviour, and the widget allowlist.
- **CI/CD (GitHub Actions)**: Lint, unit tests (Postgres + Redis services), integration tests, E2E (Playwright with DB schema push + seed data), Docker build, and CodeQL security scanning.

## Key File Locations
- **Vulnerability lifecycle**: `app/api/vulnerabilities/[id]/route.ts` (status change + archive), `app/api/vulnerabilities/bulk/route.ts` (bulk archive), `app/api/vulnerabilities/[id]/restore/route.ts` (un-archive), `app/api/vulnerabilities/route.ts` (`scope=active|archived` listing)
- **Multi-scanner ingest**: `lib/ingest.ts` (`processNessusUpload`, `processAcrUpload`), `lib/csv.ts` (`validateNessusCsv`, `parseNessusCsv`, `validateAcrCsv`, `parseAcrCsv`), `lib/queue.ts`, `scripts/worker.ts`
- **ACR blob automation**: `lib/azure-blob-ingest.ts`, `lib/azure-blob-ingest-scheduler.ts`, `app/api/admin/azure-blob-ingest/`, `app/(app)/admin/azure-blob-ingest/`
- **Group RBAC**: `lib/group-rbac.ts`, `app/api/groups/`, `app/(app)/admin/groups/`, `prisma/migrations/20260610120000_add_groups/`
- **Threat Intelligence**: `lib/threat-intelligence/`, `app/api/threat-intelligence/`, `app/(app)/threat-intelligence/`
- **Threat actors (ATT&CK)**: `lib/threat-intelligence/actors.ts`, `app/api/threat-intelligence/actors/`, `app/(app)/threat-intelligence/actors/`, `prisma/migrations/20260813150000_threat_actors/`
- **Custom dashboards**: `lib/dashboards/`, `app/api/dashboards/`, `app/(app)/dashboards/`, `components/dashboards/`, `prisma/migrations/20260813190000_dashboards/`
- **Navigation shell**: `components/Sidebar.tsx`, `components/MobileNav.tsx`
- **Security score**: `lib/security-score.ts`, `components/SecurityScoreCard.tsx`
- **Privilege tiers**: `lib/rbac.ts` (`requireAdmin`, `requireSiteAdmin`, `checkSiteAdmin`), `proxy.ts`
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
