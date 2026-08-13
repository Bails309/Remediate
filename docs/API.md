# Remediate HTTP API Reference

> **Applies to release**: `v2.16.1` (2026-08-13). When new endpoints are added under `app/api/`, append a row to the relevant table below and document any new request/response shape.

All endpoints are served by the Next.js application under `/api/*`. Unless explicitly marked **Public**, every route requires an authenticated session cookie issued by NextAuth (Auth.js v5).

| Symbol | Meaning |
| :--- | :--- |
| 🌐 | Public — no session required. |
| 🔒 | Authenticated — any signed-in user. |
| 🛡️ | Workspace Admin — `site_admin` or `web_app_admin`. Workspace data: buckets, uploads, automation, findings. |
| 👑 | Site Admin — `site_admin` only. Installation configuration, identity, audit and platform health. |
| 🧪 | Toolkit — `toolkit_user`, `toolkit_admin`, or `site_admin`. |

> **Changed in v2.16.0**: `web_app_admin` no longer implies site administration. Routes under Auth, Storage, Import, Reporting, AI configuration, Users, Groups, Audit and Health are 👑 site-admin only; workspace data routes remain 🛡️. See [SECURITY.md → Role Model & Privilege Tiers](../SECURITY.md#role-model--privilege-tiers-v2160).

All request/response bodies are JSON unless otherwise noted. Errors follow the shape `{ "error": string }` with appropriate HTTP status codes (`400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `429` rate limited, `500` internal).

---

## 1. Health & Diagnostics

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | 🌐 | Liveness probe. Returns `{ "status": "ok" }`. Used by container orchestrators. |
| `GET` | `/api/ping` | 🌐 | Lightweight ping for uptime monitors. |
| `GET` | `/api/admin/health` | 👑 | Detailed health: app version (`APP_VERSION` or `package.json`), database reachability, Redis reachability, queue depth, worker heartbeat, and pentest backend status. |

---

## 2. Authentication & Account

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET`/`POST` | `/api/auth/[...nextauth]` | 🌐 | NextAuth catch-all for OIDC and credentials flows (sign-in, callback, sign-out, CSRF, session). |
| `POST` | `/api/auth/revoke` | 🔒 | Revokes the current session. |
| `GET` | `/api/account` | 🔒 | Returns the current user profile, roles, completed tours, and subscription state. |
| `DELETE` | `/api/account` | 🔒 | Self-service account deletion. Last-admin guards apply. |
| `POST` | `/api/tours/complete` | 🔒 | Marks a product tour or What's New card as completed. Body: `{ "tourId": "<whitelisted id>" }`. Tour IDs are validated against an `enum` in [route.ts](../app/api/tours/complete/route.ts). |

---

## 3. Vulnerabilities

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/vulnerabilities` | 🔒 | Paginated search. Query: `q`, `status`, `risk`, `bucketId`, `assigneeId`, `groupIds`, `id`/`ids`, `page` (≤10000), `limit`. ILIKE wildcards are escaped server-side. **Group visibility wall**: non-admins always see ungrouped items plus items in groups they belong to; any `groupIds` token outside the requester's `memberOf` set is silently dropped before the SQL is built. Pass the keyword `unassigned` inside `groupIds` to include items with no group when also filtering by specific groups. |
| `GET` | `/api/vulnerabilities/{id}` | 🔒 | Returns a single vulnerability with assignee, collaborators, comment count, and history snippet. Returns `403` if the requester cannot see the item under the group visibility wall. |
| `PATCH` | `/api/vulnerabilities/{id}` | 🔒 | Update status, assignee, collaborators, CR number, sunset flag, or `groupId`. RBAC enforced via `lib/group-rbac.ts`: standard users may only self-assign or unassign; group leaders may edit any item their group owns and may reassign within their group; only admins may change `groupId`; CR number is required for `InProgressWithCR`. |
| `POST` | `/api/vulnerabilities/{id}/restore` | �️ | **Admin only** (`site_admin` / `web_app_admin`). Un-archives a finding: moves it out of `VulnerabilityHistory` and back into the active queue with status `Open`. No request body. See [Archiving & restoring](#archiving--restoring-v2150) below. |
| `POST` | `/api/vulnerabilities/bulk` | 🔒 | Bulk update across selected ids. Body: `{ "ids": string[], "patch": { ... }, "crNumber"?: string }`. The same per-item permission matrix as single update is applied; the request aborts with `403` on the first item the caller cannot mutate (no partial application). |
| `GET` | `/api/vulnerabilities/{id}/comments` | 🔒 | Lists comments visible to the requester (admins, assignees, collaborators when "Ask for Help" is enabled). Re-checks the group visibility wall. |
| `POST` | `/api/vulnerabilities/{id}/comments` | 🔒 | Adds a comment. Body: `{ "content": string }` (1–10,000 chars, Zod validated). |
| `PATCH` | `/api/vulnerabilities/{id}/comments` | 🔒 | Edits a comment owned by the caller. Body: `{ "commentId": string, "content": string }`. |
| `DELETE` | `/api/vulnerabilities/{id}/comments` | 🔒 | Deletes a comment. Author or admin only. Query: `commentId`. |

### Vulnerability statuses

`Open`, `InProgress`, `InProgressWithCR`, `AwaitingVendor`, `Sunset`, `Remediated`, `FalsePositive`, `NoFixAvailable`. Validated server-side as a `z.enum`.

**Active** statuses (`Open`, `InProgress`, `InProgressWithCR`, `AwaitingVendor`, `Sunset`) live in the `Vulnerability` table. **Terminal** statuses (`Remediated`, `FalsePositive`, `NoFixAvailable`) live in `VulnerabilityHistory`. Setting a terminal status via `PATCH /api/vulnerabilities/{id}` or `POST /api/vulnerabilities/bulk` *moves the row between tables*; it is not an in-place update.

### Archiving & restoring (v2.15.0)

List responses tag every row with a `recordScope` discriminator so clients never have to infer which table a row came from:

| `recordScope` | Source table | Reached via |
| :--- | :--- | :--- |
| `"active"` | `Vulnerability` | `GET /api/vulnerabilities?scope=active` (default) |
| `"archived"` | `VulnerabilityHistory` | `GET /api/vulnerabilities?scope=archived` |

Archived rows additionally carry `archivedAt` and may be narrowed with `archivedFrom` / `archivedTo` (`YYYY-MM-DD`, inclusive; `archivedTo` is widened to end-of-day server-side). They expose no comment thread and no collaborators — the API returns `askForHelp: false` and `collaborators: []` for them.

**`POST /api/vulnerabilities/{id}/restore`** reverses an archive. It is deliberately *not* delegated to assignees or group leaders: archiving is the audit-visible terminal state of a finding, so only `site_admin` / `web_app_admin` may reopen one.

```
POST /api/vulnerabilities/{id}/restore
Cookie: <session cookie>
```

Behaviour:

1. Reads the `VulnerabilityHistory` row for `{id}`. `404 { "error": "Archived finding not found" }` if absent.
2. Rejects the restore with `409 { "error": "This finding is already in the active queue", "activeId": string }` when a live row already exists for the same `(siteId, scannerType, pluginId, host, port)` — a later scan may have re-created the finding under a new id, and restoring would duplicate it in triage.
3. In a single transaction, recreates the row in `Vulnerability` with **status `Open`** and **the original id**, preserving `assigneeId`, `groupId`, `crNumber`, `createdAt`, `lastSeenAt`, `scannerType`, and the ACR fidelity columns (`registryName`, `repository`, `imageDigest`, `imageTag`, `packageName`, `installedVersion`, `remediation`, `timeGenerated`); then deletes the history row.
4. Writes a `vulnerability.restored` audit entry with `oldValue` = the archived status and `newValue` = `"Open"`.

The history row is **deleted rather than retained** on purpose: `lib/ingest.ts` treats a surviving `FalsePositive` / `NoFixAvailable` history row as a standing user determination and will re-archive the same finding on the next scan, silently undoing the restore.

Response `200` is the recreated vulnerability with `recordScope: "active"` and `commentCount: 0`.

| Status | Meaning |
| :--- | :--- |
| `200` | Restored. Body is the new active row. |
| `401` | Not authenticated. |
| `403` | Authenticated but not an admin. |
| `404` | No archived record with that id. |
| `409` | An equivalent finding is already active (`activeId` names it). |
| `429` | Rate limited. |

---

## 4. Uploads & Ingestion

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/uploads/nessus` | 🔒 | Multipart upload of a Nessus CSV. Stores the payload in Redis (2-hour TTL) and enqueues a BullMQ job with `scannerType: NESSUS`. |
| `POST` | `/api/uploads/pentest` | 👑 | Multipart upload of a penetration-test PDF (≤25 MB). Persists the binary as base64 in the active storage provider, then enqueues a job on the dedicated `{pentest-pdf-queue}` for the worker to parse in-process via the built-in Trustmarque CHECK parser (`lib/pentest-pdf-builtin.ts`). Returns `{ uploadId, status: "queued" }` on success. No admin configuration is required. |
| `POST` | `/api/uploads/acr` | 👑 | Multipart upload of an Azure Container Registry vulnerability CSV (≤50 MB). Body: `file`, `siteId`. Headers are validated case-insensitively (required: `registryName`, `repository`, `imageDigest`, `severity`, `cveId`, `packageName`; common aliases like `CVE`, `Package Name`, `Registry Name` are accepted). Persists the payload under `acr-{uploadId}.csv` in the active storage provider and enqueues a job on the shared `{upload-queue}` with `scannerType: ACR`. Returns `{ uploadId, status: "queued" }` on success, `400` on missing headers, `413` when the file exceeds 50 MB, `429` when rate-limited. |
| `GET` | `/api/uploads/history` | 🔒 | Paginated upload history (status, counts, processing duration, `scannerType`). |
| `GET` | `/api/uploads/progress` | 🔒 | Snapshot of all in-flight uploads for the current user. |
| `GET` | `/api/uploads/{uploadId}/progress` | 🔒 | Per-upload progress (counts, current phase). |
| `GET` | `/api/uploads/events` | 🔒 | Server-Sent Events stream for global upload progress. |
| `GET` | `/api/uploads/{uploadId}/events` | 🔒 | SSE stream for a specific upload. |
| `GET` | `/api/uploads/dead-letter` | �️ | Lists failed jobs in the dead-letter queue. Surfaced at `/uploads/dead-letter` (moved from `/admin/dead-letter` in v2.16.0, which now redirects). |
| `POST` | `/api/uploads/dead-letter` | 🛡️ | Requeues a single failed job. Body: `{ "jobId": string }`. |
| `PUT` | `/api/uploads/dead-letter` | 🛡️ | Bulk requeue all dead-letter entries. |
| `DELETE` | `/api/uploads/dead-letter` | 🛡️ | Permanently removes a dead-letter entry. Query: `jobId`. |

---

## AI-Powered Insights

A multi-turn AI assistant over the caller's vulnerabilities. Unlike the earlier query-planner, the model **does** receive finding data — but only the rows the caller is already permitted to see (RBAC / group-visibility is enforced inside the `search_vulnerabilities` tool). It can also call public package registries via a `get_latest_version` tool to report whether a component has a newer release. Requires an admin to configure a provider (see the **AI Insights** tab in Admin → Settings, or the `AI_*` environment variables in [`AZURE_ENV_VARS.md`](AZURE_ENV_VARS.md)). The model must support tool/function calling.

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/vulnerabilities/chat` | 🔒 | Reports whether the AI chat should be shown, and what it is called: `{ available: boolean, assistantName: string }`. `assistantName` is always resolved (never null) so the client can label the launcher without a second request. |
| `POST` | `/api/vulnerabilities/chat` | 🔒 | Body: `{ messages: { role: "user"\|"assistant", content: string }[] }` (1–24 turns, last must be `user`), plus an optional `focusId` to scope the conversation to a single finding. Runs a tool-using chat under the caller's visibility wall and returns `{ reply, tools }`. Rate-limited; audited as `ai_insight_chat`. `400` when AI is unconfigured/disabled or the payload is invalid, `502` on provider/chat error. |
| `GET` | `/api/admin/ai` | � | Returns the current provider configuration with the API key masked, including the resolved `assistantName`. |
| `POST` | `/api/admin/ai` | 👑 | Upserts the provider configuration (endpoint + key encrypted at rest). Submitting `********` as the key preserves the stored secret. |
| `POST` | `/api/admin/ai/test` | 👑 | Sends a minimal prompt to verify connectivity and credentials (accepts unsaved form overrides). |

### Assistant name (v2.16.1)

`POST /api/admin/ai` accepts an optional `assistantName` (string, max 40, nullable). It controls what the assistant is called on the launcher, in the chat header and in its own system prompt.

| Stored value | Effective name |
| :--- | :--- |
| A non-empty string | That string, whitespace-collapsed and trimmed |
| `null`, `""`, or whitespace only | `AI_ASSISTANT_NAME` if set, else `Ask AI` |

Normalisation happens server-side in `normaliseAssistantName()` before persistence **and** on read, so a row written by an older client is still sanitised. Whitespace runs collapse to a single space because the value is interpolated into the model's system message — see [SECURITY.md](../SECURITY.md#ai-assistant) for why that matters.

### `scannerType` (v2.8.0)
Every ingest job carries a `scannerType`:
- `NESSUS` — processed by `lib/ingest.ts#processNessusUpload`. Sources: `/api/uploads/nessus`, `/api/uploads/pentest`.
- `ACR` — processed by `lib/ingest.ts#processAcrUpload`. Sources: `/api/uploads/acr`, the automated Azure Blob container poller (see §9a).

Reconciliation queries ("still present", "archive as remediated", `createMany`, and `VulnerabilityHistory` diff) are scoped by `scannerType`, so scanners cannot archive each other's findings.

---

## 5. Buckets (formerly Sites)

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/buckets` | 🔒 | Lists all buckets the user can see, with assignment counts and active vulnerability totals. |
| `POST` | `/api/buckets` | 🛡️ | Creates a bucket. Body: `{ "name": string, "description"?: string, "importPatterns"?: string[], "aliases"?: string[] }`. Patterns and aliases are regex-validated and length-capped. |
| `PUT` | `/api/buckets/{bucketId}` | 🛡️ | Updates a bucket. Same validation as create. |
| `DELETE` | `/api/buckets/{bucketId}` | 👑 | Deletes a bucket. Refuses if associated vulnerabilities exist unless `?force=true`. |

---

## 5a. Groups / Departments (v2.7.0)

Groups are an enterprise visibility wall layered on top of the existing single-team / individual-assignment model. See [`ARCHITECTURE.md`](../ARCHITECTURE.md#group--department-rbac-v270) for the full permission matrix and [`lib/group-rbac.ts`](../lib/group-rbac.ts) for the helper definitions.

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/groups` | 🔒 | Lists groups. Admins receive every group with `memberCount` + `vulnerabilityCount` and `viewerRole: null`. Non-admins receive only the groups they belong to, with `viewerRole: "leader" \| "member"`. |
| `POST` | `/api/groups` | 👑 | Creates a group. Body: `{ "name": string (1–120), "description"?: string \| null (max 1000) }`. Returns `409` on duplicate name. Writes a `group.created` audit log entry. |
| `GET` | `/api/groups/{id}` | 🔒 | Returns the group with `{ id, name, description, createdAt, vulnerabilityCount, members: [{ userId, name, email, role }], viewerCanManage: boolean }`. Returns `403` to non-admins who are not members of the group, `404` if missing. |
| `PATCH` | `/api/groups/{id}` | 👑 | Updates `name` and/or `description`. Same Zod schema as create. Returns `409` on duplicate name, `404` if missing. Writes a `group.updated` audit log entry. |
| `DELETE` | `/api/groups/{id}` | 👑 | Deletes the group. Returns `409 { "activeCount": number }` if the group still owns active vulnerabilities; pass `?force=true` to dissolve regardless (orphaned items revert to the open queue via `ON DELETE SET NULL`). Writes a `group.deleted` audit log entry capturing the dissolution count. |
| `POST` | `/api/groups/{id}/members` | 🛡️ | Adds a member. Body: `{ "userId": uuid, "role"?: "member" \| "leader" (default `member`) }`. Authorised when the caller is an admin or a leader of the target group. Returns `409` if the user is already a member, `404` if the target user does not exist. Writes a `group.member_added` audit log entry. |
| `PATCH` | `/api/groups/{id}/members` | 🛡️ | Changes an existing member's role. Body: `{ "userId": uuid, "role": "member" \| "leader" }`. **Last-leader guard**: a non-admin leader cannot demote the only remaining leader (returns `400 { "error": "Cannot demote the last leader of the group" }`); only an admin can. Returns `404` if the membership does not exist. Writes a `group.member_role_changed` audit log entry. |
| `DELETE` | `/api/groups/{id}/members` | 🛡️ | Removes a member. Body: `{ "userId": uuid }`. Same last-leader guard as PATCH — non-admin leaders cannot remove the only remaining leader (returns `400`). Returns `404` if the membership does not exist. Writes a `group.member_removed` audit log entry. |

### Permission matrix (mirrors `lib/group-rbac.ts`)

| Action | Admin | Group leader | Group member | Outsider |
| :--- | :---: | :---: | :---: | :---: |
| See an ungrouped item | ✓ | ✓ | ✓ | ✓ |
| See a grouped item | ✓ | ✓ (own group) | ✓ (own group) | ✗ (`403`) |
| Self-assign | ✓ | ✓ (own group) | ✓ (own group) | ✗ |
| Edit status / CR / collaboration | ✓ | ✓ (own group) | ✓ (only when current assignee) | ✗ |
| Reassign to another user | ✓ (any) | ✓ (within own group only) | ✗ (self-assign only) | ✗ |
| Change the `groupId` on a vulnerability | ✓ | ✗ | ✗ | ✗ |
| Manage group membership | ✓ (any group) | ✓ (own group only) | ✗ | ✗ |

### `groupIds` filter on `/api/vulnerabilities`
The query parameter accepts a comma-separated list of UUIDs and the literal keyword `unassigned`:
```
GET /api/vulnerabilities?groupIds=11111111-...,22222222-...,unassigned
```
- Non-admins: any UUID not in the caller's `memberOf` set is silently dropped before the SQL is built (no information leak about unknown group ids).
- `unassigned` includes items with `groupId IS NULL` (the open queue) alongside any explicit groups.
- When the parameter is omitted entirely, the response defaults to the open queue plus every group the requester belongs to (admins see everything).

---

## 6. Analytics

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/analytics` | 🔒 | Aggregated dashboard metrics: status breakdown, risk distribution, SLA aging, sunset section, host distribution. Query: `bucketId` (UUID validated), `siteId` (legacy alias, also UUID validated), `range`. |

---

## 7. Threat Intelligence

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/threat-intelligence/feed` | 🔒 | Paginated global feed (NVD / OSV / CISA KEV). Query: `risk`, `kev`, `since`, `limit` (capped at 100). |
| `GET` | `/api/threat-intelligence/subscription` | 🔒 | Returns the current user's digest configuration. |
| `POST` | `/api/threat-intelligence/subscription` | 🔒 | Updates digest configuration. Body: `{ "enabled": boolean, "minRisk": "Critical"\|"High"\|..., "kevOnly": boolean, "scheduledHour": 0-23, "scheduledMinute": 0-59 }`. |
| `GET` | `/api/threat-intelligence/actors` | 🔒 | MITRE ATT&CK adversary catalogue. Query: `q` (name / alias / MITRE id), `tactic`, `sector`, `region`, `type`, `limit` (≤200, default 100). Returns `{ actors: ThreatActor[], total: number, lastSyncedAt: string \| null }`. |
| `POST` | `/api/threat-intelligence/actors` | 🛡️ | Forces an immediate re-sync of the ATT&CK Enterprise bundle. Returns `{ synced: number }`. Rate-limited; `502` if the upstream fetch or parse fails. The worker also syncs automatically (see below). |

### Threat actors (v2.16.0)

Source: the [MITRE ATT&CK Enterprise STIX bundle](https://github.com/mitre-attack/attack-stix-data). Each `intrusion-set` object becomes one `ThreatActor` row keyed on its MITRE group id (`G0007`); `revoked` and `x_mitre_deprecated` objects are skipped.

| Field | Provenance |
| :--- | :--- |
| `externalId`, `name`, `aliases`, `description`, `url`, `lastModified` | Structured ATT&CK data. |
| `tactics`, `techniqueCount`, `software` | Structured — resolved from the group's `uses` relationships to `attack-pattern` (kill-chain phases) and `malware` / `tool` objects. |
| `actorType`, `origin`, `targetSectors`, `targetRegions`, `targetTechnologies` | **Derived** — ATT&CK has no structured attribution fields, so these are keyword-matched against the group description. Indicative only; the UI labels them as such. |

**Refresh cadence.** `syncThreatActorsIfStale()` runs on worker boot and on the scheduler tick, re-syncing when the table is empty or `ThreatFeedMetadata("MITRE_ATTACK").lastSyncedAt` is older than 7 days. Since v2.16.0 this runs independently of whether scheduled email reporting is configured.

---

## 8. Admin — Users & Audit

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/users` | 👑 | Paginated user listing with roles. |
| `POST` | `/api/admin/users` | 👑 | Provisions a new user (email + roles). |
| `PATCH` | `/api/admin/users` | 👑 | Updates a user's roles. Hierarchy guard prevents non-site-admins from granting `site_admin` or `toolkit_admin`. Last-admin protection wraps the update in a Prisma `$transaction`. |
| `DELETE` | `/api/admin/users` | 👑 | Deletes a user. Same last-admin transaction guard. |
| `GET` | `/api/admin/audit-log` | 👑 | Paginated audit log. Query: `page`, `limit`, `action`, `entityType`. |

---

## 9. Admin — Storage & Imports

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/storage` | 👑 | Returns the active storage provider configuration (no secrets). |
| `POST` | `/api/admin/storage` | 👑 | Updates storage provider. Body: `{ "provider": "local"\|"azure", ... }`. Secrets are never echoed back. |
| `POST` | `/api/admin/storage/test` | 👑 | Tests connectivity to the supplied storage provider. Secret values are scrubbed from logs. |
| `GET` | `/api/admin/import` | 👑 | Returns import metadata (last run, eligible files). |
| `POST` | `/api/admin/import` | 👑 | Triggers a manual ingestion job. |
| `GET` | `/api/admin/azure-file-share` | 👑 | Lists Azure File Share automation configurations. |
| `POST` | `/api/admin/azure-file-share` | 👑 | Creates or updates an automation entry. |
| `POST` | `/api/admin/azure-file-share/poll` | 👑 | Manually triggers a poll cycle ("Run Now"). |
| `POST` | `/api/admin/azure-file-share/test` | 👑 | Tests connectivity and path resolution against an Azure File Share configuration. |

---

## 9a. Admin — ACR Blob Ingest (v2.8.0)

The ACR blob-ingest pipeline is completely independent from the Azure File Share automation — it has its own credentials, container, poll interval, and default site. See [`ARCHITECTURE.md`](../ARCHITECTURE.md#multi-scanner-ingest-v280) for the reconciliation and dedup semantics.

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/azure-blob-ingest` | 👑 | Returns the current `AzureBlobIngestConfig`. All three credential fields (`connectionStringEnc`, `accountKeyEnc`, `sasTokenEnc`) are replaced with the `"****"` sentinel — plaintext is **never** returned. Includes `lastPollAt` for observability. |
| `POST` | `/api/admin/azure-blob-ingest` | 👑 | Upserts the configuration. Body: `{ enabled, authMethod: "CONNECTION_STRING"\|"ACCOUNT_KEY"\|"SAS_TOKEN", accountName?, containerName, prefix?, defaultSiteId, pollIntervalMinutes, deleteAfterImport, connectionString?, accountKey?, sasToken? }`. Any credential field equal to `"****"` means "keep the existing encrypted value"; any other non-empty string is encrypted via `lib/crypto.ts#encrypt` before being written. Writes an `azure_blob_ingest.updated` audit-log entry. |
| `POST` | `/api/admin/azure-blob-ingest/poll` | 👑 | Manually triggers a poll cycle ("Run Now"). Returns `{ success: true, message: string }` on success and updates `lastPollAt`. Per-blob failures are logged but do not fail the whole cycle. |
| `POST` | `/api/admin/azure-blob-ingest/test` | 👑 | Validates the supplied credentials + container name. Accepts unmasked secrets in the request body so administrators can test **before** saving; credentials are used exactly once to construct a Blob service client and discarded when the request completes. Returns `{ success: boolean, message?: string, error?: string }`. |

### Configuration schema
| Field | Type | Notes |
| :--- | :--- | :--- |
| `enabled` | `boolean` | When `false`, the scheduler skips polling entirely. |
| `authMethod` | `"CONNECTION_STRING" \| "ACCOUNT_KEY" \| "SAS_TOKEN"` | Determines which credential field must be populated. |
| `accountName` | `string \| null` | Required for `ACCOUNT_KEY` and `SAS_TOKEN`. Ignored for `CONNECTION_STRING`. |
| `containerName` | `string` | Blob container to poll. Defaults to `acr-vulnerabilities`. |
| `prefix` | `string \| null` | Optional blob-name prefix filter (e.g. `daily/`). |
| `defaultSiteId` | `uuid \| null` | Bucket that ingested CSVs land in. Scheduler skips polling until this is set. FK to `Site.id ON DELETE SET NULL`. |
| `pollIntervalMinutes` | `integer >= 1` | Scheduler interval. Default `60`. |
| `deleteAfterImport` | `boolean` | When `true` (default), each blob is deleted **only after** a successful enqueue. When `false`, blobs are retained; combine with a `prefix` you rotate manually or accept re-processing at the CSV-row dedup key. |
| `connectionStringEnc` / `accountKeyEnc` / `sasTokenEnc` | `string \| null` (ciphertext) | Stored encrypted. Sent to the client as `"****"`. |
| `lastPollAt` | `ISO 8601 \| null` | Last successful poll timestamp. |

### Manual ACR upload payload (`POST /api/uploads/acr`)
```
Content-Type: multipart/form-data

file: <ACR CSV file, ≤50 MB>
siteId: <bucket UUID>
```

Expected CSV headers (case-insensitive, BOM-tolerant, aliases accepted):
```
timeGenerated, registryName, repository, imageDigest, severity, cveId, packageName, installedVersion, description, remediation
```
Required: `registryName`, `repository`, `imageDigest`, `severity`, `cveId`, `packageName`. Missing required headers return `400 { error: "Invalid CSV headers", missing: string[] }`.

---

## 10. Admin — Auth & Reports

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/oidc/enabled` | 🌐 | Returns `{ "enabled": boolean }` so the login page can decide whether to render the SSO button. |
| `GET` | `/api/oidc` | 👑 | Returns the OIDC configuration (with sensitive fields redacted). Encrypted in Postgres using `AUTH_SECRET`. |
| `POST` | `/api/oidc` | 👑 | Saves OIDC configuration. |
| `POST` | `/api/oidc/test` | 👑 | Tests an OIDC configuration end-to-end. |
| `GET` | `/api/reports/config` | 👑 | Returns weekly report scheduling configuration. |
| `POST` | `/api/reports/config` | 👑 | Updates weekly report scheduling. |
| `POST` | `/api/reports/test` | 👑 | Sends a one-off test report to the configured recipients. |

---

## 11. Pentest Toolkit

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tools/list` | 🧪 | Returns the allowlisted tools defined in `pentest-backend/config/tools.json`. |
| `GET` | `/api/tools/config` | 🧪 | Returns the active tool configuration. |
| `PUT` | `/api/tools/config` | 👑 | Updates tool configuration (admin-only). |
| `POST` | `/api/tools/execute` | 🧪 | Executes a tool via the pentest backend. The app issues a short-lived JWT signed with `AUTH_SECRET`/`PENTEST_JWT_SECRET` for inter-service auth. |
| `GET` | `/api/tools/logs` | 🧪 | Returns recent `PentestExecution` records. |

---

## 12. Feedback

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/feedback` | 🔒 | Submit feedback. Body: `{ "type": "bug"\|"feature"\|"general", "message": string (5–5000), "page"?: string }`. Per-user rate limited. |
| `GET` | `/api/feedback` | 👑 | Returns the 100 most recent feedback entries. |

---

## 13. Dashboards (v2.16.0)

Personal dashboards with a spec-driven widget engine. Every endpoint requires an authenticated session; ownership is checked per request.

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboards` | 🔒 | Returns `{ mine: Dashboard[], published: Dashboard[] }`. `published` excludes the caller's own boards and includes the owner's name. Both carry `_count.widgets`. |
| `POST` | `/api/dashboards` | 🔒 | Creates a private dashboard. Body: `{ "name": string (1–120), "description"?: string \| null (≤500) }`. Audited as `dashboard.created`. |
| `GET` | `/api/dashboards/{id}` | 🔒 | Returns `{ dashboard, access: { canView, canEdit } }`. `404` (not `403`) when the caller may not view it, so ids cannot be probed. |
| `PATCH` | `/api/dashboards/{id}` | 🔒 | Owner only. Body: any of `{ name, description, visibility: "Private" \| "Published" }`. A visibility change is audited as `dashboard.visibility_changed`. |
| `DELETE` | `/api/dashboards/{id}` | 🔒 | Owner only. Cascades to widgets. Audited as `dashboard.deleted`. |
| `POST` | `/api/dashboards/{id}/widgets` | 🔒 | Owner only. Adds a widget: `{ title, viz, spec, x, y, w, h }`. Max **24 widgets** per dashboard. `400` if the spec fails validation or coherence. |
| `PATCH` | `/api/dashboards/{id}/widgets` | 🔒 | Owner only. Bulk layout save after a drag/resize: `{ layout: [{ id, x, y, w, h }] }` (≤50 items) applied in one transaction. |
| `PATCH` | `/api/dashboards/{id}/widgets/{widgetId}` | 🔒 | Owner only. Partial update of title / viz / spec / geometry. |
| `DELETE` | `/api/dashboards/{id}/widgets/{widgetId}` | 🔒 | Owner only. |
| `POST` | `/api/dashboards/{id}/widgets/{widgetId}/data` | 🔒 | **Executes a saved widget as the caller.** Any viewer who can see the dashboard may run it; the stored spec is re-scoped to *their* permissions. Returns `{ total, rows: [{ label, value }], truncated }`. `422` if the stored spec no longer validates. |
| `POST` | `/api/dashboards/preview` | 🔒 | Runs an **unsaved** spec for the builder's live preview. Same body as `spec` below. |
| `GET` | `/api/dashboards/plan` | 🔒 | `{ available: boolean }` — whether an AI provider is configured. |
| `POST` | `/api/dashboards/plan` | 🔒 | Natural language → widget. Body: `{ "request": string (3–500) }`. Returns `{ title, viz, spec, data }`. Rate-limited; audited as `dashboard.widget_planned`. `400` when AI is unconfigured or the model cannot produce a valid spec. |
| `POST` | `/api/dashboards/{id}/clone` | 🔒 | Copies a viewable dashboard's **specs** into a new private dashboard owned by the caller. |

### Widget spec

The complete grammar a widget may express, defined in [`lib/dashboards/spec.ts`](../lib/dashboards/spec.ts) and enforced with a **strict** Zod schema (unknown keys are a validation error, not silently dropped):

```jsonc
{
  "source":  "vulnerabilities" | "threatActors" | "uploads",  // default "vulnerabilities"
  "metric":  "count" | "avgCvss",                             // avgCvss: vulnerabilities only
  "groupBy": null | "risk" | "status" | "site" | "assignee" | "group" | "scanner" | "month"
                  | "actorType" | "origin" | "tactic" | "sector" | "region" | "technology",
  "filters": { "risk": [...], "status": [...], "scannerType": "NESSUS" | "ACR",
               "hasFix": bool, "internetFacing": bool, "minCvss": 0-10,
               "cveContains": "…", "nameContains": "…", "hostContains": "…", "packageContains": "…" },
  "limit":   1-50,   // default 10, hard-capped by MAX_WIDGET_ROWS
  "months":  1-24    // default 6, only meaningful with groupBy "month"
}
```

`assertSpecIsCoherent()` additionally rejects specs that parse but are meaningless: a grouping that does not belong to the chosen source, `avgCvss` on anything but vulnerabilities, and `filters` on anything but vulnerabilities.

### Execution contract

1. **Validate** — the spec is parsed with the strict schema, then coherence-checked.
2. **Scope** — vulnerability queries are `AND`-ed with the *caller's* group visibility wall, exactly as `GET /api/vulnerabilities` does. Admin status is the only bypass.
3. **Execute** — Prisma aggregates only (`count`, `aggregate`, `groupBy`). No raw SQL is generated anywhere in this path, and no model output ever reaches the database.
4. **Resolve** — `siteId` / `assigneeId` / `groupId` are turned into display names in a single query per field.
5. **Cache** — the result is cached in Redis for 60s under `sha256(spec + viewer scope)`, so a published dashboard cannot serve one user's numbers to another.

Widgets persist the spec only. Results are never written to the database, which is what keeps a published dashboard both fresh and correctly scoped per viewer.

---

## Cross-Cutting Concerns

### Validation
Every route validates inputs through Zod at the API boundary. Common patterns:
- `z.enum(VALID_TOURS)` for tour IDs.
- `z.string().uuid()` for `bucketId`, `siteId`, `assigneeId`.
- `z.string().min(1).max(10_000)` for comment content.
- `z.number().int().min(1).max(10_000)` for page numbers.
- `z.number().int().min(1).max(100)` for the threat intel feed limit.

### Rate Limiting
Authenticated routes key on `userId` via `lib/rate-limit.ts`. Anonymous routes fall back to client IP, with header-spoofing mitigations.

### Error Responses
Production responses never include stack traces. Errors are logged server-side with structured context (request id, route, user id where available) — credential fingerprints (connection strings, account keys, SAS tokens) are never logged.

### Pagination Envelope
Listing endpoints (`/api/admin/users`, `/api/admin/audit-log`, `/api/uploads/history`, `/api/vulnerabilities`, `/api/threat-intelligence/feed`) return:

```json
{
  "items": [ ... ],
  "page": 1,
  "limit": 50,
  "total": 1234
}
```

### Server-Sent Events
The upload progress streams (`/api/uploads/events`, `/api/uploads/{uploadId}/events`) emit JSON-encoded events of the form:

```
event: progress
data: {"uploadId":"...","phase":"parsing","processed":120,"total":4500}
```

Clients should reconnect on transient errors; the worker re-emits the latest snapshot on subscription.

### Inter-Service Auth (Pentest Backend)
The Next.js app proxies `/api/tools/execute` calls to the pentest backend over the internal Docker network. Each request carries a short-lived JWT signed with `PENTEST_JWT_SECRET` (issuer `PENTEST_JWT_ISSUER`, audience `PENTEST_JWT_AUDIENCE`). The backend rejects requests without a valid signature and matching issuer/audience.
