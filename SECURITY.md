# Security Guidelines

This file lists practical security controls and best practices for running Remediate.

## Secrets & Credentials
- Store sensitive values (`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, SMTP creds) in your platform's secret store (GitHub Secrets, Azure Key Vault, ACA secrets).
- Never commit secrets to the repository.
- Credential values (connection strings, account keys, SAS tokens) are never written to application logs.

## Encryption
- `AUTH_SECRET` is used to encrypt OIDC, SMTP, and Azure storage configuration stored in Postgres — keep it safe and rotate periodically.
- All secrets use AES-256-GCM via `lib/crypto.ts` (`encrypt` / `decrypt`). A SHA-256 fingerprint (`fingerprintSecret`) is surfaced for verification without ever returning plaintext.
- Use TLS for all external services (Postgres endpoint, Redis, SMTP).

## Pentest PDF Processing
- As of `v2.6.1`, pentest PDF ingestion is **entirely in-process**. There is no outbound PDF Processing API call, no encrypted API key, no admin configuration page, and no `PdfProcessingConfig` table.
- The built-in parser (`lib/pentest-pdf-builtin.ts`) uses `pdf-parse` for text extraction and `pdfjs-dist` (legacy build, loaded dynamically) for yellow-highlight detection. Both libraries run in the worker process; PDF bytes never leave the deployment.
- Yellow-highlight spans are emitted as `\u0001HL\u0002 … \u0001/HL\u0002` private-use markers in the persisted Examples payload. The client (`renderPluginOutput` in `vulnerabilities-client.tsx`) HTML-escapes the payload **before** unwrapping the markers into `<mark>` spans, preventing XSS even if the source PDF contains HTML-like text inside a highlighted region.
- The pentest upload route (`POST /api/uploads/pentest`) is still gated by `requireAdmin()`, a 25 MB size cap, the per-bucket Redis advisory lock, and the global rate limiter.

## Azure Container Registry Blob Ingest (v2.8.0)
- **Credential storage**: The `AzureBlobIngestConfig` table stores connection strings, account keys, and SAS tokens **only** as AES-256-GCM ciphertext (`connectionStringEnc`, `accountKeyEnc`, `sasTokenEnc`) via `lib/crypto.ts#encrypt`, keyed by `AUTH_SECRET`. Rotating `AUTH_SECRET` invalidates the ciphertexts; re-enter the credentials via the `/admin/azure-blob-ingest` console after rotation.
- **No plaintext echo**: `GET /api/admin/azure-blob-ingest` never returns credential values — encrypted fields are replaced with the `"****"` sentinel. On save, `"****"` means "keep the existing ciphertext"; any other non-empty string is encrypted fresh before being written. This mirrors the existing OIDC / SMTP / Azure File Share pattern.
- **Header-first validation**: `AzureBlobIngestService.processBlob` calls `validateAcrCsv(text)` **before** any DB write. Malformed CSVs are logged and skipped; no `UploadHistory` row is created and the source blob is left in place for the next cycle.
- **Delete-after-ingest semantics**: When `deleteAfterImport` is true, the source blob is deleted **only after** the ingest job has been successfully enqueued. If enqueue fails, the blob is retained; the next poll will see it again and idempotency at the CSV-row dedup key ensures no duplicate findings. This trades a small window of possible re-processing for stronger delivery guarantees.
- **All endpoints** (`GET|POST /api/admin/azure-blob-ingest`, `POST /api/admin/azure-blob-ingest/poll`, `POST /api/admin/azure-blob-ingest/test`) are gated by `requireAdmin()`. `POST /api/uploads/acr` is likewise admin-only, size-capped at 50 MB, per-bucket Redis-lock protected, and rate-limited.
- **No credential logging**: Secret values never appear in log lines. The Test endpoint accepts unmasked secrets in-flight so administrators can validate before saving; the credentials are used exactly once to construct a Blob service client and are discarded when the request completes.

## Multi-Scanner Reconciliation Isolation (v2.8.0)
- Every reconciliation query in `lib/ingest.ts` (both the Nessus `processNessusUpload` and the new `processAcrUpload`) is scoped by `scannerType`. An ACR ingest **cannot** archive a Nessus finding (or vice versa) even when both scanners target the same bucket in the same second. Any future scanner family (`ScannerType.<X>`) must follow the same pattern: **every** delete/find/archive path must be scoped by `scannerType` or a source will silently archive another's rows.
- The composite dedup key `(siteId, scannerType, pluginId, host, port)` guarantees that rescans within a scanner family land as updates rather than inserts, even when ACR and Nessus happen to share a host/port value.

## Authentication
- Local credential comparison uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.
- Auth provisioning never overwrites manually assigned database roles on subsequent logins.

## Access Control
- Grant the minimal DB role required. Use managed identities where supported.
- Restrict network access to Postgres and Redis to trusted subnets or services.
- **RBAC Hierarchy**: Non-site-admins cannot grant `site_admin` or `toolkit_admin` roles via the admin API.
- **Last-Admin Protection**: Role removal and user deletion for the last `site_admin` are guarded within database transactions to prevent race conditions.
- **Rate Limiting**: Authenticated API routes key rate limits on user identity rather than client IP headers where possible.

## Group / Department Visibility Wall (v2.7.0)
Groups (departments) are enforced server-side as a **visibility wall**, not a UI filter. Read paths reject access to grouped items the caller does not belong to, regardless of how the URL or query was constructed:
- **`GET /api/vulnerabilities`** intersects the requester's `groupIds` query token with their `memberOf` set **before** issuing the SQL. Non-members cannot widen scope by guessing group UUIDs; admin status is the only bypass.
- **`GET /api/vulnerabilities/{id}`** short-circuits with `403` when `canViewVulnerability` returns false, so direct-link access is also blocked.
- **`/api/vulnerabilities/{id}/comments`** re-checks the wall before exposing collaborator content or accepting an `askForHelp` toggle.
- **Mutation paths** (`PATCH`, bulk, group change, reassign) all run through `lib/group-rbac.ts` helpers; the bulk endpoint aborts on the first item the caller cannot mutate, never partially-applying a forbidden update.
- **Group management** routes (`/api/groups/*`) gate every membership mutation through `canManageGroupMembership`, and the last-leader guard (PATCH demote + DELETE remove) protects non-admin leaders from accidentally dissolving their own group; only an admin can.

## Clickjacking & Frame-Ancestors
- The application sends `Content-Security-Policy: ... frame-ancestors 'none'` on every response via `proxy.ts`. This is the modern, browser-honoured directive that prevents the app from being framed.
- As of `v2.7.0` the deprecated `X-Frame-Options: DENY` header is **no longer emitted**. Sending both is redundant and was flagged in an external penetration test. The relevant comment in `proxy.ts` documents the rationale so the header isn't reintroduced.

## Input Validation
- All user-facing search queries escape SQL LIKE wildcards (`%`, `_`, `\`) to prevent pattern injection.
- Vulnerability statuses are validated against a strict enum whitelist.
- Tour IDs, analytics site IDs, and comment content are validated with Zod schemas at the API boundary.
- Page numbers and feed limits are capped to prevent unbounded queries.
- Bucket import patterns are validated for regex syntax and length.

## Content Security Policy
- The middleware generates a cryptographic nonce (`crypto.randomUUID`) for each request, applied to `script-src` and `style-src` CSP directives.

## Runtime Migration Safety
- `scripts/migrate.js` uses a Postgres advisory lock to ensure only one instance applies migrations. This reduces risk when multiple containers start simultaneously.

## Container & Image Security
- Build images from official base images and pin versions in CI.
- Scan images for vulnerabilities (e.g., GitHub Code Scanning, Microsoft Defender).

## Dependencies
- Keep `npm` dependencies up to date. Run periodic `npm audit` and address critical findings.
- **Dependabot** is enabled for the `npm` ecosystem and opens PRs against direct and transitive dependencies. Review weekly and merge after CI is green.
- **Pinned overrides**: When an upstream library has not yet propagated a fix transitively, add a pin to the root `overrides` block in `package.json`. The current pinned set (as of `v2.8.0`) is:
  - `nodemailer@8.0.5`
  - `vite@8.0.5`
  - `defu@6.1.6`
  - `magicast@0.3.5`
  - `picomatch@4.0.4`
  - `lodash@4.18.1`
  - `brace-expansion@2.0.3`
  - `flatted@3.4.2`
  - `fast-xml-parser@5.8.0`
  - `fast-xml-builder@1.2.0`
  - `postcss@8.5.10` (closes GHSA-qx2v-qp2m-jg93 for the copy pulled in by Next.js)
  - `uuid@14.0.0` (belt-and-braces pin past the vulnerable 11.x range)
- **Lockfile policy**: `package-lock.json` is committed and authoritative — CI runs `npm ci`, never `npm install`. Regenerate locally with `npm install --package-lock-only` after editing dependency ranges or overrides.
- **Vulnerability reporting**: Run `npm audit --omit=dev` before each release and document the residual count in the changelog. As of `v2.8.0`, four nodemailer advisories (`GHSA-268h-hp4c-crq3`, `GHSA-wqvq-jvpq-h66f`, `GHSA-r7g4-qg5f-qqm2`, `GHSA-p6gq-j5cr-w38f`) with **no upstream fix available** are tracked in [`.audit-allowlist.json`](.audit-allowlist.json) \u2014 each is non-exploitable in this codebase (see the `reason` field per entry) and has a mandatory 90-day expiry so it gets re-reviewed.

### npm audit allowlist policy
- The CI audit gate (`scripts/audit-filter.mjs` in both `ci.yml` and `dependency-audit.yml`) pipes `npm audit --omit=dev --json` through an allowlist-aware filter. Advisories at severity `high` or `critical` that are **not** on the allowlist cause CI to fail.
- **Every allowlist entry MUST have**: `ghsa`, `package`, `severity`, a `reason` documenting *why* the advisory is not exploitable in this codebase (or referencing the mitigation), and an `expires` ISO date no more than 90 days out.
- **Expired entries fail CI** \u2014 they do not silently keep suppressing. This forces a review cadence: on expiry either upgrade to a patched version if one now exists, delete the entry if the code path was refactored away, or renew the entry with a fresh justification.
- Never add an entry for a `critical` advisory without security review. Never add an entry to hide a genuinely exploitable finding \u2014 fix or work around the vulnerability first.

## Vulnerability Reporting
If you believe you have found a security issue, please report it privately rather than opening a public GitHub issue. Contact the repository administrator listed in `package.json` or via your organisation's security channel. Provide:
1. A description of the issue and its impact.
2. Reproduction steps or a proof-of-concept.
3. The Remediate version (`/admin/health`) and deployment platform.

We aim to acknowledge reports within two business days.

## Backups & DR
- Schedule regular backups for Postgres and snapshot retention for Redis (or use managed service backups).
- Test restoring backups periodically in a staging environment.

## Operational Practices
- Run migrations in CI and gate deployment on successful migration to avoid surprise runtime failures.
- Log and alert on migration failures; fail fast and stop deployments.
- Full `VACUUM` operations should be scheduled as periodic maintenance (e.g., daily cron), not run per-upload.

## Notes
- Avoid running untested schema changes in production. Use feature flags or phased rollouts for high-risk changes.

## Key Rotation Procedure
1. **AUTH_SECRET**: Generate a new value (`openssl rand -base64 32`), update the secret store, and redeploy. Existing sessions will be invalidated — users must re-authenticate.
2. **DATABASE_URL**: Rotate credentials through your managed database provider (e.g. Azure Key Vault auto-rotation), then restart the application.
3. **REDIS_URL**: Update the password in both the Redis server and the secret store, then restart.
4. **SMTP credentials**: Update in the admin Settings page (encrypted at rest with `AUTH_SECRET`).
5. **Schedule**: Rotate `AUTH_SECRET` at least every 90 days, or immediately after any suspected compromise.

## Incident Response
1. **Detection** — Automated health checks (`GET /api/health`) monitor PostgreSQL and Redis availability. System status is visible in the admin Operations page. Audit logs (`AuditLog` table) record all security-relevant actions.
2. **Containment** — Revoke compromised sessions by rotating `AUTH_SECRET`. Disable affected user accounts via the admin Users page. If a credential is compromised, rotate it immediately per the Key Rotation Procedure above.
3. **Investigation** — Query the audit log via `GET /api/admin/audit-log` with action/entity filters. Review application logs for anomalous activity patterns.
4. **Recovery** — Restore from backups if data integrity is affected. Redeploy with rotated secrets. Verify system health via `/api/health`.
5. **Post-Incident** — Document the incident, root cause, and remediation steps. Update this guide with any new controls. Notify affected users per GDPR Article 34 if personal data was compromised.

## Data Retention Policy
- **User accounts**: Retained while active; deleted on GDPR erasure request (`DELETE /api/account`) or admin action.
- **Audit logs**: Retained for 12 months. Implement a scheduled job to purge entries older than the retention period.
- **Vulnerability data**: Retained as long as relevant; archived records preserved in `VulnerabilityHistory`.
- **Session data**: JWT tokens expire after 8 hours. Idle sessions time out after 20 minutes.
