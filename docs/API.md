# Remediate HTTP API Reference

> **Applies to release**: `v2.5.2` (2026-05-12). When new endpoints are added under `app/api/`, append a row to the relevant table below and document any new request/response shape.

All endpoints are served by the Next.js application under `/api/*`. Unless explicitly marked **Public**, every route requires an authenticated session cookie issued by NextAuth (Auth.js v5).

| Symbol | Meaning |
| :--- | :--- |
| 🌐 | Public — no session required. |
| 🔒 | Authenticated — any signed-in user. |
| 🛡️ | Admin — requires `admin`, `site_admin`, or `toolkit_admin` per route. |
| 👑 | Site Admin — `site_admin` only. |
| 🧪 | Pentest — `pentest_user`, `pentest_admin`, or `site_admin`. |

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
| `GET` | `/api/vulnerabilities` | 🔒 | Paginated search. Query: `q`, `status`, `risk`, `bucketId`, `assigneeId`, `id`/`ids`, `page` (≤10000), `limit`. ILIKE wildcards are escaped server-side. |
| `GET` | `/api/vulnerabilities/{id}` | 🔒 | Returns a single vulnerability with assignee, collaborators, comment count, and history snippet. |
| `PATCH` | `/api/vulnerabilities/{id}` | 🔒 | Update status, assignee, collaborators, CR number, or sunset flag. RBAC: standard users may only self-assign or unassign; CR number is required for `InProgressWithCR`. |
| `POST` | `/api/vulnerabilities/bulk` | 🔒 | Bulk update across selected ids. Body: `{ "ids": string[], "patch": { ... }, "crNumber"?: string }`. Same RBAC as single update; CR prompt required for `InProgressWithCR`. |
| `GET` | `/api/vulnerabilities/{id}/comments` | 🔒 | Lists comments visible to the requester (admins, assignees, collaborators when "Ask for Help" is enabled). |
| `POST` | `/api/vulnerabilities/{id}/comments` | 🔒 | Adds a comment. Body: `{ "content": string }` (1–10,000 chars, Zod validated). |
| `PATCH` | `/api/vulnerabilities/{id}/comments` | 🔒 | Edits a comment owned by the caller. Body: `{ "commentId": string, "content": string }`. |
| `DELETE` | `/api/vulnerabilities/{id}/comments` | 🔒 | Deletes a comment. Author or admin only. Query: `commentId`. |

### Vulnerability statuses

`Open`, `InProgress`, `InProgressWithCR`, `Sunset`, `Remediated`, `FalsePositive`, `NoFixAvailable`. Validated server-side as a `z.enum`.

---

## 4. Uploads & Ingestion

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/uploads/nessus` | 🔒 | Multipart upload of a Nessus CSV. Stores the payload in Redis (2-hour TTL) and enqueues a BullMQ job. |
| `GET` | `/api/uploads/history` | 🔒 | Paginated upload history (status, counts, processing duration). |
| `GET` | `/api/uploads/progress` | 🔒 | Snapshot of all in-flight uploads for the current user. |
| `GET` | `/api/uploads/{uploadId}/progress` | 🔒 | Per-upload progress (counts, current phase). |
| `GET` | `/api/uploads/events` | 🔒 | Server-Sent Events stream for global upload progress. |
| `GET` | `/api/uploads/{uploadId}/events` | 🔒 | SSE stream for a specific upload. |
| `GET` | `/api/uploads/dead-letter` | 👑 | Lists failed jobs in the dead-letter queue. |
| `POST` | `/api/uploads/dead-letter` | 👑 | Requeues a single failed job. Body: `{ "jobId": string }`. |
| `PUT` | `/api/uploads/dead-letter` | 👑 | Bulk requeue all dead-letter entries. |
| `DELETE` | `/api/uploads/dead-letter` | 👑 | Permanently removes a dead-letter entry. Query: `jobId`. |

---

## 5. Buckets (formerly Sites)

| Method | Path | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/buckets` | 🔒 | Lists all buckets the user can see, with assignment counts and active vulnerability totals. |
| `POST` | `/api/buckets` | 🛡️ | Creates a bucket. Body: `{ "name": string, "description"?: string, "importPatterns"?: string[], "aliases"?: string[] }`. Patterns and aliases are regex-validated and length-capped. |
| `PUT` | `/api/buckets/{bucketId}` | 🛡️ | Updates a bucket. Same validation as create. |
| `DELETE` | `/api/buckets/{bucketId}` | 👑 | Deletes a bucket. Refuses if associated vulnerabilities exist unless `?force=true`. |

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
