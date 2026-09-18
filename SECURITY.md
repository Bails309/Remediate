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

## AI-Powered Insights (v2.9.0)
The natural-language insights feature is designed so that adding an LLM does **not** widen the application's attack surface or leak sensitive data.

- **Finding data is shared with the model, but RBAC-scoped.** The AI assistant is a tool-using chat: the model reads vulnerability rows through a `search_vulnerabilities` tool. Those results are **always** `AND`-combined with the same group-visibility wall used by `GET /api/vulnerabilities` (`visibilityWhere(isAdmin, memberOf)`), so the model can never surface rows the caller could not already see, regardless of how it phrases a search. The `search_vulnerabilities` arguments are still validated against a strict Zod contract (`lib/ai/query-spec.ts`) with enum whitelists, length-bounded strings, and a capped `limit`; unknown keys are stripped, so a prompt-injection payload cannot introduce raw SQL or arbitrary columns. Deployments that must not send finding data to a third party should point `AI_PROVIDER=openai-compatible` at a self-hosted/air-gapped model.
- **Constrained outbound lookups.** The `get_latest_version` tool reaches only a **hard-coded allow-list** of public package registries (npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist, Go). The model supplies only an ecosystem (enum) and a package name (validated against a conservative charset, path-traversal rejected) — never a URL — so the tool cannot be turned into an SSRF primitive. Every lookup is timed out and cached in-process. Note this requires egress to those registries; disable the feature or use an internal mirror for fully air-gapped estates.
- **No raw SQL.** Searches are translated into a Prisma `where`/`orderBy` by `buildWhereFromSpec` / `buildOrderBy` — there is no raw SQL or string interpolation anywhere in the path.
- **Encrypted credentials.** The provider endpoint (`baseUrlEnc`) and API key (`apiKeyEnc`) are stored **only** as AES-256-GCM ciphertext in the `AiConfig` table via `lib/crypto.ts`, keyed by `AUTH_SECRET`. `GET /api/admin/ai` returns the key as a `"********"` mask; posting the mask back means "keep the existing ciphertext", matching the OIDC / SMTP / storage pattern. Rotating `AUTH_SECRET` invalidates the ciphertext — re-enter the key under **Settings > AI Insights**.
- **Admin-gated configuration, user-gated execution.** All config routes (`GET|POST /api/admin/ai`, `POST /api/admin/ai/test`) require `requireSiteAdmin()` — since v2.16.0 a workspace admin cannot reach them, because choosing the provider decides where finding data is sent. The chat route (`POST /api/vulnerabilities/chat`) requires an authenticated web-app user, is rate-limited on user identity, and returns `400` when the feature is unconfigured or disabled. The assistant's launcher is not rendered at all until a site admin enables it.
- **Auditability.** Every user turn is written to the audit log as `ai_insight_chat` with the question text and the names/outcomes of the tools the model invoked, so AI-assisted activity is fully reviewable.
- **Bounded egress, timeouts & loop limits.** Provider calls use an `AbortController` timeout (`lib/ai/provider.ts`), the tool loop is capped at six iterations, and non-2xx responses surface as `AiProviderError`/`AiChatError` rather than leaking provider internals to the client.
- **The configured assistant name is a prompt-injection surface (v2.16.1).** `AiConfig.assistantName` is interpolated into the model's **system message** so the assistant can introduce itself by name. An unconstrained value could therefore terminate the intended instruction and open its own — the classic system-prompt override. Three controls apply: `normaliseAssistantName()` collapses every whitespace run (including newlines) to a single space, so the value cannot span lines or forge a message boundary; the length is capped at `MAX_ASSISTANT_NAME_LENGTH` (40), which is too short to carry a meaningful replacement instruction; and the field is writable only by `site_admin` via `POST /api/admin/ai`. Note the residual risk is deliberately accepted rather than eliminated — a site admin can already reconfigure the provider entirely, so they are inside the trust boundary. The control exists to stop the value being *accidentally* multi-line and to keep the blast radius bounded if the admin account is compromised. The newline collapse has a dedicated regression test in `tests/lib/ai-config.test.ts`.
- **Accurate data-handling disclosure (v2.16.1).** Until this release the AI Insights admin page claimed *"the model only translates a question into a database filter — your vulnerability data is never sent to the provider."* That was true of the v2.9.0 query planner but became false in v2.12.0, when the planner was replaced by the tool-using assistant described above. An administrator choosing a provider on the strength of that guarantee would have been misinformed for four minor versions. The page now states that findings the asking user can see are sent to the configured provider, so the data-residency decision is made with correct information. Treated as a security defect because the control being described is a disclosure control.

## Archive Restoration (v2.15.0)
`POST /api/vulnerabilities/{id}/restore` moves a finding out of `VulnerabilityHistory` and back into the active queue as `Open`. It is a privileged reversal and is treated as one.

- **Admin-only, deliberately narrower than archiving.** Assignees and group leaders may archive a finding (set `Remediated` / `FalsePositive` / `NoFixAvailable`), but only `site_admin` / `web_app_admin` may reverse it. The archive is the record that someone accepted a risk, called a false positive, or signed off a fix; if the same person could silently un-set it, the archive would stop being usable as an audit surface. The UI button is hidden for non-admins and the route independently returns `403`, so hiding the control is presentation only, not the control itself.
- **No existence oracle.** The role check runs **before** the `VulnerabilityHistory` lookup, so a non-admin gets an identical `403` whether or not the id exists. The endpoint cannot be used to enumerate archived finding ids.
- **Fully audited round trip.** Archiving writes `vulnerability.archived`; restoring writes `vulnerability.restored` with `oldValue` = the archived status and `newValue` = `Open`. `/admin/audit-log` therefore shows who reopened which finding and precisely which determination they overrode.
- **Duplicate guard is an integrity control, not a convenience.** A scan run after the archive may already have re-created the same finding as a live row under a new id. The route pre-checks for an active row matching `(siteId, scannerType, pluginId, host, port)` and refuses with `409`. Without it, one real-world finding could exist twice in triage with divergent statuses and owners, double-counting in every analytics and digest surface.
- **History row is deleted, not retained.** `lib/ingest.ts` treats a surviving `FalsePositive` / `NoFixAvailable` history row as a standing user determination and re-archives the matching finding on the next scan. Keeping the row would make a restore silently self-revert at the next import — an availability/correctness failure that leaves no trace in the logs. Deletion is intentional and is why the audit entry (not the history row) is the durable record of the archive.
- **Rate-limited and transactional.** The route runs through `enforceRateLimit` like every other mutation, and the recreate + history-delete happen in a single Prisma transaction, so a failure cannot leave the finding in both tables or neither.

## Vulnerability Export & CSV Injection Defense (v2.18.0)
The vulnerability export functionality (`GET /api/vulnerabilities/export`) introduces bulk data extraction in CSV, PDF, and JSON formats. Several security controls protect against common file generation, privilege bypass, and client-side execution vulnerabilities:

### 1. CSV Formula Injection (CWE-1236 / DDE Injection)
When export files are opened in desktop spreadsheet software (such as Microsoft Excel, LibreOffice Calc, or Google Sheets), untrusted text that begins with formula trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) can execute formula commands or external Dynamic Data Exchange (DDE) macros, potentially causing local code execution or sensitive data exfiltration.

- **Automated Cell Neutralization**: The serializer (`lib/export-csv.ts#sanitizeAndEscapeCsvCell`) inspects every exported cell value. If the string starts with any formula indicator (`=`, `+`, `-`, `@`, `\t`, `\r`), it prepends an ASCII single quote (`'`). Spreadsheet programs interpret the leading single quote as a forced text literal marker, rendering the cell content as plain text without executing formulas or displaying the leading quote.
- **RFC 4180 Compliance & Boundary Quoting**: Fields containing commas, newlines (`\n`, `\r`), or double quotes (`"`) are enclosed in double quotes, with internal quotes escaped as `""`.
- **Coverage**: The sanitization applies across all dynamic database fields, including finding titles, solutions, plugin outputs, package names, hosts, and CR numbers.

### 2. Group Visibility Wall Enforcement on Bulk Extractions
Vulnerabilities can be scoped to organizational departments/groups (`Group` model). The export API is an authenticated bulk endpoint and must never serve as a mechanism to bypass group tenancy:
- **Server-Side Enforcement**: The route handler enforces `visibilityWhere(isAdmin, memberOf)` from `lib/group-rbac.ts`. For any non-administrator, findings outside their explicit group memberships are filtered out directly in the database query.
- **ID Parameter Tampering Resistance**: If an attacker attempts to supply arbitrary `ids` or `groupIds` in query parameters, the database query `AND`-combines the caller's authorized visibility wall, ensuring that unauthorized IDs simply return empty sets rather than leaking finding existence or metadata.

### 3. In-Memory Streaming & Memory Isolation
- **No Temporary Disk Files**: PDF generation (`pdfkit`) and CSV stringification operate purely in Node.js memory buffers and streams. Export artifacts are never written to the host container filesystem, preventing race conditions, temporary file leakage, or directory traversal vulnerabilities.
- **Resource Exhaustion Mitigation**: Export queries are subject to the global API rate limiter (`enforceRateLimit`). Automated pagination in `pdfkit` ensures that large datasets do not trigger unbounded memory allocation or crash the Node.js event loop.

### 4. Cache-Control & Transport Security
- Exported vulnerability reports contain sensitive infrastructure and vulnerability exposure data. The API sets `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` to ensure that neither intermediate enterprise proxies nor browser disk caches store exported attachments.

## Threat Intelligence Environment Correlation & Alert Privacy (v2.19.0)
The threat intelligence environment correlation engine (`lib/threat-intelligence/environment-matcher.ts`) correlates incoming global threat advisories (OSV, NVD, CISA KEV) against the estate's active and historical vulnerability footprint. Because an organization's software inventory and vulnerability history represent highly sensitive security intelligence, several architectural controls guarantee privacy, tenant isolation, and noise suppression:

### 1. In-Process Local Matching (Zero External Egress)
- **Local Footprint Extraction**: The environment footprint builder (`buildEnvironmentFootprint`) executes strictly within the application/worker process, querying local PostgreSQL tables (`Vulnerability` and `VulnerabilityHistory`) across all ingested sources (Nessus CSV scans, penetration-testing PDFs, and Azure Container Registry container scans).
- **No Outbound Asset Leakage**: The application **never** transmits local asset names, package inventories, container repository names, internal hosts, or discovered CVE lists to external threat feeds or third-party APIs. Public threat feeds (OSV, CISA KEV, NVD) are pulled down unidirectionally into local `ThreatFeedItem` records; correlation and matching are computed 100% in-memory locally.

### 2. Dual-Feed Segregation & Independent Delivery
- **Separation of Concerns**: Users can configure independent subscriptions for the **Environment-Correlated Digest** and the **Global Threat Feed** via `components/ThreatSubscriptionUI.tsx` and `POST /api/threat-intelligence/subscription`.
- **Discrete Communication Channels**: When both feeds are active, the dispatcher (`lib/threat-intelligence/dispatcher.ts`) dispatches two separate, clearly branded email messages:
  - `[Environment Alert] Daily Threat Intelligence — Matched to Your Environment`
  - `Daily Threat Intelligence (Global Feed)`
- **Zero-Noise Suppression**: If an environment feed check produces zero correlated threat items (or if no global threats meet the configured severity threshold), dispatching for that feed is skipped entirely. No empty or misleading emails are generated, eliminating alert fatigue and reducing unnecessary email transmission.

### 3. Authenticated Per-User Scoping & GDPR Compliance
- **Identity Isolation**: The subscription API (`/api/threat-intelligence/subscription`) strictly requires an authenticated session (`requireUser()`). Users can only read and mutate their own digest preferences; cross-tenant or cross-user subscription modification is impossible.
- **GDPR Subject Access & Erasure**: All subscription settings (`globalDigestEnabled`, `environmentDigestEnabled`, `minRisk`, `cisaKevOnly`, `scheduledHour`, `scheduledMinute`) are included in GDPR data export requests (`GET /api/account`) and automatically purged upon user account deletion (`DELETE /api/account`).

### 4. Memory-Safe Multi-Pass PDF Pagination & Export Safety
- **Bounded Buffer Allocation**: Exporting vulnerability records (including hierarchical VM grouping) operates via streaming memory constructs in `pdfkit`. The multi-pass footer generator safely overrides margin limits during header/footer passes (`page.margins.bottom = 0`), eliminating runaway blank page generation and unbounded memory consumption during large enterprise report exports.

## Role Model & Privilege Tiers (v2.16.0)
Until v2.16.0 `requireAdmin()` accepted both `site_admin` and `web_app_admin`, and every `/admin` page and API sat behind it. A **Workspace Admin** could therefore read and rewrite OIDC and storage credentials, create and delete users and groups, and read the audit log — privileges the role's name does not imply. The tiers are now separated:

| Tier | Roles | Owns |
| :--- | :--- | :--- |
| **Site Admin** | `site_admin` | Installation configuration (Authentication/OIDC, Storage, Scanner Import, Reporting, AI provider), identity (Users, Groups), the audit log, and platform health / System Status. |
| **Workspace Admin** | `site_admin`, `web_app_admin` | Workspace data: dashboards, analytics, vulnerabilities, Inventory (buckets, manual uploads, dead-letter queue) and upload Automation. |
| **Workspace User** | `+ web_app_user` | Read and work findings within the group visibility wall. |
| **Workspace Auditor** | `web_app_auditor` | Read-only; write-granting roles are stripped when auditor is assigned. |
| **Toolkit** | `toolkit_user`, `toolkit_admin` | The isolated pentest toolkit only. |

> **`toolkit_admin` is a command-execution role — treat it as equivalent to shell access on the pentest backend.** `PUT /api/tools/config` lets that role define the `command` and `args` of a tool, and `POST /api/tools/execute` then runs it. `validateToolsConfig()` enforces *structure* (required fields, unique ids, array shapes) but deliberately does **not** allowlist binaries, because curating the tool catalogue is the feature. This is not an escalation — the role can already run offensive tooling with attacker-chosen inputs by design — but it does mean `toolkit_admin` must be granted with the same care as a shell account on that host, and it is why the toolkit runs as a separate service rather than inside the main app. CodeQL flags the config write as *"network data written to file"*; that finding is accurate and accepted, with the RBAC gate as the control.

Enforcement is layered, so a gap in one does not expose the surface:
1. **Edge** — [`proxy.ts`](proxy.ts) redirects non-`site_admin` sessions away from `/admin/*`, and non-workspace-admins away from `/uploads`, `/buckets` and `/automation`.
2. **Page** — every site-administration page calls `requireSiteAdmin()` server-side. `/admin/users`, `/admin/groups` and `/admin/health` previously had **no** server guard and relied solely on the middleware prefix match; they are now guarded directly.
3. **Route handler** — the matching APIs use `requireSiteAdmin()` / `checkSiteAdmin()`. Group *listing* deliberately remains workspace-visible (assignment UIs need it); group *mutation* is site-admin only.

`GET /api/admin/audit-log` was already `site_admin`-only; the new audit-log UI shows an explicit "site administrator access required" state rather than failing silently for workspace admins.

## Dashboard Widget Query Safety (v2.16.0)
Custom dashboards let users — and optionally an LLM — describe what they want to see. The feature is built so that neither can express anything the schema does not already allow.

- **No text-to-SQL, anywhere.** A widget stores a JSON *spec*, validated by a **strict** Zod allowlist ([`lib/dashboards/spec.ts`](lib/dashboards/spec.ts)): three sources, two metrics, a fixed grouping list per source, and vulnerability filters reused from the existing AI query spec. `.strict()` means an unexpected key (`{ "sql": "…" }`) fails validation rather than being quietly stripped, and `assertSpecIsCoherent()` rejects source/grouping combinations that parse but are meaningless.
- **The model plans; Prisma executes.** `POST /api/dashboards/plan` asks the provider for `{ title, viz, spec }` and validates the result against the same allowlist before it is used. The model sees no rows, emits no query, and cannot name a table or column. This mirrors the pattern already used by the vulnerability assistant.
- **Execution is always scoped to the viewer.** [`lib/dashboards/execute.ts`](lib/dashboards/execute.ts) `AND`s every vulnerability query with the caller's group visibility wall — the same fragment `GET /api/vulnerabilities` uses.
- **Publishing cannot leak data.** Widgets persist only the spec; results are never written to the database. A published dashboard is re-executed per viewer, so two people can open the same board and correctly see different numbers. The Redis cache (60s TTL) is keyed on `sha256(spec + viewer scope)`, so a cached admin result can never be served to a non-member.
- **Bounded cost.** Rows are capped at `MAX_WIDGET_ROWS` (50), a dashboard holds at most 24 widgets, layout writes are capped at 50 items, and both the preview and plan endpoints are rate-limited per user. Widget planning is audited as `dashboard.widget_planned` with the request text and resulting spec; dashboard creation, deletion and visibility changes are audited too.

## Third-Party Feed Ingest (v2.16.0)
The MITRE ATT&CK sync ([`lib/threat-intelligence/actors.ts`](lib/threat-intelligence/actors.ts)) fetches a ~40MB STIX bundle from a fixed, hard-coded GitHub raw URL — the endpoint is not operator-configurable, so a compromised settings row cannot redirect it. The response is parsed as JSON and mapped through an explicit field projection; nothing from the bundle is executed, rendered as HTML, or used to build a query. Group descriptions are stored truncated (4,000 chars) and rendered as text. The manual refresh endpoint is workspace-admin gated and rate-limited; the automatic path runs on the worker at most weekly.

Attribution fields (`actorType`, `origin`, `targetSectors`, `targetRegions`, `targetTechnologies`) are keyword-derived from prose, not published facts. They are labelled as derived in the UI so they are not mistaken for authoritative intelligence.

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
- Dashboard widget specs are parsed with a **strict** Zod allowlist — unknown keys are a hard validation failure, not a silent strip — and are additionally coherence-checked before execution (see [Dashboard Widget Query Safety](#dashboard-widget-query-safety-v2160)).

## Content Security Policy
- The middleware generates a cryptographic nonce (`crypto.randomUUID`) for each request, applied to `script-src` and `style-src` CSP directives.
- `script-src` is nonce-only in production. Any third-party component that injects an inline `<script>` must be given the request nonce explicitly — as of v2.16.0 `ThemeProvider` (next-themes) receives it from the App Router layout, otherwise its theme bootstrap is blocked and the page flashes the wrong theme on first paint.
- Third-party iconography (`country-flag-icons`, `simple-icons`) is bundled as inline SVG rather than loaded from a CDN, so no `img-src`/`connect-src` relaxation is required for it.

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
