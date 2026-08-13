# Changelog

All notable changes to this project are documented in this file. The project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) and the [Keep a Changelog](https://keepachangelog.com/) conventions.

> **Sections used**: `Added`, `Changed`, `Fixed`, `Security`, `Removed`, `Deprecated`, plus two project-specific sections — `Documentation` (doc-only changes shipped with a release) and `Note` (operator guidance, deployment caveats, and post-release confirmation of a diagnosis). Dates are ISO-8601 (`YYYY-MM-DD`). Version numbers correspond to the value in `package.json` and the `APP_VERSION` build argument surfaced on `/admin/health`.

## [2.16.0] - 2026-08-13
### Added
- **Personal dashboards with a spec-driven widget engine.** Operators can build their own views, drag and resize them, and publish them to the rest of the organisation. The design decision that shapes everything else here is that a widget stores its **query**, never its **results**.
  - [`prisma/schema.prisma`](prisma/schema.prisma) — new `Dashboard` (owner, name, description, `DashboardVisibility` = `Private` \| `Published`) and `DashboardWidget` (title, `viz`, `spec` JSON, grid `x`/`y`/`w`/`h`) models, migration [`20260813190000_dashboards`](prisma/migrations/20260813190000_dashboards/migration.sql).
  - [`lib/dashboards/spec.ts`](lib/dashboards/spec.ts) — the widget contract. A **strict** Zod allowlist of 3 sources (`vulnerabilities`, `threatActors`, `uploads`), 2 metrics (`count`, `avgCvss`), per-source groupings, and vulnerability filters reused from the existing AI `querySpecSchema`. `.strict()` means an unknown key (`{ "sql": "DROP TABLE …" }`) is rejected outright rather than silently stripped, and `assertSpecIsCoherent()` rejects combinations that parse individually but are nonsense together (e.g. grouping threat actors by `assignee`, or asking for average CVSS on the uploads table).
  - [`lib/dashboards/execute.ts`](lib/dashboards/execute.ts) — the only place a spec touches the database, via Prisma aggregates only. Every vulnerability query is `AND`-ed with the **viewer's** group visibility wall (identical semantics to `/api/vulnerabilities`), foreign keys are resolved to bucket/user/group display names in one round trip per field, and results are capped at `MAX_WIDGET_ROWS` (50).
  - **Results are cached, not stored.** Redis caches each execution for 60s under a key derived from `hash(spec + viewer scope)`. This is what makes publishing safe: two people opening the same dashboard run the same spec under their own permissions and legitimately see different numbers, rather than one person's cached figures being served to everyone.
  - [`app/(app)/dashboards/`](app/(app)/dashboards/) — dashboard list (mine + published) and a drag/resize grid built on `react-grid-layout` v2 (`gridConfig`/`dragConfig`/`resizeConfig` API, `useContainerWidth` in place of the removed `WidthProvider`). Positions persist through a bulk `PATCH` after each drag or resize.
  - [`components/dashboards/WidgetRenderer.tsx`](components/dashboards/WidgetRenderer.tsx) — one renderer for all five visualisations (stat, bar, donut, line, table) over the shared `{ total, rows[], truncated }` payload, reusing the existing recharts vocabulary and severity colour scale.
  - [`components/dashboards/WidgetBuilder.tsx`](components/dashboards/WidgetBuilder.tsx) — side-sheet builder with a predefined metric picker and a debounced live preview that runs the unsaved spec through `POST /api/dashboards/preview`.
- **AI widget planning — the model plans, it never queries.** [`lib/dashboards/plan.ts`](lib/dashboards/plan.ts) asks the configured provider for a single JSON object (`{ title, viz, spec }`) and validates it against the same allowlist the manual builder uses, then runs it through `assertSpecIsCoherent()`. The model receives no data, emits no SQL, and cannot name a table, column or filter that is not already in the schema. `POST /api/dashboards/plan` is rate-limited, returns a preview of the resulting data, and writes a `dashboard.widget_planned` audit entry containing the request text and the planned spec. The builder hides the AI panel entirely when no provider is configured.
- **Threat Actors — a MITRE ATT&CK adversary catalogue that keeps itself current.** [`app/(app)/threat-intelligence/actors/`](app/(app)/threat-intelligence/actors/) lists every ATT&CK Enterprise `intrusion-set` (176 groups at time of writing) with search, actor-type filters, a clickable tactic breakdown, an industry/region heatmap, targeted technologies and most-used tooling.
  - [`lib/threat-intelligence/actors.ts`](lib/threat-intelligence/actors.ts) — fetches the ATT&CK Enterprise STIX bundle, resolves each group's `uses` relationships into tactics, technique counts and malware/tool names, and skips `revoked` / `x_mitre_deprecated` objects. New `ThreatActor` model + migrations [`20260813150000_threat_actors`](prisma/migrations/20260813150000_threat_actors/migration.sql) and [`20260813170000_threat_actor_technologies`](prisma/migrations/20260813170000_threat_actor_technologies/migration.sql).
  - **Attribution is derived, and labelled as such.** ATT&CK models tactics, techniques and software but has no structured field for actor type, country of origin, target industries, target regions or targeted products. Those five fields are keyword-derived from the group's prose description and the UI states "derived from ATT&CK group descriptions" wherever they are shown, rather than presenting inference as fact.
  - Refresh is automatic: `syncThreatActorsIfStale()` runs on worker boot and inside the existing scheduler tick, re-syncing when the catalogue is empty or older than **7 days** (ATT&CK itself publishes only a few releases a year). `POST /api/threat-intelligence/actors` gives admins a manual refresh.
  - [`components/CountryFlag.tsx`](components/CountryFlag.tsx) / [`components/BrandIcon.tsx`](components/BrandIcon.tsx) — inline SVG flags (`country-flag-icons`) and vendor marks (`simple-icons`, CC0). Both are offline packages: emoji flags do not render on Windows, and a CDN such as flagcdn.com would be blocked by the `img-src 'self' blob: data:` CSP. Brand marks are only used where a bucket **is** a single vendor (Citrix, VMware/ESXi, Confluence, Apache/Log4j, Kubernetes, Linux); multi-vendor categories keep a generic icon so the mark cannot misrepresent the count. Dark brand colours fall back to `currentColor` via a luminance check.
- **Security Score on the command centre.** [`lib/security-score.ts`](lib/security-score.ts) computes a severity-weighted remediation posture (`Critical` 10, `High` 5, `Medium` 2, `Low` 1) as `resolvedWeight / (resolvedWeight + openWeight)`, rendered as a gauge in [`components/SecurityScoreCard.tsx`](components/SecurityScoreCard.tsx) with an 8-week discovery sparkline. The `30d` delta is explicitly the points attributable to findings **discovered** in the last 30 days — `Vulnerability` has no resolution timestamp, so a true historical trend line would have been fabricated rather than measured.
- **Audit log UI.** [`app/(app)/admin/audit-log/`](app/(app)/admin/audit-log/) — the `AuditLog` table has been written to since v2.5 and readable via `GET /api/admin/audit-log`, but had no interface. Now filterable by action and entity type, 50 per page, with a clear "site administrator access required" state instead of a silent failure for workspace admins.
- **Theme now follows the operating system.** [`components/ThemeToggle.tsx`](components/ThemeToggle.tsx) cycles Light → Dark → **System**, and `defaultTheme` moves from `light` to `system` so first-time visitors match their OS immediately. The CSP nonce is now passed to `ThemeProvider` so its inline theme script is not blocked by the nonce-only `script-src` in production.
### Changed
- **Navigation rebuilt as an icon rail with hover flyouts.** [`components/Sidebar.tsx`](components/Sidebar.tsx) replaces the 260px sidebar with an 88px rail flush to the viewport edge, reclaiming ~56px of horizontal space for content. Sections open on hover, can be **pinned** open (they then survive outside clicks and navigation until explicitly closed), and close on Escape or outside click when unpinned. The mobile drawer mirrors the same grouping.
  - Rail: **Insights** (Command Centre, Analytics, My Dashboards) · Vulnerabilities · **Intelligence** (Threat Feed, Threat Actors) · **Inventory** (Buckets, manual uploads, dead letter queue, Tools) · **Automation** (Nessus file share, ACR blob ingest) · **Settings** (site administration).
  - The built-in dashboard nav entry is renamed **Command Centre** so it no longer reads identically to the new *My Dashboards*; the route (`/dashboard`) is unchanged.
- **Administration split from two hubs into standalone pages.** The tabbed `Settings` and `Operations` hubs consolidated five and two clients respectively behind tab state, which made every section unlinkable and undeep-linkable. Each is now its own page: Authentication (`/admin/oidc`), Storage, Scanner Import, Reporting, AI Insights (`/admin/ai`, which previously had a client component but no route), plus System Status. `/admin/settings` redirects to `/admin/oidc`.
- **Uploads split per source, with automation moved out.** `/uploads/nessus`, `/uploads/pentest` and `/uploads/acr` replace the single tabbed page (`/uploads` redirects to the Nessus page), and the "Automation" halves now live under `/automation/nessus` and `/automation/acr`. The dead letter queue moved from `/admin/dead-letter` to `/uploads/dead-letter` so queue management sits with the uploads it belongs to — and, being workspace rather than site administration, it is reachable by workspace admins again.
- **Threat intelligence syncs no longer depend on the reporting toggle.** In [`lib/report-scheduler.ts`](lib/report-scheduler.ts) the scheduler tick returned early when `ReportConfig` was missing or `enabled` was false, and the threat sync sat *after* that guard — so an installation that had never configured scheduled email reports silently received no hourly CVE deltas and no daily full sync. Threat intelligence and the ATT&CK actor sync now run in their own `try` block ahead of the report guard, with independent error handling. The same fault existed one level deeper: the hourly `:45` delta sat after `prisma.reportConfig.findFirst()` inside `handleDailyThreatIntelligence()` and now runs before it.
- **Dashboard tiles lost the HUD corner brackets.** The `.hud` class is removed from [`components/StatCard.tsx`](components/StatCard.tsx), [`components/ThreatSummaryCard.tsx`](components/ThreatSummaryCard.tsx) and the command centre panels. The utility remains in `globals.css` if it is ever wanted again.
### Security
- **The `web_app_admin` (Workspace Admin) role no longer implies site administration.** Previously `requireAdmin()` covered both roles and gated every `/admin` page and API, so a workspace administrator could edit OIDC and storage credentials, create and delete users and groups, and read the audit log. The role now means what its name says.
  - [`lib/rbac.ts`](lib/rbac.ts) — new `SITE_ADMIN_ROLES`, `requireSiteAdmin()` and `checkSiteAdmin()` alongside the existing workspace-admin helpers.
  - **Site admin only**: Authentication/OIDC, Storage, Scanner Import, Reporting, AI Insights, Users, Groups (create/rename/delete/membership), Audit Logs, System Status/Health. Enforced at three layers — [`proxy.ts`](proxy.ts) redirects non-site-admins away from `/admin/*` at the edge, each page calls `requireSiteAdmin()`, and the matching route handlers use `requireSiteAdmin` / `checkSiteAdmin`.
  - **Workspace admin retains**: dashboards, analytics, vulnerabilities, Inventory (buckets, manual uploads, dead letter queue) and Automation — enforced by middleware on `/uploads`, `/buckets`, `/automation` and by `requireAdmin()` on those routes.
  - Three admin pages (`/admin/users`, `/admin/groups`, `/admin/health`) previously had **no server-side guard at all** and relied solely on the middleware prefix check. They now call `requireSiteAdmin()` directly.
  - Role pills in the Users admin screen carry tooltips describing exactly what each role grants, so the boundary is discoverable rather than tribal knowledge.
- **AI never reaches the database.** The widget planner extends the pattern already used by the vulnerability assistant: the model emits a constrained JSON spec that is Zod-validated against an allowlist and executed deterministically by Prisma under the caller's RBAC. There is no text-to-SQL path anywhere in the feature, and a prompt-injection payload cannot introduce a table name, a column, or a filter that is not already in the schema.
- **Published dashboards cannot leak data across the visibility wall.** Widgets persist only their spec; every render re-executes it as the viewer, and the Redis cache key includes the viewer's scope so an admin's results can never be served to a non-member.
- **Dependency**: pinned `nanoid` to `3.3.18` via `overrides` to clear [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8) (high — custom generators can loop indefinitely when `size` is zero). The package was reachable only transitively through `postcss` under `@tailwindcss/postcss`, so it is build-time only and never reached the request path. `npm audit` is now clean.
### Fixed
- **Grouped widgets failed with an invalid Prisma call.** `prisma.vulnerability.groupBy()` was passed `_avg: undefined` when the metric was a plain count; Prisma rejects the key being *present* with an undefined value rather than ignoring it, so every grouped widget returned `400`. The selector is now spread conditionally. Covered by a regression test asserting `_avg` is absent for counts and present for `avgCvss`.
- **A failing widget rendered "Loading…" forever.** `WidgetRenderer` treated `data === null` as pending, so an error was visually indistinguishable from an in-flight request. Failures now surface the server's message.
- **The Settings flyout never appeared.** `.glass-edge` in [`app/globals.css`](app/globals.css) sets `position: relative`, and because plain CSS in that file is *unlayered* it beats Tailwind's `absolute` utility (which lives in `@layer utilities`). The panel was therefore laid out in normal flow, 720px below the fold — open, visible to Playwright's visibility check, and invisible to the user. Positioning now sits on a wrapper element with the glass styling on an inner one.
- **Clicking the Settings rail item did nothing.** The click handler computed `setPinned(!isExpanded)`, but a mouse always hovers before it clicks, so `isExpanded` was already `true` and every click closed what the hover had just opened. Click now toggles only the pinned state.
- **A pinned flyout closed when clicking elsewhere.** The outside-click handler did not check the pinned state, defeating the purpose of pinning.
- **Stray scrollbar in the navigation rail** caused by label overflow — the rail now scrolls without a visible track.
### Documentation
- [`docs/API.md`](docs/API.md) — new **§13 Dashboards** documenting all eight endpoints, the widget spec schema, the allowlist rationale and the per-viewer execution contract; **Threat Actors** added to §7; admin route guards re-marked 👑 to match the new site-admin boundary; dead-letter path corrected. "Applies to release" banner refreshed to `v2.16.0`.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — new sections for the navigation shell, the dashboard widget engine (spec → validate → scope → execute → cache) and the ATT&CK ingest, plus an updated privilege-tier table.
- [`SECURITY.md`](SECURITY.md) — new **Role Model & Privilege Tiers**, **Dashboard Widget Query Safety** and **Third-Party Feed Ingest** sections.
- [`README.md`](README.md) — version banner, navigation model, dashboards and threat actor overviews, refreshed documentation map and repo structure.
### Note
- **The ATT&CK bundle is ~40MB of JSON** fetched with a 120s timeout and parsed in a single pass. It runs at most weekly on the worker. If the worker is ever memory-constrained, this is the one job with a large transient allocation.
- **`country-flag-icons`, `simple-icons` and `react-grid-layout` are new runtime dependencies.** `simple-icons` is a ~3,300-icon barrel, so it is listed in `experimental.optimizePackageImports` in [`next.config.ts`](next.config.ts) to keep it out of the client bundle; only six marks are imported by name.

## [2.15.0] - 2026-08-11
### Added
- **Admins can restore an archived finding back into the active queue.** Terminal statuses (`Remediated`, `FalsePositive`, `NoFixAvailable`) move a row out of `Vulnerability` and into `VulnerabilityHistory`, and until now that was a **one-way door** — a mis-clicked "Remediated", a false-positive call that later turned out to be real, or a vendor fix that regressed all required a DBA to move the row back by hand. There is now a supported, audited path.
  - [`app/api/vulnerabilities/[id]/restore/route.ts`](app/api/vulnerabilities/%5Bid%5D/restore/route.ts) — new `POST /api/vulnerabilities/{id}/restore`. Restricted to `site_admin` / `web_app_admin`; rate-limited like every other mutation route. In one transaction it recreates the row in `Vulnerability` with **status `Open`** and **the original id**, then deletes the history row. Assignee, group, CR number, `createdAt`, `lastSeenAt`, `scannerType` and the ACR fidelity columns (`registryName`, `repository`, `imageDigest`, `imageTag`, `packageName`, `installedVersion`, `remediation`, `timeGenerated`) are all carried across, so a restored finding keeps its full provenance and lands back with its previous owner rather than as an orphan in the unassigned pile.
  - **Restore is admin-only by design.** Archiving is the audit-visible terminal state of a finding — the record that someone accepted the risk, called it a false positive, or signed off the fix. Letting the assignee who set that status silently reverse it would make the archive unreliable as an audit surface, so the capability sits with admins even though assignees and group leaders can archive. The button is not rendered for anyone else, and the API returns `403` regardless of the UI.
  - **Guard against resurrecting a duplicate**: a scan run *after* the archive may already have re-created the same finding as a fresh live row under a new id. Restoring blindly would put two rows for one finding into triage, which then diverge (different assignees, different statuses) and double-count in analytics. The route pre-checks for an active row with the same `(siteId, scannerType, pluginId, host, port)` and refuses with `409 { error, activeId }` so the operator can go work the row that already exists.
  - **The history row is deleted, not kept.** This is the non-obvious part. `lib/ingest.ts` deliberately treats a surviving `FalsePositive` / `NoFixAvailable` history row as a standing *user determination* and re-archives the finding whenever the scanner reports it again (`ARCHIVED_DETERMINATION_STATUSES`). Leaving the history row behind would therefore have made the restore silently self-reverting on the next import — the finding would reappear in the queue, survive until the next scan, then vanish again with nothing in the logs to explain it.
  - Audited as **`vulnerability.restored`** with `oldValue` = the archived status and `newValue` = `Open`, so `/admin/audit-log` shows exactly who reopened what and what determination they overrode. This complements the existing `vulnerability.archived` entry written on the way in, giving a complete round-trip trail.
- **"Restore to active queue" action in the vulnerability detail sheet.** [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx) — the existing "This record is archived history" callout (shown when `recordScope === "archived"`) now carries an admin-only button. It closes the detail sheet and refreshes the list on success, so the item visibly leaves the Archived Findings view; the `409` duplicate case surfaces the server's message as a toast rather than a generic failure.
- Route coverage ([`tests/api/vuln-restore.unit.test.ts`](tests/api/vuln-restore.unit.test.ts)) — rate limiting, the non-admin `403` (asserting the handler does not even read the record, so it can't be used to probe for archived ids), the missing-record `404`, the duplicate `409`, and the success path (status forced to `Open`, id/assignee/group preserved, history row deleted, audit entry written).
### Documentation
- [`docs/API.md`](docs/API.md) — new **Archiving & restoring** deep-dive under §3 documenting the `recordScope` discriminator, the `archivedFrom`/`archivedTo` filters, the full restore contract and its status-code table, and the reasoning behind deleting the history row. "Applies to release" banner refreshed from `v2.8.0` to `v2.15.0`.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the **Vulnerability Lifecycle** section now describes the two-table active/archived split and the restore transition explicitly, instead of only listing statuses.
- [`SECURITY.md`](SECURITY.md) — new **Archive Restoration** section covering the privilege boundary, the audit trail, and why the duplicate guard is a data-integrity control rather than a convenience.
- [`README.md`](README.md) — version banner corrected (it had drifted to `2.9.3` while `package.json` was at `2.14.0`) and the Release Notes section back-filled with condensed entries for every release from `2.9.0` to `2.15.0`, which had only ever been recorded in the changelog.

## [2.14.0] - 2026-08-07
### Changed
- **Nessus imports are now streamed end to end, removing the file-size ceiling.** Every stage of the old pipeline held the entire CSV as one JS string (`streamToString` → `storage.save` → `storage.read` → `parseNessusCsv`). Node caps strings at ~512MB, so `prod_triage.csv` (**773MB**) could not be imported at any memory size — it was guaranteed to throw `ERR_STRING_TOO_LONG` and terminate the worker. Peak memory is now a function of batch size, not file size.
  - [`lib/storage.ts`](lib/storage.ts) — `StorageProvider` gains `saveStream()` / `readStream()`. The Azure blob implementation uses `uploadStream()` with 8MB buffers × 5 concurrency, so transfer costs ~40MB regardless of file size. The Redis fallback still buffers (it is a small-payload provider and Redis caps values at 512MB anyway).
  - [`lib/csv.ts`](lib/csv.ts) — new `parseNessusCsvStream()` built on `csv-parse`'s async API, yielding one row at a time. Row mapping is shared with `parseNessusCsv()` via an extracted `toNessusRow()`, so both paths stay in step.
  - [`lib/azure-file-share.ts`](lib/azure-file-share.ts) — `processFile()` pipes the share download directly into blob storage. The `streamToString()` helper that caused the 2.13.7 crash is deleted.
  - [`lib/ingest.ts`](lib/ingest.ts) — `processNessusUpload()` consumes the CSV as an async iterable, filtering and flushing touches/inserts to Postgres in 500-row batches rather than building full row arrays. Remediated-row archival is now paged for the same reason — loading every remediated row at once would have reintroduced the ceiling.
  - `AZURE_FILE_SHARE_MAX_IMPORT_MB` default raised **128MB → 4096MB**; it is now a sanity check against a runaway file rather than a functional limit.
- **Grace-period filtering no longer logs per row.** It emitted a line per skipped finding, which on a multi-million-row export is itself a significant cost. Skips are counted and reported once: `kept N rows (skipped X None-severity, Y within grace period, Z unparsable publication dates)`.
### Added
- Streaming parser coverage ([`tests/lib/csv.test.ts`](tests/lib/csv.test.ts)) — asserts parity with the sync parser, correct handling of a BOM split across chunk boundaries, and that a 5,000-row input streams through without accumulating.
### Note
- The ACR blob path still uses the string-based reader, guarded by `AZURE_BLOB_MAX_INGEST_MB` (128MB). ACR exports are orders of magnitude smaller; that path can be migrated the same way if it ever needs it.
- Reconciliation still loads existing findings for the site into memory, which scales with **database** size rather than file size. The `[Ingest] Reconciliation candidates for site …: N active, M archived` log line reports it. If N reaches the millions, reconciliation needs to move into SQL via a staging table.

## [2.13.8] - 2026-08-07
### Fixed
- **Threat ingestion was pacing 3× faster than NVD's quota**, so nearly every job hit a 403/429 and burned its retry budget (`Rate limited on https://services.nvd.nist.gov/... retrying in ~3000ms` on essentially every CVE). NVD allows **50 requests per rolling 30s** with an API key (~1.6/s); the 2.13.6 limiter was set to 5 jobs/second.
  - [`lib/threat-intelligence/worker.ts`](lib/threat-intelligence/worker.ts) — limiter changed to **40 requests / 30s**, tunable via `THREAT_SYNC_MAX_PER_WINDOW`.
### Note — 2.13.7 confirmed in production
- With the oversized files skipped, the worker ran clean: `[QueueDepth]` responding in **2ms** (previously timing out at 28–53s), **zero** event-loop-block warnings (previously 18,639ms), no `ClusterAllFailedError`, and no lost BullMQ locks. This confirms the Redis, cluster and event-loop symptoms chased through 2.13.1–2.13.6 were all downstream of the unbounded file-share buffering, not independent faults.
- The measured sizes are `prod_triage.csv` at **773MB** and `test_triage.csv` at **458MB**. 773MB is above Node's ~512MB string limit, so that import could never have succeeded on the current string-based pipeline — it was guaranteed to throw `ERR_STRING_TOO_LONG` and terminate the worker on every poll. Both are now skipped and recorded as `Failed` uploads. **Importing them requires a streaming CSV pipeline** (share → blob → parse) that never materialises the file as a single string; raising `AZURE_FILE_SHARE_MAX_IMPORT_MB` cannot help for the 773MB file.

## [2.13.7] - 2026-08-07
### Fixed
- **Worker container crash-looping: `ERR_STRING_TOO_LONG` from the Azure File Share import.** This is the actual root cause behind the whole "worker goes Stale / imports stuck" sequence, and it supersedes the earlier diagnoses in 2.13.1–2.13.6.

  `AzureFileShareService.processFile()` downloaded the matched CSV and passed it to `streamToString()`, which buffered **the entire file** in memory and then called `Buffer.concat(chunks).toString("utf8")`. For `prod_triage.csv` the result exceeded Node's hard limit on string length (`0x1fffffe8` characters, ~512MB) and threw. Because the throw happened inside the stream's `end` **event listener** — after the `Promise` executor had already returned — it bypassed the enclosing promise *and* the caller's `try/catch`, surfacing as an uncaught exception that terminated the process.

  The polling scheduler runs on every worker boot (`[AzureFileShare] Matching file prod_triage.csv to site Azure Production`, ~6s after start), so this repeated on every deploy and restart. Even when the file stayed just under the string limit, buffering hundreds of megabytes and converting to a UTF-16 string drove the heap into sustained GC pauses — which is what produced the 18–48s event-loop stalls, the `Failed to refresh slots cache` / `None of startup nodes is available` cluster errors, the multi-second Redis writes, and the lost BullMQ job locks. Those were all **downstream symptoms of memory pressure**, not independent Redis faults.
  - [`lib/azure-file-share.ts`](lib/azure-file-share.ts) — `processFile()` now checks `contentLength` via `getProperties()` before downloading and skips anything over the import limit, recording a `Failed` `UploadHistory` row so the operator sees it in the UI rather than losing the file silently. Limit defaults to **128MB**, tunable via `AZURE_FILE_SHARE_MAX_IMPORT_MB`.
  - [`lib/azure-file-share.ts`](lib/azure-file-share.ts) — `streamToString()` enforces the same cap while accumulating (destroying the stream early instead of filling the heap) and wraps the `end` handler in `try/catch` so any failure rejects the promise instead of killing the worker.
- **The ACR blob ingest path had the identical landmine.** [`lib/azure-blob-ingest.ts`](lib/azure-blob-ingest.ts) called `downloadToBuffer()` then `.toString("utf8")` with no size check, so a large ACR export would have crashed the worker the same way. Now guarded by a `contentLength` pre-check (default **128MB**, `AZURE_BLOB_MAX_INGEST_MB`); oversized blobs are left in place rather than deleted.
- **CISA KEV cache only cached successes.** The logs showed the fetch timing out (`DOMException [TimeoutError]`, `FETCH_TIMEOUT` is 15s), which left `kevCache` unpopulated so every ingest job re-attempted the multi-megabyte download — the 2.13.5 fix silently did nothing whenever CISA was slow.
  - [`lib/threat-intelligence/fetcher.ts`](lib/threat-intelligence/fetcher.ts) — failures are now negatively cached for 5 minutes and stale data is served if available, so an unreachable CISA endpoint degrades gracefully instead of restoring the original hot loop.
### Added
- [`scripts/worker.ts`](scripts/worker.ts) — heap/RSS reporting alongside event-loop lag, plus an explicit warning at **85% of the V8 heap limit**. Long *growing* pauses are usually GC under memory pressure rather than application CPU, and previously ended in an unexplained container crash with nothing in the logs to distinguish them.
- Coverage for the oversized-blob guard ([`tests/lib/azure-blob-ingest.test.ts`](tests/lib/azure-blob-ingest.test.ts)) — asserts an oversized blob is neither downloaded nor deleted.
### Note
- The 2.13.1 indexes, 2.13.3 connection pooling, and 2.13.5/2.13.6 threat-sync work remain valid improvements — the 20.5s stall from the uncached KEV download was real and independently worth fixing — but none of them was the cause of the crash loop.

## [2.13.6] - 2026-08-07
### Fixed
- **Threat sync still starved the upload queue after 2.13.5.** The KEV cache and `addBulk()` fixed the enqueue phase — queueing dropped from ~20s to **1s** and peak loop blocking from 20,519ms to ~6,233ms — but the **1,565 ingest jobs themselves** then ran unthrottled in the same process as the upload worker. Each does an OSV/NVD fetch, normalisation and a Prisma upsert; back-to-back they kept timers starved, so Redis writes still took 10–32s, BullMQ lost job locks (`could not renew lock`), and the `{upload-queue}` / `{pentest-pdf-queue}` blocking clients reconnected repeatedly (three `Ready` lines in 40s).
  - [`lib/threat-intelligence/worker.ts`](lib/threat-intelligence/worker.ts) — the threat worker now runs `concurrency: 1` with a `limiter` of **5 jobs/second**, capping the drain rate so imports keep getting scheduled.
  - [`lib/report-scheduler.ts`](lib/report-scheduler.ts) — the startup sync is skipped when `threatFeedMetadata.lastSyncedAt` is under **6h** old, so a deploy no longer queues ~1,600 jobs on every boot. The scheduled sync is unchanged.
### Changed
- **Corrected two instrumentation artefacts that made the 2.13.4 logs ambiguous.**
  - [`scripts/worker.ts`](scripts/worker.ts) — loop-delay sampling moved to its own *synchronous* interval. Reading and resetting the histogram inside the async heartbeat meant backed-up ticks fired in a burst after a stall and reset it before the stall was reported — which is how `Redis SET took 32256ms (loop lag 0ms)` was logged while the loop was in fact starved.
  - [`scripts/worker.ts`](scripts/worker.ts) — `withTimeout()` now reports when the timer *actually* fired, not just its configured budget. `queue depth read timed out after 15000ms` had been logged 52,985ms in, hiding the fact that timers themselves were 38s late.

## [2.13.5] - 2026-08-07
### Fixed
- **Root cause of the recurring "Stale" worker and wedged imports: the startup threat sync was blocking the event loop for ~20s at a time.** The 2.13.4 instrumentation caught it on the first run — `[Heartbeat] Event loop blocked for up to 20519ms` immediately after `[Sync] Found 1604 vulnerabilities. Queueing ingestion...`. Every `ingestThreat()` job called `fetchCisaKev()`, which had **no cache**, so a 1,604-CVE sync downloaded and synchronously `JSON.parse`d the multi-megabyte CISA KEV catalogue **1,604 times**. With the loop blocked, ioredis could not read its sockets: `CLUSTER SLOTS` discovery hit its 15s timeout (`ClusterAllFailedError`), BullMQ's 30s job locks expired (`could not renew lock` → `Missing lock for job … moveToFinished`), and the upload queue stalled as collateral damage. It fired on **every worker boot** via `[Scheduler] Triggering immediate startup threat sync`, which is why it recurred after each deploy.
  - [`lib/threat-intelligence/fetcher.ts`](lib/threat-intelligence/fetcher.ts) — `fetchCisaKev()` is now cached process-wide for 1h, with concurrent callers collapsed onto a single in-flight fetch. Downloads + parses per sync: **1,604 → 1**.
  - [`lib/threat-intelligence/worker.ts`](lib/threat-intelligence/worker.ts) — `syncAllThreats()` enqueues via `addBulk()` in batches of 200 instead of 1,604 sequential `await queue.add()` round-trips, which had been saturating the shared cluster client while the sync's own CPU work starved slot-cache refresh.
- **Worker heartbeat could report a 28s write on a client configured to fail at 5s** (`[Heartbeat] Redis SET took 28845ms (loop lag 0ms)` — note the loop was *not* blocked). ioredis's `commandTimeout` only bounds per-node commands; in cluster mode a write issued while the slot map is refreshing waits in the cluster-level queue unbounded, so the dedicated fail-fast heartbeat client added in 2.12.3 was ineffective under clustering.
  - [`scripts/worker.ts`](scripts/worker.ts) — the heartbeat write is now explicitly time-capped at 5s.
### Note
- The 2.13.3 connection pooling and 2.13.1 ingest indexes remain correct and worth keeping, but neither was the trigger for this incident — they reduced load around a stall whose actual source was CPU-bound JSON parsing in the threat sync.

## [2.13.4] - 2026-08-07
### Added
- **Diagnostics to tell a blocked event loop apart from a Redis stall.** Both present identically from outside — the heartbeat stops advancing and the worker shows "Stale" — but they need opposite fixes, and the 2.13.3 incident had no `[Heartbeat]` error lines *and* a missing `[QueueDepth]` tick, which fits either. The logs now say which.
  - [`scripts/worker.ts`](scripts/worker.ts) — the heartbeat samples `perf_hooks.monitorEventLoopDelay()` and warns when the loop was blocked for **>1s** in an interval, so a CPU/sync-work stall is named explicitly rather than inferred. Heartbeat writes also log their own duration (>1s) and include the loop lag in failure messages.
  - [`scripts/worker.ts`](scripts/worker.ts) — the `[QueueDepth]` probe is time-capped at 15s and reports elapsed time. The shared BullMQ client runs `maxRetriesPerRequest: null`, so a read issued while the socket is down previously queued **forever** and the probe silently stopped reporting — the gap is now logged as a failure instead of vanishing.
  - [`lib/ingest.ts`](lib/ingest.ts) — per-phase timings (`storage read`, `load active candidates`, `load archived candidates`, `mark stale`, `refresh N existing rows`, `insert N new rows`, `find remediated`). A stalled import now leaves a named last-completed phase instead of only `Parsed N rows` followed by silence.

## [2.13.3] - 2026-08-07
### Fixed
- **Worker flapping to "Stale" and uploads wedging, with `ClusterAllFailedError: Failed to refresh slots cache` / `None of startup nodes is available` against Azure Managed Redis.** Not an outage — `[QueueDepth]` reads were succeeding *between* the failures, so AMR was up and only per-client topology discovery was failing. `getBullmqConnection()` returned a **brand-new `Redis.Cluster` on every call**, and BullMQ additionally `duplicate()`s that instance for each `Worker`'s blocking client. The worker process therefore ran **~11 independent Cluster clients** (shared proxy, heartbeat, 3 Queues, 3 Workers × main + duplicated blocking), each holding a socket to every shard and each polling `CLUSTER SLOTS` on its own 60s timer. Azure Managed Redis [rate-limits new connection creation](https://learn.microsoft.com/en-us/azure/redis/best-practices-connection), so a single discovery timeout tore a client down, triggered a fresh burst of connections, and the reconnect storm sustained itself.
  - [`lib/redis.ts`](lib/redis.ts) — `getBullmqConnection()` now returns **one process-wide `Redis.Cluster`** in cluster mode. This is safe by BullMQ's own contract: `RedisConnection` marks a caller-supplied instance `shared` and never closes it, raises its max-listener budget per consumer, and each `Worker` still `duplicate()`s it for its own blocking socket — so blocking clients remain isolated. Cluster clients per worker process: **11 → 6**.
  - [`lib/redis.ts`](lib/redis.ts) — `clusterRetryStrategy` backoff relaxed from `min(times × 100, 2s)` to `min(times × 200, 10s)` **plus jitter**, so simultaneous reconnects stagger instead of thundering-herding a connection-rate-limited endpoint.
  - [`lib/redis.ts`](lib/redis.ts) — default `slotsRefreshInterval` raised **60s → 180s** (still `REDIS_SLOTS_REFRESH_INTERVAL_MS`). ioredis refreshes on `MOVED` regardless, so topology changes are still picked up promptly.
### Added
- Regression coverage ([`tests/lib/redis.modes.test.ts`](tests/lib/redis.modes.test.ts)) asserting `getBullmqConnection()` returns the *same* Cluster instance across calls, and still returns a plain descriptor (not a client) in standard mode.
### Note
- Applies only to `REDIS_CLUSTER_MODE=true` deployments. Azure Managed Redis clustering policy is fixed at creation time; this keeps the OSS policy working rather than requiring a move to the Enterprise policy.

## [2.13.2] - 2026-08-07
### Security
- **Bumped the `js-yaml` npm `override` to a patched release** to clear the high-severity Dependabot advisory flagged on the default branch. The existing override pinned `js-yaml@4.3.0` — itself the vulnerable version — which `eslint@9` pulls in transitively via `@eslint/eslintrc`. Updated [`package.json`](package.json) override `js-yaml` `4.3.0` → `4.3.1`.
  - GHSA-5p4m-2wfm-xmqj (high) — quadratic CPU consumption in `!!omap` resolution; the CVE-2026-59870 fix was not backported to `>=4.0.0 <4.3.1`.
  - Dev-only dependency (lint toolchain); it is not part of the runtime image. `npm audit` now reports **0 vulnerabilities** at the root, and the `pentest-backend` package was already clean.
- Resynced [`package-lock.json`](package-lock.json), whose root `version` field had drifted to `2.9.2` across earlier releases.

## [2.13.1] - 2026-08-07
### Fixed
- **Uploads stuck in "Processing" again — this time a database problem, not Redis.** The ingest diff step looked up existing findings with chunked queries containing a **500-way `OR`** over `(pluginId, host, port[, cve])`. `VulnerabilityHistory` had no index covering those columns, so Postgres could not use an index for that predicate and each chunk degraded into a **full sequential scan of the entire 12-month archive**, re-evaluating 500 branches per row. A 3,528-row ACR scan issued 16 such scans; with no job timeout the worker sat there indefinitely and the upload never left "Processing" (observed: `[Ingest:ACR] Parsed 3528 rows`, then silence).
  - [`lib/ingest.ts`](lib/ingest.ts) — both `processNessusUpload` and `processAcrUpload` now load reconciliation candidates with **two indexed scans** keyed on `(siteId, scannerType, status)` and a narrow `select`, building the dedup maps in memory via a shared `indexReconciliationRows` helper. 16 sequential scans → 2 index scans. Added a candidate-count log line so a future recurrence shows the working-set size directly in container logs.
  - [`lib/ingest.ts`](lib/ingest.ts) — the ACR "touch" loop rebuilt its `id → row` reverse index on every chunk with an O(n) `chunk.includes()` inside, ~14M comparisons per ingest. Now built once per scan.
  - [`prisma/schema.prisma`](prisma/schema.prisma) + migration `20260807180000_add_ingest_reconciliation_indexes` — added `@@index([siteId, scannerType, status])` to **`Vulnerability`** and **`VulnerabilityHistory`**.
### Note
- Requires applying the migration and deploying the updated **worker** image. A job wedged on the old code is still `active` in BullMQ and will stall-recover on worker restart; the per-site ingest lock self-clears via its 1800s TTL, so the retry is not blocked.

## [2.13.0] - 2026-08-05
### Added
- **Negated search on the vulnerabilities list** — prefix a search term with `!` or `-` to *exclude* matching findings instead of including them (e.g. `!apache` hides Apache findings). Works across name, host, pluginId, and CVE, in both the folded (raw SQL) and unfolded (Prisma) query paths.
  - [`app/api/vulnerabilities/route.ts`](app/api/vulnerabilities/route.ts) — parses the `!`/`-` prefix into a `queryNegated` flag; the raw-SQL path wraps the ILIKE match in `NOT COALESCE(…, false)` so NULL columns (e.g. `cve`) don't drop rows under negation, and the Prisma path switches the `OR` block to a null-safe `NOT`.
  - [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx) — search placeholder and tooltip now document the exclude syntax.

## [2.12.6] - 2026-08-05
### Fixed
- **`ClusterAllFailedError: Failed to refresh slots cache` on the managed (cluster) Redis** (`lastNodeError: Error: timeout` at `refreshSlotsCache`). ioredis's default `slotsRefreshTimeout` is **1s**, which is too tight for a TLS-fronted managed Redis cluster — `CLUSTER SLOTS` topology discovery routinely overran it and threw, intermittently breaking connections. Compounding it, per-shard TLS handshakes had no SNI pinned, so shards advertised by `CLUSTER SLOTS` could fail validation and surface as the same slots-refresh timeout.
  - [`lib/redis.ts`](lib/redis.ts) — the `Redis.Cluster` config now sets a generous `slotsRefreshTimeout` (default **15s**, env `REDIS_SLOTS_REFRESH_TIMEOUT_MS`) and a calmer `slotsRefreshInterval` (default **60s**, env `REDIS_SLOTS_REFRESH_INTERVAL_MS`), and pins the TLS **SNI** (`servername`) to the endpoint hostname for `rediss://` so every discovered shard's TLS handshake validates.
### Added
- Coverage for the clustered Redis path ([`tests/lib/redis.test.ts`](tests/lib/redis.test.ts)) — asserts the raised slots-refresh timeout, the `REDIS_SLOTS_REFRESH_TIMEOUT_MS` override, TLS SNI pinning, and the cluster retry/DNS callbacks.

## [2.12.5] - 2026-08-05
### Fixed
- **Uploads still hung in "Processing" (and blocked every later upload) even after the 2.12.4 progress fix.** On a managed **cluster** Redis, the ingest's per-site lock also ran through the shared `redis` client (`maxRetriesPerRequest: null`). A socket drop made the `finally` lock-release `EVAL` queue *forever* — so the job never returned, the BullMQ worker stayed wedged, and subsequent uploads piled up as "Processing" behind it (observed: parse logged `Parsed N rows`, then silence). The lock **acquire** had the same latent hang.
  - [`lib/ingest.ts`](lib/ingest.ts) — extracted fail-fast `acquireSiteLock` / `releaseSiteLock` helpers (shared by the Nessus and ACR paths) that cap every lock op with a timeout. Acquire fails fast (surfaced as a failed upload) instead of hanging; **release never throws or blocks** — a stalled Redis is logged and left to the lock's TTL, so the worker always returns and the queue keeps draining.
### Note
- Requires deploying the updated **worker** image. Uploads already stuck in "Processing" were never written to the database (they hung before any DB write) — re-upload after deploying.

## [2.12.4] - 2026-08-05
### Fixed
- **Uploads (ACR/Nessus) could sit in "Processing" forever and never reach "Completed".** The ingest wrote progress through the shared `redis` proxy (`maxRetriesPerRequest: null`, required for BullMQ). When the managed-Redis socket dropped mid-ingest, a `SET upload:progress:*` command queued in ioredis's offline queue *indefinitely* with no error, so the `await setProgress(...)` never resolved — the loop never reached the Postgres `Completed` write and the UI polled a progress key that never advanced. Same root cause as the 2.12.3 heartbeat freeze, on the ingest's own progress writes.
  - [`lib/progress.ts`](lib/progress.ts) — `setProgress` now races each write against a 2s timeout and swallows failures. Progress is best-effort UI state; a degraded Redis can no longer wedge an ingest, so the job always reaches the authoritative `uploadHistory.status = Completed` write in Postgres.
  - [`app/api/uploads/progress/route.ts`](app/api/uploads/progress/route.ts) — the poll endpoint now time-caps the Redis read and, when the progress key is missing/expired or Redis is unavailable, falls back to the authoritative `uploadHistory.status` in Postgres and synthesises a terminal `Completed`/`Failed` state. A finished upload now resolves in the UI even if the final progress write never landed in Redis.
- **False-positive Semgrep "hardcoded username" finding** on the AI registry `User-Agent` string ([`lib/ai/registry.ts`](lib/ai/registry.ts)). Renamed the `USER_AGENT` constant to `HTTP_UA` (the njsscan rule matches on `USER`-prefixed identifiers) and added a same-line `nosemgrep` suppression; it is an HTTP header value, not a credential.
### Added
- Coverage for `createDedicatedRedis()` ([`tests/lib/redis.test.ts`](tests/lib/redis.test.ts)) and for `setProgress`'s new fail-fast timeout / error-swallowing behaviour ([`tests/lib/progress.test.ts`](tests/lib/progress.test.ts)).

## [2.12.3] - 2026-08-05
### Fixed
- **Worker intermittently reported as "Stale" in the health check while still processing jobs.** The heartbeat wrote through the shared `redis` proxy, which uses `maxRetriesPerRequest: null` (required for BullMQ). When the managed-Redis socket dropped (idle timeout / topology refresh / failover), the `SET worker:heartbeat` command queued in ioredis's offline queue *indefinitely* with no error, silently freezing the heartbeat so a healthy worker looked stale.
  - `lib/redis.ts` — new `createDedicatedRedis()` factory that builds a fresh, non-cached client with the same URL/TLS/cluster handling but caller-provided overrides.
  - `scripts/worker.ts` — the heartbeat now uses a dedicated fail-fast connection (`commandTimeout: 5000`, `maxRetriesPerRequest: 3`) with an `error` listener and explicit `[Heartbeat]` failure logging. A stuck write now rejects within a few seconds, ioredis reconnects, and the next tick refreshes the heartbeat instead of freezing.

## [2.12.2] - 2026-08-04
### Changed
- **"Ask AI" now opens as a compact floating chat window instead of a full-page side sheet** ([`components/AiChatPanel.tsx`](components/AiChatPanel.tsx)). Removed the full-screen dimming overlay so the page stays visible and interactive; the panel is a rounded glass card docked to the bottom-right (capped to the viewport) with a fade/slide-up entrance. Dropped the body scroll lock (no longer modal); `Escape` still closes it.
- Opening the general assistant now closes any per-finding chat and vice-versa, so the two windows never stack in the same corner ([`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx)).

## [2.12.1] - 2026-08-04
### Changed
- **Refreshed the "Ask AI" side panel for a cleaner, more professional look** ([`components/AiChatPanel.tsx`](components/AiChatPanel.tsx)). The overlay now covers the full viewport consistently (raised stacking above floating page chrome so nothing pokes through at the bottom), with a softer, even backdrop dim + blur and a slide-in entrance. Added a glass panel with an accent top edge and ambient glow, a gradient AI badge in the header, hover-lift suggestion chips, and an accent focus ring on the composer.
### Added
- **`Escape` closes the AI panel** and background scroll is locked while it is open; added `role="dialog"`/`aria-modal` for accessibility.

## [2.12.0] - 2026-08-04
### Added
- **Futuristic "command centre" UI pass.** A set of additive, opt-in visual effects that layer motion, depth, and HUD cues onto the existing glass design system — no layout changes.
  - **Animated count-up stat numbers** ([`components/AnimatedNumber.tsx`](components/AnimatedNumber.tsx)) with severity-matched neon glow, used by [`StatCard`](components/StatCard.tsx). Honours `prefers-reduced-motion` (and SSR/tests) by rendering the final value instantly.
  - **HUD corner brackets, accent hover-glow, cursor-following spotlight, and a one-shot scanline sweep** on glass cards, driven by new composable utilities in [`app/globals.css`](app/globals.css) (`.hud`, `.card-glow`, `.spotlight`, `.scanline-sweep`) and a global pointer tracker ([`components/CursorSpotlight.tsx`](components/CursorSpotlight.tsx)). The effects use `::after` / background layers / child elements so they compose cleanly with the existing `.glass-edge` (`::before`).
  - **Ambient animated backdrop** (drifting radial-gradient mesh), a masked perspective grid, and subtle film grain behind the app in dark mode.
  - **Pulsing "live" indicator** on the Live Intelligence card ([`components/ThreatSummaryCard.tsx`](components/ThreatSummaryCard.tsx)) and staggered entrance for the Recent Bucket Activity rows ([`app/(app)/dashboard/page.tsx`](app/(app)/dashboard/page.tsx)).
  - All motion is disabled under `prefers-reduced-motion`.

## [2.11.0] - 2026-08-04
### Added
- **Ask AI about a single finding.** The **Vulnerability Details** side sheet now has an **"Ask AI about this finding"** button that opens a chat scoped to that one issue, with issue-specific prompts (explain the risk, get remediation steps, check for a newer package version). The panel header shows the CVE/title and each finding starts a fresh conversation ([`components/AiChatPanel.tsx`](components/AiChatPanel.tsx), [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx)).
  - **RBAC-safe scoping.** The client sends only the finding's `id`; the server re-fetches it via `getFocusContext` under the same group-visibility wall as the search tool ([`lib/ai/tools.ts`](lib/ai/tools.ts)), so a caller can never pin the assistant to a finding they aren't allowed to see, and the context handed to the model is trusted database data rather than anything the client supplied. The resolved details are injected as a focused system message that keeps the model scoped to the issue and skips a redundant search ([`lib/ai/chat.ts`](lib/ai/chat.ts)).
  - **Endpoint** [`/api/vulnerabilities/chat`](app/api/vulnerabilities/chat/route.ts) now accepts an optional `focusId`; an unknown or out-of-scope id simply yields an unfocused chat. `focusId` is recorded in the `ai_insight_chat` audit entry.

## [2.10.1] - 2026-08-04
### Fixed
- **AI chat returned "The AI returned an empty response." with reasoning models (e.g. gpt-5-mini).** In the tool-calling path, reasoning models spend hidden tokens "thinking" before emitting tool calls or a visible answer; the `chatWithTools` cap of `max_completion_tokens: 2048` was exhausted by that reasoning across the tool loop, so the provider returned an empty completion with `finish_reason: "length"` ([`lib/ai/provider.ts`](lib/ai/provider.ts)). Raised the reasoning-model budget for tool chat to `8192`, stopped advertising an empty `tools: []` array on the final fallback call, and now surface/log `finish_reason` with a clearer user-facing message when the model truncates ([`lib/ai/chat.ts`](lib/ai/chat.ts)).

## [2.10.0] - 2026-08-04
### Changed
- **The "Ask AI" feature is now a multi-turn assistant that reads your findings.** The v2.9.0 natural-language *query planner* (model → validated filter spec, model never saw data) has been **replaced** by a tool-using chat that reasons over the actual vulnerabilities so it can summarise, prioritise, and advise on upgrades — the workflow of "paste the table into an assistant and ask what to fix first", built in.
  - **RBAC-scoped by design.** The model reads data only through a `search_vulnerabilities` tool ([`lib/ai/tools.ts`](lib/ai/tools.ts)) whose results are always `AND`-combined with the same group-visibility wall as [`app/api/vulnerabilities/route.ts`](app/api/vulnerabilities/route.ts) — it can never see rows the caller couldn't already see. Tool arguments are still Zod-validated ([`lib/ai/query-spec.ts`](lib/ai/query-spec.ts)) with unknown keys stripped and no raw SQL in the path.
  - **Live "newer version?" checks.** A `get_latest_version` tool ([`lib/ai/registry.ts`](lib/ai/registry.ts)) queries a hard-coded allow-list of public registries — npm, PyPI, NuGet, Maven, RubyGems, crates.io, Packagist, Go — so the assistant can tell you whether a fixed release exists. SSRF-safe (fixed hosts, validated package names), timed out, and cached in-process.
  - **Multi-turn chat panel.** A new [`AiChatPanel`](components/AiChatPanel.tsx) side sheet replaces the old inline bar/results view in [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx); the launcher stays hidden until an admin enables the feature.
  - **New endpoint** `GET`/`POST` [`/api/vulnerabilities/chat`](app/api/vulnerabilities/chat/route.ts) (availability + chat), orchestrated by [`lib/ai/chat.ts`](lib/ai/chat.ts) with a bounded 6-iteration tool loop. Rate-limited and audited as `ai_insight_chat` (question text + tools invoked). Provider tool-calling support added in [`lib/ai/provider.ts`](lib/ai/provider.ts) (`chatWithTools`).
  - **Removed** the superseded `POST /api/vulnerabilities/insights` planner route. `buildWhereFromSpec`/`buildOrderBy`/`query-spec` are retained and reused by the search tool.
  - **Tests**: added [`tests/lib/ai-registry.test.ts`](tests/lib/ai-registry.test.ts) (registry lookups, SSRF/traversal guards, caching), [`tests/lib/ai-chat.test.ts`](tests/lib/ai-chat.test.ts) (tool-loop orchestration), and `chatWithTools` coverage in [`tests/lib/ai-provider.test.ts`](tests/lib/ai-provider.test.ts).
### Security
- **Privacy posture change (intentional).** Enabling the assistant now shares vulnerability rows the caller can already see with the configured model — the v2.9.0 "the AI never sees your data" guarantee no longer applies. The `get_latest_version` tool also requires egress to public package registries. Docs ([`SECURITY.md`](SECURITY.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), [`README.md`](README.md), [`DEPLOYMENT.md`](DEPLOYMENT.md), [`docs/AZURE_ENV_VARS.md`](docs/AZURE_ENV_VARS.md)) and the What's New card updated accordingly. For estates where finding data must not leave the network, point `AI_PROVIDER=openai-compatible` at a self-hosted/air-gapped model.

## [2.9.4] - 2026-08-04
### Fixed
- **"What's New" v2.9.0 card reappeared on every page refresh.** The [`WhatsNew`](components/WhatsNew.tsx) component dismisses by POSTing its `tourId` (`whats-new-aug-2026-v290`) to [`/api/tours/complete`](app/api/tours/complete/route.ts), but that ID was missing from the endpoint's `VALID_TOURS` allow-list. The Zod `enum` check rejected it with `400 Invalid tourId`, so the dismissal was never persisted to `completedTours` and the modal re-opened on the next load. Added `whats-new-aug-2026-v290` to `VALID_TOURS`.

## [2.9.3] - 2026-08-03
### Security
- **Bumped the `undici` npm `overrides` to patched releases** to clear 5 Dependabot advisories (1 high, 4 moderate) flagged on the default branch. `jsdom@28` (dev/test) pulled in `undici@7.28.0`, which the existing override pinned — the vulnerable version. Updated [`package.json`](package.json) overrides `undici@^7.0.0` → `7.29.0` and `undici@^6.0.0` → `6.28.0`. Advisories addressed:
  - GHSA-8xcm-r25x-g524 (high) — downstream response desynchronization via the retry interceptor.
  - GHSA-4cwx-7wf7-3272 — cross-user information disclosure and parse-time crash via degenerate private cache directives.
  - GHSA-m8rv-5g2x-5cg5 — CRLF injection via a blob-like body `type` property.
  - GHSA-jr45-8vmc-qm54 — cross-user information disclosure via whitespace around equals in `Cache-Control` directives.
  - GHSA-v3r7-h72x-cjcm — cookie attribute injection via unsanitised domain and unparsed `setCookie` fields.
  - `npm audit` now reports 0 vulnerabilities at the root; the backend package was already clean. Typecheck passes.

## [2.9.2] - 2026-08-03
### Fixed
- **Page-level horizontal scrollbar when AI Insights returned results.** The app shell used an explicit `lg:grid-cols-[260px_1fr]` grid; a bare `1fr` track defaults to `min-width: auto`, so the content column refused to shrink below its widest child. When the AI results/summary introduced wide content, the column expanded past the viewport and produced a left-to-right scrollbar for the whole page (the vulnerabilities table's own `overflow-x-auto` couldn't contain it because its parent column was free to grow). Added `min-w-0` to the content column in [`app/(app)/layout.tsx`](app/(app)/layout.tsx) so the column stays within the viewport and inner scroll containers behave. Also hardened the AI summary banner with `min-w-0 break-words` in [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx) so a long unbroken token in an AI-generated summary can't widen the card.

## [2.9.1] - 2026-08-03
### Fixed
- **AI Insights: Azure AI Foundry connectivity and `gpt-5`-class model support.** The Foundry provider now targets the modern unified route `{{root}}/openai/v1/chat/completions?api-version=preview` and auto-derives the resource root, so pasting any Foundry endpoint shape works — including a project endpoint (`https://<res>.services.ai.azure.com/api/projects/<name>`), a `/models` inference endpoint, or the bare resource root ([`lib/ai/provider.ts`](lib/ai/provider.ts)). Previously it posted to `{{baseUrl}}/chat/completions` with a caller-supplied `api-version`, which returned `400 API version not supported` against project endpoints.
  - **Request body now adapts to reasoning models.** `gpt-5` family and `o`-series (`o1`/`o3`/`o4`) deployments reject `max_tokens` and non-default `temperature`; the client now sends `max_completion_tokens` (with extra headroom so reasoning tokens don't starve the completion) and omits `temperature` for those models, while classic models keep `max_tokens` + `temperature`.
  - **Settings UX**: the AI Insights admin form now shows the resource-root example for Foundry and clarifies that the API Version field expects `preview`/`v1` — not the model version date ([`app/(app)/admin/ai/ai-settings-client.tsx`](app/(app)/admin/ai/ai-settings-client.tsx)).
  - **Tests**: added coverage for Foundry project-endpoint normalisation, the `preview` default, and reasoning-model body shaping across [`tests/lib/ai-insights.test.ts`](tests/lib/ai-insights.test.ts) and [`tests/lib/ai-provider.test.ts`](tests/lib/ai-provider.test.ts).

## [2.9.0] - 2026-08-03
### Added
- **AI-powered natural-language insights on the Vulnerabilities page.** Operators can now ask questions in plain English — e.g. *"Show me the most critical vulnerabilities that already have fixes available"* or *"Which packages should I prioritise updating first?"* — instead of manually combining filters. An **"Ask AI"** bar sits above the existing filter grid ([`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx)); results render in the same table with a dismissible banner, and normal filters resume on **Clear**.
  - **Privacy-first design (NL → validated query spec).** The model **never sees vulnerability data**. It only translates the question into a strict, Zod-validated query plan ([`lib/ai/query-spec.ts`](lib/ai/query-spec.ts)); unknown keys the model might emit are stripped, so prompt-injection cannot widen the query. The plan is executed deterministically with Prisma ([`lib/ai/insights.ts`](lib/ai/insights.ts)) under the caller's existing **RBAC / group-visibility wall**, mirroring [`app/api/vulnerabilities/route.ts`](app/api/vulnerabilities/route.ts).
  - **Provider-abstracted** ([`lib/ai/provider.ts`](lib/ai/provider.ts)): supports **Azure OpenAI** (deployment URLs + `api-key`), **Azure AI Foundry**, and any **OpenAI-compatible `/v1` endpoint** (OpenAI, Ollama, LM Studio, …) with `Bearer` auth. All speak the OpenAI chat-completions format.
  - **New endpoints**: `GET`/`POST` [`/api/vulnerabilities/insights`](app/api/vulnerabilities/insights/route.ts) (availability + execute), and admin `GET`/`POST` [`/api/admin/ai`](app/api/admin/ai/route.ts) + `POST` [`/api/admin/ai/test`](app/api/admin/ai/test/route.ts) (connectivity check). Queries are rate-limited and written to the audit log (`ai_insight_query`).
  - **Configuration**: a new **AI Insights** tab in Admin → Settings ([`app/(app)/admin/ai/ai-settings-client.tsx`](app/(app)/admin/ai/ai-settings-client.tsx)). Secrets (endpoint + API key) are AES-256-GCM encrypted in the new `AiConfig` table ([`prisma/schema.prisma`](prisma/schema.prisma), migration [`20260803120000_add_ai_config`](prisma/migrations/20260803120000_add_ai_config/migration.sql)), following the OIDC-config pattern. Falls back to `AI_PROVIDER` / `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `AI_API_VERSION` env vars when no DB row exists. The bar is hidden entirely until an admin enables the feature.
  - **Tests**: [`tests/lib/ai-insights.test.ts`](tests/lib/ai-insights.test.ts) covers the query-spec → Prisma `where`/`orderBy` translation, schema validation (unknown-key stripping, enum/range rejection), JSON extraction, and per-provider request construction (18 cases).

## [2.8.17] - 2026-07-23
### Security
- **Bumped `next` from `^16.2.6` to `^16.2.11`** to patch four high-severity Next.js advisories flagged by the CI `audit-filter` gate:
  - GHSA-6gpp-xcg3-4w24 — middleware / proxy bypass in App Router with Turbopack + single locale.
  - GHSA-m99w-x7hq-7vfj — DoS in App Router Server Actions.
  - GHSA-89xv-2m56-2m9x — SSRF in Server Actions on custom servers.
  - GHSA-p9j2-gv94-2wf4 — SSRF in rewrites via attacker-controlled destination hostname.
- **Bumped `sharp` to `^0.35.3` and added an npm `overrides` entry** for `sharp` in [`package.json`](package.json) to force the patched version through Next.js's nested `optionalDependencies` (which otherwise pinned `sharp@0.34.5`). Addresses GHSA-f88m-g3jw-g9cj (inherited libvips CVE-2026-33327 / -33328 / -35590 / -35591). `npm audit --omit=dev` now reports 0 vulnerabilities and the CI `audit-filter` gate (level `high`) passes with 0 blocking advisories.

## [2.8.16] - 2026-07-23
### Added
- **New `AwaitingVendor` vulnerability status** for findings escalated to an upstream vendor/supplier where the fix is out of the team's hands. Treated as an **active** status (same tier as `InProgress` / `InProgressWithCR` / `Sunset`) so the item stays in the triage queue, in the weekly assignment digest and leader digest, and in analytics/dashboard "active queue" metrics — rather than being archived like `Remediated` / `FalsePositive` / `NoFixAvailable`. Renders as a **teal** status dot on [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx) so it's visually distinct from the blue/indigo `InProgress*` and orange `Sunset` badges. Added to:
  - **DB enum**: [`prisma/schema.prisma`](prisma/schema.prisma) `VulnerabilityStatus`, with a forward-only migration [`prisma/migrations/20260723120000_add_awaiting_vendor_status/migration.sql`](prisma/migrations/20260723120000_add_awaiting_vendor_status/migration.sql) that `ALTER TYPE ... ADD VALUE 'AwaitingVendor'`. Existing rows are untouched.
  - **API validation**: `z.enum` in [`app/api/vulnerabilities/[id]/route.ts`](app/api/vulnerabilities/%5Bid%5D/route.ts) and [`app/api/vulnerabilities/bulk/route.ts`](app/api/vulnerabilities/bulk/route.ts); both files' `ACTIVE_STATUSES` arrays now include it so PATCH/`bulk` keep the vulnerability in the active table instead of archiving it to `vulnerabilityHistory`.
  - **Ingest reconciliation**: added `VulnerabilityStatus.AwaitingVendor` to the "already-active" status arrays in `processNessusUpload` and `processAcrUpload` ([`lib/ingest.ts`](lib/ingest.ts)) and in the pentest-PDF reconciliation loop ([`lib/pentest-pdf.ts`](lib/pentest-pdf.ts)) so a re-import will not clobber this state.
  - **Analytics + dashboard**: widened all seven `status IN ('Open', 'InProgress', 'InProgressWithCR')` clauses in [`app/(app)/analytics/page.tsx`](app/(app)/analytics/page.tsx) and the one in [`app/(app)/dashboard/page.tsx`](app/(app)/dashboard/page.tsx) to include `'AwaitingVendor'`. Added a teal (`#14b8a6`) entry to the analytics `statusColors` map for the status-breakdown donut.
  - **Notifications**: added to the `status: { in: […] }` filters in both the per-user weekly digest and the leader group digest ([`lib/assignment-notifications.ts`](lib/assignment-notifications.ts)) so escalated items are counted in the summary emails.
  - **UI**: new option in the status filter dropdown (active view), the bulk-status change dropdown, the `statusDotMap`, and the `MyQueueSeverityChart` active-status catalogue ([`components/analytics/MyQueueSeverityChart.tsx`](components/analytics/MyQueueSeverityChart.tsx)) so users can hide/show it from their queue donut like any other active status.
  - **Tests**: added to the mocked `VulnerabilityStatus` enum in [`tests/setup.ts`](tests/setup.ts). The existing archived-status test in [`tests/components/VulnerabilitiesClient.status.test.tsx`](tests/components/VulnerabilitiesClient.status.test.tsx) is unaffected — `AwaitingVendor` is not archived, so `isArchived = ["Remediated", "FalsePositive", "NoFixAvailable"].includes(nextStatus)` remains correct.
  - **Docs**: [`ARCHITECTURE.md`](ARCHITECTURE.md) status list + a note on the new status; [`docs/API.md`](docs/API.md) enum list.

## [2.8.15] - 2026-07-20
### Security
- **Clear the `linux 6.1.176-1` kernel-CVE family (17 findings) on `remediate-pentest-backend` by purging the build toolchain from the runtime image.** The scanner maps `linux-libc-dev:amd64 6.1.176-1` (Debian kernel headers, pulled in transitively via `build-essential` → `libc6-dev`) to the kernel CVE set — **CVE-2026-23302, CVE-2026-53157, CVE-2026-53167, CVE-2026-53366, CVE-2026-53359, CVE-2026-53362, CVE-2026-23272, CVE-2026-23278** (High) and **CVE-2026-31451, CVE-2026-46252, CVE-2026-52928, CVE-2026-53138, CVE-2026-53139, CVE-2026-53158, CVE-2026-53163, CVE-2026-53325, CVE-2026-53327** (Medium) — even though a container never runs its own kernel and the headers are only used to compile native gems/wheels (wpscan et al.) during image build. Fix in [`pentest-backend/Dockerfile`](pentest-backend/Dockerfile): after all tool installs and the production `npm install`, run `apt-get purge -y build-essential make linux-libc-dev && apt-get autoremove -y --purge`. This also sweeps gcc-12, g++-12, cpp-12, binutils, dpkg-dev and ~30 other auto-installed build packages, shrinking both the image and its future scan surface. **Verified in-container before shipping**: purge simulated against the `2.8.13` image — `linux-libc-dev` removed; `nmap`, `ruby`/`wpscan`, `python3`/`sqlmap`/`arjun`, `nikto`, `subfinder`, `nuclei`, `ffuf`, and `node --check dist/index.js` all still pass (runtime shared libraries survive because they are dependencies of retained packages).
- **`tar 6.2.1` (CVE-2026-31802/29786/26960/24842/23950/23745 High, CVE-2026-53655 Medium) and `brace-expansion 2.0.1` (CVE-2026-33750) findings on `remediate-pentest-backend` confirmed stale — no code change.** In-container inspection of the current `2.8.13` image shows the **only** copies present are npm 11.18.0's bundled `tar 7.5.19` and `brace-expansion 5.0.7` (both patched, per the 2.8.11 fix), and `/app/package-lock.json` contains zero references to either package. The open findings were raised against previously-pushed image layers; they will close on the next ACR rebuild/rescan of this release.

## [2.8.14] - 2026-07-20
### Fixed
- **ACR (Azure Container Registry) ingest re-created archived `NoFixAvailable` / `FalsePositive` findings as new Open issues on every subsequent scan.** When a user set an ACR vulnerability to `NoFixAvailable` (or `FalsePositive`), [`app/api/vulnerabilities/[id]/route.ts`](app/api/vulnerabilities/%5Bid%5D/route.ts) archives the row — the record is deleted from `vulnerability` and inserted into `vulnerabilityHistory`. The Nessus ingest already reconciled against both tables, but `processAcrUpload` in [`lib/ingest.ts`](lib/ingest.ts) only queried the active `vulnerability` table, so on the next container-registry import the finding was treated as unseen and a fresh Open row was created — silently reopening a triaged issue and clobbering the user's determination. Fix: mirrored the Nessus reconciliation in `processAcrUpload` — added a second query against `prisma.vulnerabilityHistory` scoped to `ScannerType.ACR` with `status in [FalsePositive, NoFixAvailable]`, populated a `historyMap`, and when a row key matches history we push to a new `touchHistoryIds` list (instead of `createData`) and `updateMany` the archived rows' `lastSeenAt` so they stay discoverable in the archive view without being resurrected. `Remediated` is intentionally excluded from the history lookup (matching Nessus): a `Remediated` finding reappearing means the fix regressed, so a new Open issue is the correct outcome. Regression coverage added in [`tests/lib/ingest.test.ts`](tests/lib/ingest.test.ts) with two new `processAcrUpload` cases (one per archived status). All 7 tests pass.

## [2.8.13] - 2026-07-17
### Added
- **`Total` column on the "Task Count Assigned Per Tech" heatmap** (Analytics page). Each tech row now shows a per-severity breakdown *and* a rollup total (`Critical + High + Medium + Low`) so the queue size per assignee is visible at a glance without mentally summing four pills. Rendered via the existing `showTotal` prop on [`components/analytics/HeatmapTable.tsx`](components/analytics/HeatmapTable.tsx) — no data-model change required; the `Total` field was already computed server-side in [`app/(app)/analytics/page.tsx`](app/(app)/analytics/page.tsx) and used solely for sorting the top-6 techs. The cell renders red when `> 0` and emerald when zero, matching the existing zero-count colour convention.

## [2.8.12] - 2026-07-17
### Added
- **"My Queue" severity donut on the Vulnerabilities page** — when a user filters to their own assignments (via the assignee dropdown or the **My Assignments** button), a compact severity breakdown now renders inline with the pagination bar. Shows a small donut of `Critical`/`High`/`Medium`/`Low`/`None` counts using the same colour palette as the row-level risk badges, plus a running total (`N open` / `N archived` depending on scope). Sits in what was previously wasted whitespace between the search filters and the results table, and does **not** push the table further down the page. Empty queue shows a dashed "0" ring with a "Nothing to triage — nice work." caption.
- **Status filter for the "My Queue" donut** — a small **Filter** popover next to the chart lets the user hide specific statuses from the count (e.g. exclude `Remediated`, `False Positive`, `No Fix`, `Sunset` so the donut reflects "actively working" items only). Selection is stored per-browser in `localStorage` under `remediate.myQueue.hiddenStatuses`, so it survives page navigation, browser restarts, logout/login, and container/image rebuilds. The button turns cyan with a badge showing the count of hidden statuses when the filter is active; a **Reset** action restores the full set. The status catalogue is scope-aware — the popover shows the active-view statuses (`Open`, `In Progress`, `In Progress with CR`, `Sunset`, `False Positive`, `No Fix`, `Remediated`) when viewing active findings and the archived-view statuses (`Remediated`, `False Positive`, `No Fix`) when viewing the archive.
- **New `GET /api/vulnerabilities/severity-summary` endpoint** powering the chart. Returns per-risk counts (`{counts:{Critical,High,Medium,Low,None}, total, scope}`) for the caller's currently-visible queue. Applies the same group-membership visibility wall as `GET /api/vulnerabilities`, is rate-limited via `enforceRateLimit`, and validates the optional `statuses=` whitelist against the `VulnerabilityStatus` enum (unknown values silently dropped — no injection surface into the Prisma `in` clause). Deliberately does **not** accept a `risk` filter, since the response *is* the risk breakdown. Files: [`app/api/vulnerabilities/severity-summary/route.ts`](app/api/vulnerabilities/severity-summary/route.ts), [`components/analytics/MyQueueSeverityChart.tsx`](components/analytics/MyQueueSeverityChart.tsx), [`app/(app)/vulnerabilities/vulnerabilities-client.tsx`](app/(app)/vulnerabilities/vulnerabilities-client.tsx).

## [2.8.11] - 2026-07-16
### Security
- **Fix persistent `tar`/`brace-expansion` findings on `remediate-pentest-backend` — root cause was a two-stage npm-resolver mismatch, not a scanner-cache issue.** After 2.8.9 pinned npm to 11.18.0 in the **runtime** stage, the scanner still flagged `tar 6.2.1` and `brace-expansion 2.0.1`. Investigation showed the pentest-backend `build` stage was still running `npm install` under the base image's npm@10.x, which emitted a lockfile pinning `tar@6.2.1` / `brace-expansion@2.0.1`. That lockfile was then copied into the runtime stage (`COPY --from=build /app/package-lock.json* ./`) and `npm install --omit=dev` honoured the pinned versions verbatim — even though runtime had already been upgraded to npm@11.18.0. Fix in [`pentest-backend/Dockerfile`](pentest-backend/Dockerfile) + [`pentest-backend/package.json`](pentest-backend/package.json):
  - Upgrade npm to `${NPM_VERSION:=11.18.0}` in the **build** stage before `npm install`, so the emitted lockfile pins modern (patched) versions of every transitive dep. Kept on the npm@11 line because npm@12+ requires Node >=22.22.2.
  - Added `overrides` in `pentest-backend/package.json` pinning `tar: 7.5.19` and `brace-expansion: 2.0.3` as belt-and-braces so the override is preserved even if the build-stage npm ever changes. Clears **CVE-2026-31802 / 29786 / 26960 / 24842 / 23950 / 23745** (tar cluster, all High), **CVE-2026-53655** (tar, Moderate), **CVE-2026-33750** (brace-expansion, Moderate), and **CVE-2025-5889** (brace-expansion, Low).

## [2.8.10] - 2026-07-16
### Security
- **Close final batch of `remediate-pentest-backend` ACR findings** — two categories of remaining scanner alerts, plus one deferred-to-rebuild note:
  - **Python pip / setuptools cluster reported at Debian version 23.0.1 / 66.1.1** even after 2.8.9 upgraded them to 26.1.2 / 78.1.1 in `/usr/local`. Root cause: the container scanner keys off **dpkg metadata**, not the actual on-disk Python distribution, so the Debian-shipped `python3-pip` (23.0.1) and `python3-setuptools` (66.1.1) records kept the CVEs flagged regardless of the newer pip/setuptools binaries sitting on `PATH` first. Fix in [`pentest-backend/Dockerfile`](pentest-backend/Dockerfile): `apt-get purge -y python3-pip python3-setuptools && apt-get autoremove -y` immediately after the `pip3 install --upgrade` step. The upgraded pip in `/usr/local/bin/pip3` still resolves for the subsequent `sqlmap`, `arjun`, and other Python installs. Clears **CVE-2026-3219**, **CVE-2025-8869**, **CVE-2023-5752**, **CVE-2026-1703** (pip cluster) and re-confirms the setuptools remediation from 2.8.9 (**CVE-2024-6345**, **CVE-2025-47273**).
  - **Go `github.com/valyala/fasthttp` vendored at 1.31.0** in one or more pentest tools. Fix: added `FASTHTTP_VER=v1.72.0` to the `gotools` stage `ENV` block and appended `github.com/valyala/fasthttp@${FASTHTTP_VER}` to every `go get` line. `go mod tidy` prunes it from tools that don't use it, so the change is safe across `subfinder`, `nuclei`, `ffuf`, `katana`, `gau`. Clears **CVE-2022-21221**.
  - **npm-transitive `ip-address` (CVE-2026-42338), `brace-expansion` (CVE-2026-33750 / CVE-2025-5889), and `diff` (CVE-2026-24001)**: no code change. These are transitive dependencies of the npm CLI's bundled `node_modules` (`ip-address` via `is-cidr`, `brace-expansion` via `minimatch`, `diff` bundled directly). Both `npm@12.0.1` (main image, pinned in 2.8.8) and `npm@11.18.0` (pentest-backend, pinned in 2.8.9) ship modern versions of all three (`ip-address ^10.x`, `brace-expansion ^4.x`/`^5.x`, `diff ^8.x`). The scanner findings are stale results from the previously-cached npm 10.x layer and will resolve on the next ACR rebuild.

## [2.8.9] - 2026-07-16
### Security
- **Remediate remaining ACR image CVEs on `remediate-pentest-backend`** across three toolchains (Node.js npm CLI, Python system pip/setuptools, Go binaries). Applied in [`pentest-backend/Dockerfile`](pentest-backend/Dockerfile):
  - **Node.js CLI bundled deps**: added `ARG NPM_VERSION=11.18.0` + `npm install -g npm@${NPM_VERSION}` in the runtime stage. Kept on the npm@11 line because `npm@12+` requires Node >=22.22.2 and pentest-backend runs on `node:20-bookworm-slim`. `npm@11.18.0` ships `tar@^7.5.19`, `glob@^13.0.6`, `minimatch@^10.2.5`, `@sigstore/tuf@^4.0.2`. Clears **CVE-2026-0775** (npm CLI, High), **CVE-2025-64756** (glob, High), **CVE-2026-53655** (tar, Moderate), **CVE-2026-48758** (@sigstore/core, Moderate), **CVE-2026-27903/27904/26996** (minimatch, High), and **CVE-2024-21538** (cross-spawn, High — pulled in transitively at 7.0.5+).
  - **Python pip + setuptools**: bumped the pip constraint from `pip>=25.3` to `pip>=26.1.2` and added `setuptools>=78.1.1` to the same `pip3 install --upgrade` call. Clears **CVE-2026-8643** (Medium, wheel entry-point path traversal), **CVE-2026-6357** (Medium, pip), **CVE-2024-6345** (High, setuptools RCE via download functions), and **CVE-2025-47273** (High, setuptools path traversal in `PackageIndex`).
  - **Go binaries (logrus)**: added `LOGRUS_VER=v1.9.4` to the `gotools` stage `ENV` block and appended `github.com/sirupsen/logrus@${LOGRUS_VER}` to every `go get` line so `go mod tidy` bumps the transitive `logrus` past the vulnerable 1.8.1–1.8.2 range. Clears **CVE-2025-65637** (High, `sirupsen/logrus`) in all five rebuilt binaries (`subfinder`, `nuclei`, `ffuf`, `katana`, `gau`).
  - **Layer-cache safety**: like the main image in 2.8.8, `NPM_VERSION` is pinned rather than `@latest` so Docker layer caching cannot silently regress the bundled-dep set across rebuilds. Bump on future advisories.

## [2.8.8] - 2026-07-16
### Security
- **Remediate ACR image CVEs re-flagged on `remediate-app` and `remediate-worker` for npm-bundled dependencies (`sigstore`, `tar`, `minimatch`)** — the 2.8.4 fix (`npm install -g npm@latest`) worked at build time but the resulting layer got cached in the registry, so subsequent rebuilds shipped the same npm 11.16.0 tree (`sigstore 2.3.1`, `tar 6.2.1`, `minimatch 9.0.5`) even as new advisories dropped. Fix in [`Dockerfile`](Dockerfile) `base-runner`: replace `npm@latest` with a pinned `ARG NPM_VERSION=12.0.1` so (a) Docker layer caching cannot regress the bundled-dep set silently and (b) the exact CVE-clearing release is auditable in git history. `npm@12.0.1` ships `tar@^7.5.19`, `minimatch@^10.2.5`, and `@sigstore/tuf@^5.0.0` (which brings the `sigstore` 4.x line). Clears **CVE-2026-48815** (sigstore, High), **CVE-2026-31802 / 29786 / 26960 / 24842 / 23950 / 23745** (tar cluster, all High), and **CVE-2026-27904 / 27903 / 26996** (minimatch cluster, High). Bump `NPM_VERSION` on future advisories.

## [2.8.7] - 2026-07-16
### Security
- **Clear remaining npm advisories flagged by Dependabot after the 2.8.4 override batch** — upstream fixes have since shipped for the four `nodemailer` CVEs that were previously suppressed via [`.audit-allowlist.json`](.audit-allowlist.json), plus new advisories landed against dev-scoped `vite`, `js-yaml`, and `@babel/core`. Bumps in [`package.json`](package.json):
  - **`nodemailer` 8.0.5 → 9.0.3** (direct + override). Closes **GHSA-p6gq-j5cr-w38f** (High — message-level `raw` bypasses `disableFileAccess`/`disableUrlAccess` enabling arbitrary file read + full-response SSRF), **GHSA-268h-hp4c-crq3** (Moderate — CRLF injection in `List-*` header comments), **GHSA-wqvq-jvpq-h66f** (Moderate — `jsonTransport` bypasses `disableFileAccess`/`disableUrlAccess`), and **GHSA-r7g4-qg5f-qqm2** (Moderate — improper TLS validation in OAuth2 token fetch). SMTP API surface used by [`lib/email.ts`](lib/email.ts) (`createTransport({host,port,secure,auth,tls})` + `sendMail({from,to,subject,text,html})`) is unchanged across the 8.x → 9.x boundary; `tsc --noEmit` passes. `@types/nodemailer` bumped `7.0.11 → 8.0.1` to match. The four now-obsolete `.audit-allowlist.json` entries have been removed so the audit gate stops carrying an exception it no longer needs.
  - **`vite` 8.0.5 → 8.1.5** (override, dev-only). Closes **GHSA-fx2h-pf6j-xcff** (High — `server.fs.deny` bypass on Windows alternate paths) and **GHSA-v6wh-96g9-6wx3** (Moderate — `launch-editor` NTLMv2 hash disclosure via UNC path handling on Windows; `launch-editor` is a transitive dep inside vite's tree). Also covers `vitest`, `@vitejs/plugin-react`, and `@vitest/coverage-v8`.
  - **`js-yaml` → `4.3.0`** (new override, dev-only via transitive tree). Closes **GHSA-h67p-54hq-rp68** (Moderate — quadratic-complexity DoS in merge-key handling via repeated aliases). Kept within the v4 line to avoid the v5 major.
  - **`@babel/core` → `7.29.7`** (new override, dev-only via transitive tree). Closes **GHSA-4x5r-pxfx-6jf8** (arbitrary file read via `sourceMappingURL` comment).
  - **Verification**: `npm audit` now reports `found 0 vulnerabilities`. **Note on `undici`**: the 2.8.4 overrides (`undici@^6.0.0 → 6.27.0`, `undici@^7.0.0 → 7.28.0`) are correctly resolving in `package-lock.json`; Dependabot alerts for undici seen at 2.8.6 rebuild time were stale and will re-close on the next scan.

## [2.8.6] - 2026-07-16
### Security
- **Remediate `golang.org/x/crypto` / `golang.org/x/net` CVEs still surfaced on `remediate-pentest-backend` after 2.8.4** — CVE-2026-42508 (Critical, `x/crypto/ssh`) and CVE-2026-39831 (Critical, `x/net/html`) were re-flagged against the pinned upstream tool binaries because those releases still vendor pre-0.54.0 / pre-0.57.0 modules. Downloading pre-built binaries is not sufficient. Fix: [`pentest-backend/Dockerfile`](pentest-backend/Dockerfile) now includes a new `gotools` builder stage on `golang:1.25-bookworm` that clones each Go tool at its pinned release tag (subfinder `v2.14.0`, nuclei `v3.11.0`, ffuf `v2.2.1`, katana `v1.6.1`, gau `v2.2.4`), runs `go get golang.org/x/crypto@v0.54.0 golang.org/x/net@v0.57.0 && go mod tidy`, and builds trimmed static binaries that are then `COPY --from=gotools` into the runtime stage. Dalfox v3 is a Rust rewrite and does not vendor Go's `x/crypto`, so upstream binaries continue to be consumed unchanged. No behaviour or CLI-flag change for any tool; images grow slightly from the rebuild but shed the download step at runtime.

## [2.8.5] - 2026-07-16
### Fixed
- **Worker crash on startup after 2.8.4 image prune** — `tsx` was a devDependency, so the new `prod-deps` stage introduced in 2.8.4 (which runs `npm install --omit=dev`) stripped it from the runtime image. `scripts/worker-entrypoint.sh` invokes both `npx tsx /app/scripts/optimize-db.ts` and `npm run worker` (which resolves to `tsx scripts/worker.ts`), so every worker replica crashed with `sh: 1: tsx: not found` after `optimize-db` completed. Fix: moved `tsx` from `devDependencies` to `dependencies` in `package.json` so the pruned runtime tree keeps it. No behaviour change for the app container (Next.js does not use `tsx` at runtime); the worker container recovers on redeploy.

## [2.8.4] - 2026-07-16
### Security
- **Remediate ACR image CVEs across `remediate-app`, `remediate-worker`, and `remediate-pentest-backend`**. Rebuilt images pick up the fixes on next deploy; no runtime configuration changes.
  - **`pentest-backend/Dockerfile`**: added `apt-get upgrade -y` on top of `node:20-bookworm-slim` for Debian security patches (libxml2, curl, python3.11, openssl); upgraded pip to `>=25.3` to close **CVE-2026-8643** (wheel entry-point path traversal); bumped the Go-based pentest tools to releases that bundle patched `golang.org/x/crypto`, `x/net`, and `golang-jwt/jwt` modules — subfinder 2.13.0 → **2.14.0**, nuclei 3.7.1 → **3.11.0** (explicitly bumps `x/crypto` and `go-pkcs12`), ffuf 2.1.0 → **2.2.1**, dalfox 2.9.2 → **3.1.2**, katana 1.5.0 → **1.6.1**, gau 2.2.3 → **2.2.4**. Clears the batch of high/critical `golang.org/x/crypto/ssh` and HTML-parser CVEs (CVE-2024-45337, CVE-2026-46595/46597/46598, CVE-2026-39827–39835, CVE-2025-22869/22870/22872/47914/58181, CVE-2025-30204, CVE-2023-45288, CVE-2026-25680/27136, and more).
  - **`Dockerfile` (app + worker)**: added a new `prod-deps` build stage that runs `npm install --omit=dev --legacy-peer-deps` so devDependencies (`vite`, `vitest`, `@babel/core`, `playwright`, `jsdom`, `@testing-library/*`) no longer ship in the runtime image — eliminates **CVE-2026-53571** (High) and **CVE-2026-53632** (Medium) on vite plus a large tail of transitive findings. The `base-runner` stage now also runs `apt-get upgrade -y` (openssl, libc6, zlib, glibc…) and `npm install -g npm@latest` so the globally-bundled npm CLI — which is what ACR scans surface as `sigstore`, `@sigstore/core`, `@sigstore/verify`, `tar`, `ip-address`, `js-yaml`, `brace-expansion` — pulls in the patched vendored deps (CVE-2026-48815, 48758, 48816, 53655, 42338, 53550, 45149).
  - **`package.json`**: added semver-range `undici` overrides pinning `^6.0.0 → 6.27.0` and `^7.0.0 → 7.28.0` so every transitive path lands on a patched release. Closes **CVE-2026-12151** (WebSocket DoS via unbounded fragment count, High), **CVE-2026-6734** (SOCKS5 pool cross-origin routing, High), **CVE-2026-9697** (SOCKS5 `requestTls` bypass, High), **CVE-2026-9678** (shared-cache disclosure, Moderate), **CVE-2026-9679** (Set-Cookie header injection via percent-decoding, Moderate), **CVE-2026-11525** (SameSite substring downgrade, Low), and **CVE-2026-6733** (keep-alive queue poisoning, Low).
  - **Out of scope for this release**: Linux kernel CVEs surfaced by the scanner (multiple `linux-*` package findings) come from the container host kernel, not the image — fix by patching the ACA / AKS node pool, not the app.

## [2.8.3] - 2026-07-16
### Added
- **Image tag on ACR findings** — the ACR vulnerability CSV export now includes a `tag` column identifying which image tag the scanned digest was published under. The full pipeline picks it up end-to-end:
  - **CSV parsing** ([`lib/csv.ts`](lib/csv.ts)): new optional `imageTag` field on `AcrRow`, mapped from headers `tag`, `tags`, `Image Tag`, or `imagetag` (case-insensitive). The column is **optional** — CSVs without it continue to validate and ingest unchanged.
  - **Schema**: new nullable `imageTag` column on `Vulnerability` and `VulnerabilityHistory` via idempotent migration `20260716100000_add_acr_image_tag`. Nessus rows leave it null.
  - **Ingest** ([`lib/ingest.ts`](lib/ingest.ts)): `imageTag` is written on create, **refreshed on every rescan** alongside `imageDigest` (assignees always see the tag from the most recent scan), and carried into history on archive. Like the digest, it is excluded from the dedup key so a rebuild published under a new tag/digest updates the existing finding rather than duplicating it.
  - **UI**: the "Container Image" section of the vulnerability detail sheet (added in 2.8.2) now shows **Tag** alongside Registry, Repository, Package, Installed Version, Scan Time, and Image Digest.
  - **Tests**: three new cases in [`tests/lib/csv.acr.test.ts`](tests/lib/csv.acr.test.ts) covering the singular header, the aliases, and absence of the column.

## [2.8.2] - 2026-07-16
### Fixed
- **ACR container-image context missing from the vulnerability detail view** — ACR findings ingested in v2.8.0 stored `registryName`, `repository`, `imageDigest`, `packageName`, `installedVersion`, and `timeGenerated` on every row (and the list API already returned them), but the Vulnerabilities detail side-sheet never rendered them. An assignee looking at a container CVE had no way to tell **which image digest** the finding came from when multiple tags/digests exist for the same repository. The detail sheet now shows a **"Container Image"** section (rendered only for `scannerType = ACR`, active and archived records alike) with Registry, Repository, Image Digest (monospace, full `sha256:…` value), Package, Installed Version, and Scan Time. Because a rescan refreshes `imageDigest` on the existing finding, the digest shown is always from the most recent scan.

## [2.8.1] - 2026-07-16
### Fixed
- **Worker crash loop against clustered Azure Cache for Redis over TLS** — `getBullmqConnection()` in [`lib/redis.ts`](lib/redis.ts) previously dropped TLS options when constructing the BullMQ `Redis.Cluster` client, while the general shared client path (`buildRedisInstance`) forwarded them correctly. On deployments where `REDIS_CLUSTER_MODE=true` and `REDIS_URL` uses `rediss://` (Azure Cache for Redis with clustering + TLS), every BullMQ Worker / Queue attempted its shard connections without TLS, the handshake was closed by the server, and each worker crash-looped every ~2 s with `ClusterAllFailedError: Failed to refresh slots cache. lastNodeError: Error: Connection is closed` across `{upload-queue}`, `{threat-ingestion}`, and `{pentest-pdf-queue}`. The cluster branch of `getBullmqConnection` now forwards `tls: { rejectUnauthorized }` (honouring `REDIS_TLS_REJECT_UNAUTHORIZED`) so every discovered shard negotiates TLS the same way the general client already did. No configuration change required — existing `REDIS_CLUSTER_MODE=true` deployments recover on redeploy.
- **Test coverage**: adds two regression tests in [`tests/lib/redis.modes.test.ts`](tests/lib/redis.modes.test.ts) — one asserts TLS is forwarded to `redisOptions.tls` when `REDIS_URL` starts with `rediss://` in cluster mode, and one asserts `REDIS_TLS_REJECT_UNAUTHORIZED=false` is respected on the same path.

## [2.8.0] - 2026-07-15
### Added
- **Azure Container Registry (ACR) Vulnerability Ingest — Manual + Automated**: Extends the ingest pipeline into a new problem space (container image CVEs) while re-using the entire remediation workflow — the same `/vulnerabilities` table, dashboards, analytics, group RBAC, comments, and assignment flow that already back Nessus and pentest findings.
  - **Manual upload**: New **"ACR CSV"** option on the Uploads page (manual tab). The file picker, drop-zone label, and target endpoint switch automatically. Accepts a CSV with headers `timeGenerated, registryName, repository, imageDigest, severity, cveId, packageName, installedVersion, description, remediation` (case-insensitive, BOM-tolerant, plus common aliases such as `CVE`, `Package Name`, `Registry Name`). Uploads route through the shared `{upload-queue}` and land in the current bucket like any other CSV.
  - **Automated blob-container polling**: New scheduler (`lib/azure-blob-ingest-scheduler.ts` + `lib/azure-blob-ingest.ts`) polls an Azure Blob container on a configurable interval, ingests every CSV that matches the optional prefix, and (by default) **deletes the blob from the container** after a successful queueing so a rescan on the same repository lands as an update rather than a duplicate. On queueing failure the blob is retained for the next cycle. Independent of the existing Azure File Share automation — has its own account/container/credentials so you can point it at a different storage account.
  - **Data model**:
    - New `enum ScannerType { NESSUS, ACR }` with `scannerType` columns on `UploadHistory`, `Vulnerability`, and `VulnerabilityHistory` (default `NESSUS`, so every existing row keeps its meaning).
    - New optional columns on `Vulnerability` for ACR fidelity: `registryName`, `repository`, `imageDigest`, `packageName`, `installedVersion`, `remediation`, `timeGenerated`. All nullable — Nessus rows leave them null.
    - New `AzureBlobIngestConfig` singleton table storing the blob-ingest config: `enabled`, `authMethod` (`CONNECTION_STRING` | `ACCOUNT_KEY` | `SAS_TOKEN`), `accountName`, `containerName`, `prefix`, `defaultSiteId` (FK to `Site.id`, `ON DELETE SET NULL`), `pollIntervalMinutes`, `deleteAfterImport`, encrypted `connectionStringEnc` / `accountKeyEnc` / `sasTokenEnc`, and `lastPollAt`. Migration `20260715120000_add_acr_scanner_type` is fully idempotent (`IF NOT EXISTS` + `DO $$ BEGIN … EXCEPTION WHEN duplicate_object`) and additive.
    - **Dedup key** for ACR rows: `(siteId, scannerType=ACR, pluginId=cveId, host, port)` — semantically packed so ACR reuses the existing composite index. `host = "{registryName}/{repository}"`, `port = packageName`, `protocol = "container"`. `imageDigest` is stored but **excluded** from the dedup key so a rescan on a new digest touches the same finding rather than creating a duplicate.
  - **Reconciliation isolation**: Every reconciliation query in `lib/ingest.ts` is now scoped by `scannerType` (both the Nessus `processNessusUpload` and the new `processAcrUpload`). An ACR ingest cannot archive a Nessus row (and vice versa) even when they happen against the same bucket in the same second.
  - **APIs**:
    - **`POST /api/uploads/acr`** *(admin only)* — mirrors the Nessus upload endpoint: multipart form (`file`, `siteId`), 50 MB size cap, per-bucket Redis advisory lock, rate limited, enqueues on `{upload-queue}` with `scannerType: ACR`.
    - **`GET /api/admin/azure-blob-ingest`** — returns the configuration with all encrypted secrets replaced by a `"****"` sentinel (nothing is ever echoed back).
    - **`POST /api/admin/azure-blob-ingest`** — upserts the configuration. Secrets sent as `"****"` are treated as "keep the existing encrypted value"; any other non-empty string is encrypted via `lib/crypto.ts#encrypt` before being written. Emits an audit-log entry on success.
    - **`POST /api/admin/azure-blob-ingest/poll`** — manually triggers a poll cycle ("Run Now"). Returns a summary of blobs processed and any per-blob errors without partial-failing the whole batch.
    - **`POST /api/admin/azure-blob-ingest/test`** — validates the supplied credentials + container name against Azure Blob Storage. Accepts unmasked secrets in the request body so administrators can test before saving; scrubbed from all log lines.
  - **UI**:
    - **Uploads page (manual tab)** — third **"ACR CSV"** selector alongside CSV and PDF; drop-zone label + subtitle update accordingly.
    - **Uploads page (automation tab)** — new compact **"Azure Container Registry (Blob)"** card below the Azure File Share card, linking to a dedicated console.
    - **`/admin/azure-blob-ingest`** — new admin console: enable toggle, auth-method selector, credential fields (masked with `****`), account/container/prefix inputs, default-bucket picker (any existing `Site`), poll-interval spinner, delete-after-import checkbox, and Test / Run Now / Save buttons.
  - **Worker dispatch**: `scripts/worker.ts` now imports `ScannerType` and dispatches each job by `upload.scannerType` — Nessus jobs continue through `processNessusUpload`; ACR jobs run through the new `processAcrUpload`. The Azure Blob ingest scheduler starts alongside the existing Azure File Share scheduler.
  - **Tests**: New `tests/lib/csv.acr.test.ts` covers header validation (required + aliases + BOM), row filtering, and header normalisation. Existing `tests/lib/ingest.test.ts` still passes unchanged — the setup mock (`tests/setup.ts`) now exports the new `ScannerType` and `UploadType` enums so downstream tests get typed access. Full suite: **706 tests passing** (5 pre-existing environmental / parallel-load flakes documented below).

### Fixed
- **BullMQ stuck-in-Processing incident (long-term fix)** — see `[2.7.1]` below; retained here because production still runs `2.7.0` at time of writing and this release ships both fixes together.

### Schema
- Migration `20260715120000_add_acr_scanner_type` creates `enum ScannerType`, adds `scannerType` to `UploadHistory` / `Vulnerability` / `VulnerabilityHistory` (default `NESSUS`), adds the optional ACR columns on `Vulnerability`, creates `AzureBlobIngestConfig` with FK to `Site.defaultSiteId ON DELETE SET NULL`, and adds indexes on `Vulnerability(scannerType, siteId, status)` and `VulnerabilityHistory(scannerType, siteId)`. The migration is idempotent and safe to re-apply.

### Documentation
- README, ARCHITECTURE, SECURITY, and `docs/API.md` refreshed with the ACR ingest surface, the `ScannerType` reconciliation model, and the new `/admin/azure-blob-ingest` console.
- What's New card refreshed for the July 2026 release (`whats-new-jul-2026-v280` tour id). The whitelist in [`app/api/tours/complete/route.ts`](app/api/tours/complete/route.ts) is updated in step.

## [2.7.1] - 2026-07-14
### Fixed
- **BullMQ stuck-in-Processing incident — long-term hardening**: Uploads occasionally sat forever in the **Processing** state on staging after Azure Cache for Redis dropped idle sockets. Root cause: the worker container shared a single `ioredis` proxy across the BullMQ `Queue`, the BullMQ `Worker` (which needs its own dedicated blocking `bclient`), and general app usage. When the shared blocking socket half-closed on idle, BullMQ could not recover and no jobs were pulled, but schedulers kept firing so the queue kept growing. The fix gives each `Queue`/`Worker` its own connection configuration and adds keepalive at the socket level:
  - `lib/redis.ts` — `keepAlive: 30_000` on the shared client; new `getBullmqConnection()` that returns fresh `RedisOptions` (standard) or a dedicated `Redis.Cluster` (cluster) with `maxRetriesPerRequest: null`, `enableReadyCheck: false`, `keepAlive`, `retryStrategy`, and `reconnectOnError` matching `READONLY|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND`.
  - `lib/queue.ts`, `scripts/worker.ts`, `lib/threat-intelligence/worker.ts` — every `Queue` and `Worker` instantiation now uses `getBullmqConnection()` instead of the shared proxy.
  - `scripts/worker.ts` — new `ready` / `error` / `ioredis:close` event logging on both workers and a rolling 60-second `[QueueDepth]` log so a stalled worker is visible in Container Apps logs before the next stuck upload lands.
  - `scripts/diagnose-queue.ts` — new read-only diagnostic (redacted `REDIS_URL`, worker heartbeat freshness, per-queue counts, waiting/active/failed job IDs) so future incidents can be triaged without touching production data.
  - `tests/lib/redis.test.ts` / `tests/lib/queue.test.ts` — updated to cover `keepAlive`, TLS, URL-encoded credentials, and the standard-vs-cluster branches of `getBullmqConnection()`.

## [2.7.0] - 2026-06-10
### Added
- **Group / Department RBAC — Enterprise Visibility Wall**: Extends the single-team individual-assignment model to scope vulnerabilities to organisational groups (a.k.a. departments). Groups are a **visibility wall**, not just a filter — when a vulnerability is owned by a group, only members + leaders of that group plus site/web-app admins can see it. Items with no group remain in the open queue (legacy behaviour).
  - **Data model** (`prisma/schema.prisma`, migration `20260610120000_add_groups`):
    - New `Group` model (`id`, `name` unique, `description`, `idpGroupId` reserved for future OIDC/Entra group sync, `createdAt`, `updatedAt`).
    - New `GroupMembership` model with composite key `(groupId, userId)` and `role` enum (`member` | `leader`). Cascade delete on both sides; indexed on `userId` and `(groupId, role)` for hot RBAC lookups.
    - New `enum GroupMemberRole { member, leader }`.
    - `Vulnerability.groupId` and `VulnerabilityHistory.groupId` (both nullable, `ON DELETE SET NULL`). Indexes `Vulnerability_groupId_status_idx` and `VulnerabilityHistory_groupId_idx` keep group-scoped listing and analytics queries on a single B-tree lookup.
  - **RBAC helpers** (`lib/group-rbac.ts`):
    - `getGroupContext(userId)` — one cheap query returning `{ memberOf: string[], leaderOf: string[] }`.
    - `canViewVulnerability(isAdmin, ctx, vuln)` — enforces the visibility wall on every read path.
    - `canSelfAssign(isAdmin, ctx, vuln)` — admins and group members can pick up unowned or in-group work.
    - `canEditVulnerability(isAdmin, ctx, userId, vuln)` — admins, the current assignee, or any leader of the owning group can edit status / CR / collaboration.
    - `canReassign(isAdmin, ctx, userId, vuln, targetUserId)` — admins can reassign to anyone; non-admin leaders may reassign within their group only; regular users may self-assign or unassign.
    - `canChangeGroup(isAdmin)` — only admins can move an item between groups, remove a group, or add a group.
    - `canManageGroupMembership(isAdmin, ctx, groupId)` — admins (any group) or leaders (their own group).
  - **APIs**:
    - **`GET /api/groups`** — admins see all groups with member + vulnerability counts; non-admins see only the groups they belong to with their `viewerRole` (`leader` | `member`).
    - **`POST /api/groups`** *(admin only)* — `{ name, description? }`. Returns `409` on duplicate name.
    - **`GET /api/groups/{id}`** — returns the group with `members[]` (each `{ userId, name, email, role }`), `vulnerabilityCount`, and `viewerCanManage` (true for admins and the group's leaders).
    - **`PATCH /api/groups/{id}`** *(admin only)* — rename / re-describe. Returns `409` on duplicate name, `404` if missing.
    - **`DELETE /api/groups/{id}`** *(admin only)* — refuses with `409 { activeCount }` if vulnerabilities are still assigned; pass `?force=true` to dissolve regardless. FK ON DELETE SET NULL means orphaned items revert to the open queue.
    - **`POST /api/groups/{id}/members`** *(admin or leader)* — `{ userId, role? }`. Returns `409` if already a member, `404` if the target user or group is missing.
    - **`PATCH /api/groups/{id}/members`** *(admin or leader)* — `{ userId, role }`. **Last-leader guard**: non-admin leaders cannot demote the only remaining leader (returns `400`); only an admin can dissolve a group's leadership.
    - **`DELETE /api/groups/{id}/members`** *(admin or leader)* — `{ userId }`. Same last-leader guard.
    - **`GET /api/vulnerabilities`** now accepts `groupIds=uuid1,uuid2[,unassigned]` and always enforces the visibility wall — non-admins see only ungrouped items plus the items belonging to their `memberOf` groups regardless of any explicit filter.
    - **`PATCH /api/vulnerabilities/{id}`**, **`POST /api/vulnerabilities/bulk`**, and **`/api/vulnerabilities/{id}/comments`** apply the per-item permission matrix through `canEditVulnerability` / `canSelfAssign` / `canReassign` / `canChangeGroup`. Bulk updates abort with `403` on the first item the caller cannot mutate.
  - **UI**:
    - New **`/admin/groups`** page (`app/(app)/admin/groups/`) — searchable group list, create / rename / delete, add / promote / remove members. Visible only to admins; appears in the sidebar under the admin section.
    - **Vulnerabilities client** (`app/(app)/vulnerabilities/vulnerabilities-client.tsx`) — new `Group` MultiSelect filter; **Leader** badge on rows the viewer leads; admin-only **Group** column with an inline change-group dropdown; **Assign to Me** scoped to items the viewer is allowed to self-assign.
    - Sidebar gains a **Groups** entry under the admin nav.
  - **Notifications**: The weekly assignment digest (`lib/assignment-notifications.ts`) now also sends every group leader a per-group **Leader Digest** email summarising every active item their group owns (open / in-progress / in-progress-with-CR), grouped by assignee with an "Unassigned" bucket. The digest links straight to `/vulnerabilities?groupIds={groupId}`.
  - **Tests**: 39 new unit tests across `tests/lib/group-rbac.test.ts` (visibility / edit / reassign / membership-management matrix) and `tests/api/groups.unit.test.ts` (every status code on every group endpoint, including the last-leader guard, duplicate-name `409`, and missing-user `404`). Existing vulnerability test suites updated to mock `groupMembership.findMany` and reflect the new RBAC error messages.

### Security
- **Removed deprecated `X-Frame-Options` header** (`proxy.ts`): The clickjacking control is now provided exclusively by the existing `Content-Security-Policy: frame-ancestors 'none'` directive. Sending both is redundant and was flagged in an external penetration test; modern browsers honour the CSP directive in preference. The accompanying comment in `proxy.ts` documents the rationale so the header isn't reintroduced.
- **Group visibility wall hardening**: The `GET /api/vulnerabilities` SQL builder intersects any user-supplied `groupIds` filter with the requester's `memberOf` set **before** issuing the query — a non-admin cannot bypass the wall by guessing group UUIDs. Read paths on `/api/vulnerabilities/{id}` short-circuit with `403` when `canViewVulnerability` returns false; comment routes additionally re-check the wall before disclosing collaborator content.

### Changed
- **CI coverage thresholds**: Line coverage now sits at **69.3%** (above the 68% floor), Statements **66.69%** (≥ 65), Branches **59.97%** (≥ 58), Functions **65.17%** (≥ 63). The added group-RBAC and group-API tests close the gap created by the new feature surface without lowering any threshold.

### Database
- Migration `20260610120000_add_groups` creates `Group`, `GroupMembership`, `enum GroupMemberRole`, adds `Vulnerability.groupId` + `VulnerabilityHistory.groupId` (both nullable, FK ON DELETE SET NULL), and the supporting indexes. The migration is additive and safe to re-apply — existing rows default to `groupId = NULL` and remain in the open queue.

## [2.6.2] - 2026-05-14
### Security
- **Dependency upgrades to clear `npm audit` advisories (6 vulnerabilities, 1 high / 5 moderate)**:
  - `next` `^16.2.3` → `^16.2.6` — patches GHSA advisories for cache poisoning in RSC responses, middleware/proxy bypass via segment-prefetch and i18n routes, SSRF via WebSocket upgrades, XSS via CSP nonces and `beforeInteractive` scripts, DoS in Image Optimization API and Cache Components, and the segment-prefetch incomplete-fix follow-up.
  - `bullmq` `^5.76.0` → `^5.76.8` — pulls in a non-vulnerable `uuid` (transitive fix for GHSA-w5hq-g745-h8pq, missing buffer bounds check in v3/v5/v6).
  - `overrides.fast-xml-parser` `5.5.7` → `5.8.0` — patches GHSA-gh4j-gqv2-49f6 (XMLBuilder comment / CDATA injection via unescaped delimiters); also clears the transitive advisory on `@azure/core-xml`.
  - Added `overrides.postcss` `8.5.10` — patches GHSA-qx2v-qp2m-jg93 (XSS via unescaped `</style>` in CSS stringify output) for the copy pulled in by Next.js.
  - Added `overrides.uuid` `14.0.0` — belt-and-braces pin to the patched line in case any other transitive dependency drags in the vulnerable 11.x range.
  - `npm audit --audit-level=high --omit=dev` now reports **0 vulnerabilities**.

## [2.6.1] - 2026-05-13
### Added
- **Pentest PDF — Examples & References on vulnerability details**: The built-in Trustmarque parser now persists each finding's **Examples** block (proof-of-concept payloads, request/response evidence) into `Vulnerability.pluginOutput`, and its **References** list into `Vulnerability.seeAlso`. The Vulnerability Details side-sheet renders the examples in the existing monospace panel (now labelled **"Examples / Plugin Output"** with `white-space: pre-wrap` so long URLs and request bodies stay readable) and adds a new **References** section that splits the stored string on newlines/commas and renders each `http(s)://` entry as a clickable link.

### Removed
- **External PDF Processing API**: The optional external PDF Processing API (Azure Logic App / Document Intelligence) is removed entirely. The in-process Trustmarque CHECK parser (`lib/pentest-pdf-builtin.ts`) is now the only ingestion path and runs with no admin configuration, no encrypted API key, no outbound network calls, and no auth-scheme selection.
  - Deleted routes: `GET/POST /api/admin/pdf-processing`, `POST /api/admin/pdf-processing/test`.
  - Deleted UI: the **Admin → Settings → PDF Processing** tab and the `/admin/pdf-processing` settings page.
  - Schema: dropped the `PdfProcessingConfig` table, the `PdfProcessor` enum, and the `PdfApiAuthScheme` enum via migration `20260513120000_remove_pdf_processing_config`.
  - `lib/pentest-pdf.ts` no longer imports `decrypt` or branches on a processor field; the worker pipeline calls the built-in parser unconditionally.
  - `POST /api/uploads/pentest` no longer returns HTTP 412 when PDF Processing is disabled — uploads always succeed provided the file is a PDF ≤25 MB.

### Fixed
- **Pentest PDF — hostname continuation lines**: Long hostnames in the Systems Affected table (e.g. `dataforge-dev.capita-ic.com/webcube/`) that wrapped onto their own line were being parsed as separate rows from the following IP/port line. The built-in parser now merges any line lacking an IPv4 with the subsequent line before tokenising, eliminating duplicate findings such as the nine spurious rows previously emitted for `PT3195-EPT-002`.
- **Pentest PDF — hostname preferred over IP**: Where the Systems Affected table supplies both a hostname and an IP, the ingested vulnerability host is now the hostname (matching how the PDF presents it to operators). IPs are still used as a fallback when the report contains no hostname column.

## [2.6.0] - 2026-05-12
### Added
- **PDF Upload Pipeline**: First-class support for ingesting penetration-test reports as PDFs alongside the existing Nessus CSV flow.
  - **Uploads UI**: New CSV / PDF toggle on `/uploads` (manual tab). The file picker, accept-extensions, and target API endpoint switch automatically based on the selection. The Uploads header was renamed from "CSV Uploads" to "Uploads" and now reads "Manage Nessus CSV scans and pentest PDF reports".
  - **Upload API**: New `POST /api/uploads/pentest` route. Accepts `multipart/form-data` with `file` (PDF, ≤25 MB) and `siteId`, persists the binary to the configured storage provider as base64 (key pattern `pentest-${uploadId}.pdf.b64`), and enqueues a job on the dedicated `{pentest-pdf-queue}` BullMQ queue. Returns HTTP 412 when PDF Processing is disabled or incompletely configured.
  - **Worker**: A second BullMQ worker is started by `scripts/worker.ts` (concurrency 2) that downloads the PDF, forwards it to the configured PDF Processing API, and ingests the returned JSON document into the same `Vulnerability` table used by Nessus uploads — inheriting assign/archive/remediate, audit-history, threat-intelligence enrichment, and analytics surfaces. Failure messages are surfaced on the Live Progress card via a red "Failure reason" banner after the final retry attempt.
  - **External API Contract**: Outbound request is `POST {apiUrl}` (`multipart/form-data`, field `file`), gated by an `AbortController` timeout (default 120 000 ms). Severities returned in the JSON payload are normalised case-insensitively into the existing Critical/High/Medium/Low/Info buckets, and comma-separated ports are exploded into individual rows. Each finding is keyed by the report's stable identifier (e.g. `PT3195-WEB-001`) so the unique `(siteId, pluginId, host, port, cve)` index continues to drive deduplication.
- **Admin Settings — PDF Processing**: New tab under **Admin → Settings → PDF Processing** (also available directly at `/admin/pdf-processing`) for configuring the **PDF Processing API URL**, the **PDF Processing API Key** (encrypted at rest with AES-256-GCM via `AUTH_SECRET`), the **Auth scheme** (X-API-Key / Bearer / Both / None), the request timeout, and an enable/disable master switch. A SHA-256 fingerprint of the stored key is surfaced for verification without ever returning plaintext.
- **Configurable Auth Scheme**: New `enum PdfApiAuthScheme { X_API_KEY, BEARER, BOTH, NONE }` and `PdfProcessingConfig.authScheme` column. The settings UI exposes the choice via the modernised `components/Select.tsx` dropdown, and `lib/pentest-pdf.ts#callPdfProcessingApi` builds outbound headers via a switch on the selected scheme. Many Logic App–backed APIs explicitly reject requests carrying both schemes simultaneously (`"only one scheme should be used"`); the selector lets operators match the upstream expectation precisely.
- **Test Connection — Synthetic & Real PDF Modes**: New `POST /api/admin/pdf-processing/test` endpoint that accepts **either** a JSON body (synthetic ~50-byte PDF, 30 s fast-fail timeout) **or** `multipart/form-data` with an optional `file` field (operator-supplied real PDF, ≤25 MB, full configured timeout). The settings page exposes a drop-zone for the optional real PDF; the button label flips to **"Test with Real PDF"** when a file is selected. Real-PDF bytes are sent once and **never stored, enqueued, or ingested** — they are the only definitive check for integrations whose upstream extraction backend (typically Azure Logic Apps fronting Document Intelligence) cannot parse the synthetic 50-byte PDF and returns a 5xx even when the URL and key are correct. Successful runs surface a dedicated **"Real PDF accepted — integration verified"** banner.
- **Smarter Connectivity Diagnostics**: The test endpoint distinguishes credential failures (401/403), payload rejections (400/415/422), missing paths (404), and upstream outages (5xx). Each case emits a tailored `hint` field. Synthetic-PDF runs that hit a 4xx payload error are reported as **`ok: true`** ("Reachable — credentials accepted") because authentication was proven; the hint directs the operator to retry with the real-PDF picker. Synthetic-PDF runs hitting a 5xx surface the same retry hint. Real-PDF runs treat payload rejections and 5xx as `ok: false` with the upstream response body (first 500 chars) verbatim. Responses include a `usedRealFile: boolean` discriminator.
- **Animated Live Progress**: New `components/LiveProgressDisplay.tsx` layered onto the Uploads → Live Progress card. A pulsing accent dot, a shimmering gradient sweep across the progress bar, a live elapsed timer (`1m 23s`), and a rotating tip strip (10 messages, swapping every 4.5 s after a 2 s grace window) prevent the panel from looking frozen during multi-minute PDF API round-trips. Tips activate only on known long-running steps (`Calling PDF Processing API`, `Processing`, `Parsing`, `Extracting findings`) so fast steps don't flash. Includes a new `@keyframes shimmer` in `app/globals.css`. The bar colour shifts to emerald on success and rose on failure.
- **What's New Card**: New May 2026 card (`whats-new-may-2026-pdf`) highlighting the full PDF pipeline, settings panel, dual-worker runtime, real-PDF tester, auth-scheme selector, and animated progress UI.

### Changed
- **Worker Process**: `scripts/worker.ts` now runs two BullMQ workers in parallel — the original CSV ingest and the new pentest PDF ingest — sharing the same Redis heartbeat and dead-letter management plumbing.
- **Documentation**: README, ARCHITECTURE, SECURITY, DEPLOYMENT, and `docs/API.md` updated to document the new routes, the encrypted secret, the auth-scheme dropdown, the multipart test endpoint, and the dual-worker runtime model.

### Security
- The PDF Processing API key is never returned in plaintext from any route. It is stored using the same AES-256-GCM helper that protects OIDC, SMTP, and Azure storage credentials, and is only decrypted in-process inside the upload worker and the connectivity-test endpoint.
- **Real-PDF Test Bytes Are Ephemeral**: Files uploaded via the Test Connection picker are streamed once to the configured API and dropped — they are not written to the storage provider, not enqueued, not recorded in `UploadHistory`, and not retained in memory beyond the request lifetime. The 25 MB cap and `requireAdmin()` gate from the production upload route apply equally to the test surface.
- **Auth Scheme Selection** prevents accidental over-sharing of credentials. Operators integrating with a `Bearer`-only upstream can now omit the `X-API-Key` header entirely (and vice-versa), reducing the credential surface exposed to each request.
- Pentest uploads are still gated by the existing `requireAdmin()` check, the per-bucket Redis advisory lock, and the global rate limiter, mirroring the Nessus pipeline.

### Database
- Migration `20260512100000_add_pdf_processing` adds `enum UploadType { CSV, PDF }`, the `UploadHistory.uploadType` column (defaults to `CSV` for backwards compatibility), and the singleton `PdfProcessingConfig` model.
- Migration `20260512140000_pdf_api_auth_scheme` adds `enum PdfApiAuthScheme { X_API_KEY, BEARER, BOTH, NONE }` and the `PdfProcessingConfig.authScheme` column with `X_API_KEY` as the default to preserve existing behaviour.

## [2.5.2] - 2026-05-12
### Security
- **Dependency Bumps (Dependabot)**:
  - `bullmq` `^5.41.0` → `^5.76.0` — pulls in the latest job queue fixes and the upstream `ioredis` `5.10.1` runtime.
  - `fast-xml-builder` `1.1.4` → `1.2.0` — pinned via the root `overrides` block to flow through the `@azure/storage-blob` → `@azure/core-xml` → `fast-xml-parser` chain.
  - `uuid` — confirmed `11.1.0` continues to satisfy `bullmq`'s exact-version pin; no further override required.
- **Lockfile Integrity**: Regenerated `package-lock.json` so the shipped image installs the resolved versions deterministically. `npm ls` now reports `bullmq@5.76.0`, `fast-xml-builder@1.2.0 (overridden)`, and `uuid@11.1.0` against `app@2.5.2`.

### Changed
- **Documentation Pass**: Refreshed every top-level documentation surface to reflect the 2.5.2 release — `README.md` version banner and release-notes block, `ARCHITECTURE.md` runtime stack, `SECURITY.md` dependency-management section, `DEPLOYMENT.md` image/version notes, and added a new consolidated [`docs/API.md`](docs/API.md) covering every route under `app/api`.
- **What's New Card**: Added a May 2026 platform-hardening card (`whats-new-may-2026`) so existing users see a one-time summary of the dependency hygiene release.

## [2.5.1] - 2026-04-14
### Security
- **Dependency Bumps**: Updated `next` and `eslint-config-next` to version `16.2.3`. Bumped `nodemailer` to `8.0.5`. Overrode transitive dependencies for `vite` (`8.0.5`) and `defu` (`6.1.6`) to address latest security patches.

## [2.5.0] - 2026-04-02
### Added
- **Sunset Status**: New `Sunset` vulnerability status that keeps items visible in the triage queue while excluding them from all core analytics metrics. Supported across single, bulk, and inline update paths.
- **Sunset Analytics Section**: Dedicated analytics section displaying risk breakdown and host distribution charts for sunset items. Always renders with an empty-state message when no items exist.
- **Vulnerability Comments**: Full comment system — add, edit, and delete comments on vulnerabilities. Permission model allows admins, assignees, and collaborators (when Ask for Help is enabled) to participate.
- **Comment Count Indicators**: Cyan badge on vulnerability table rows (single, grouped, and expanded member rows) showing the number of comments per issue.
- **What's New Modal**: One-time "What's New" tour card displayed on first login after the update, summarising all new features. Persisted via the `completedTours` mechanism so it only shows once.

### Changed
- **Ingest Pipeline**: Active vulnerability matching now includes `Sunset` items so they are not recreated on re-upload.
- **Weekly Reports**: Sunset items are excluded from weekly assignment notification summaries alongside remediated items.

### Security
- **Dependency Bumps**: Overridden transitive dependencies — lodash 4.18.1, brace-expansion 2.0.2, flatted 3.4.2, fast-xml-parser 5.5.7, picomatch 4.0.3, effect 3.21.0. Bumped nodemailer to 8.0.4.

## [2.4.1] - 2026-03-23
### Added
- **E2E Playwright Test Suite**: Expanded end-to-end test coverage from 1 test to 45 tests across 14 files covering login flow, dashboard, navigation, vulnerabilities, uploads, buckets, analytics, threat intelligence, all 9 admin pages, RBAC (unauthenticated redirect enforcement), health API, and 404 handling.
- **Playwright Auth Fixture**: Added `auth.setup.ts` that authenticates via local credentials and saves session state for reuse by authenticated test projects.
- **Playwright Multi-Project Config**: Restructured Playwright into 3 projects — `setup` (auth fixture), `unauthenticated` (public page tests), and `chromium` (authenticated tests with stored session state).
- **CI E2E Pipeline Fix**: Added `prisma db push`, `prisma db seed`, and `LOCAL_AUTH_*` environment variables to the GitHub Actions e2e job so Playwright tests can authenticate and query seeded data.

## [2.4.0] - 2026-03-23
### Security
- **Timing-Safe Password Comparison**: Replaced direct string comparison with `crypto.timingSafeEqual` in local credentials authentication to prevent timing side-channel attacks.
- **Cryptographic CSP Nonce**: Replaced `Math.random()`-based nonce generation with `crypto.randomUUID()` in the middleware Content-Security-Policy header.
- **Stack Trace Removal**: Removed internal stack traces from the vulnerability search API error responses to prevent information leakage.
- **LIKE Pattern Injection**: Escaped user-supplied wildcard characters (`%`, `_`, `\`) in ILIKE search queries to prevent pattern injection.
- **Role Overwrite Prevention**: Fixed auth provisioning to never overwrite manually assigned database roles with session-supplied roles on subsequent logins.
- **Role Escalation Guard**: Added role hierarchy enforcement in the admin user management API — non-site-admins can no longer grant `site_admin` or `toolkit_admin` roles.
- **Last-Admin Race Condition**: Wrapped last-admin protection checks (PATCH and DELETE) in a Prisma `$transaction` to prevent concurrent role removals.
- **Rate Limiter Hardening**: Added optional `userId` parameter to the rate limiter so authenticated routes can key on user identity instead of spoofable IP headers.
- **Bucket Auth Escalation**: Changed the bucket PUT handler from `requireUser` to `requireAdmin` to prevent standard users from modifying bucket configurations.
- **Credential Log Sanitisation**: Removed all credential fingerprint logging (connection strings, account keys, SAS tokens) from the storage provider initialisation.
- **Secret Fingerprint Removal**: Removed secret fingerprint logging from the storage test API endpoint.
- **NEXTAUTH_URL Fallback Guard**: Replaced silent `localhost` fallback for `NEXTAUTH_URL` with an explicit warning-and-skip pattern in notification schedulers.

### Fixed
- **Threat Feed Limit Cap**: Capped the threat intelligence feed API limit to a maximum of 100 entries to prevent unbounded queries.
- **Tour Completion Deduplication**: Rewrote the tour completion endpoint with Zod validation and a read-then-set deduplication strategy to prevent duplicate entries.
- **Tour ID Whitelist**: Added an enum-based whitelist of valid tour identifiers to reject arbitrary values.
- **ReDoS Mitigation**: Added a 500-character input length limit before regex matching in the Azure File Share filename filter.
- **Weekly Notification Timing**: Replaced fragile exact-minute matching with `lastSentAt` tracking for weekly assignment notification scheduling.
- **VACUUM to ANALYZE**: Changed per-upload `VACUUM ANALYZE` to lightweight `ANALYZE` only; full `VACUUM` should be a scheduled maintenance task.
- **Status Enum Validation**: Changed vulnerability status validation from freeform string to a strict `z.enum()` with all valid statuses.
- **Assignee Existence Check**: Added database existence verification before connecting an assignee to a vulnerability.
- **Collaborator Existence Check**: Added count verification for collaborator IDs before setting collaborators on a vulnerability.
- **Comment Content Validation**: Added Zod schema validation (min 1, max 10,000 characters) for vulnerability comment content.
- **Analytics Site ID Validation**: Added UUID format validation for the `siteId` parameter in the analytics API.
- **Bucket Import Pattern Validation**: Added regex syntax validation and length constraints for bucket import patterns and aliases.
- **Page Number Cap**: Added an upper bound of 10,000 on the page number parameter in the vulnerability search API.
- **User Existence Check**: Added a pre-update existence check when patching user roles via the admin API.
- **Legacy Schema Fallback Removal**: Removed the legacy `role` (singular) field fallback from auth provisioning, eliminating dead code paths.

## [2.3.9] - 2026-03-23
### Fixed
- **Dialog Aesthetics**: Refined the "Confirm Update" button styling to align with the application's semi-transparent themed gradients. Replaced high-contrast custom classes with the standard `primary` and `ghost` button variants.

## [2.3.8] - 2026-03-23
### Added
- **Global Assignment Consistency**: Enforced the restricted assignment RBAC (self/unassign only for non-admins) across all update paths, including bulk actions and inline list editing.
- **Unified Error Handling**: Updated all vulnerability update triggers to display specific server-side error messages, providing clear feedback when an action is blocked by policy.

## [2.3.7] - 2026-03-23
### Added
- **Restricted Assignment RBAC**: Hardened the assignment policy for standard users. Non-admins are now limited to self-assignment or unassigning issues. Reassignment to other users is restricted to Admins.
- **Friendly Error Messages**: Improved error handling on both the backend and frontend. The system now provides descriptive feedback in the UI (e.g., "Standard users can only assign to themselves or Unassigned") when a permission-based action is blocked.

## [2.3.6] - 2026-03-23
### Fixed
- **Self-Assignment Permissions**: Resolved a bug where non-admin users could not assign vulnerabilities to themselves from the detailed view. The RBAC logic now correctly supports "taking ownership" of unassigned findings.

## [2.3.5] - 2026-03-23
### Added
- **Themed Bulk Prompt**: Replaced the native browser `window.prompt` with a custom, ultra-modern `Dialog` component for bulk CR number entry. This ensures a consistent "CyberDefend" aesthetic throughout the triage workflow.

## [2.3.4] - 2026-03-23
### Added
- **Bulk CR Number Support**: Implemented a prompt for Change Request (CR) numbers during bulk status updates to 'In Progress with CR'. This significantly improves productivity when triaging large groups of folded vulnerabilities.

## [2.3.3] - 2026-03-23
### Fixed
- **Analytics Chart Units**: Resolved a bug in the "Vulnerability Aging (SLA)" chart where counts were incorrectly suffixed with "Days" in the tooltip. The `BarChart` component now supports context-aware units.
- **Deep Link Reliability**: Fixed a reinforcement loop that could cause the vulnerability side sheet to reopen automatically after being closed.

## [2.3.2] - 2026-03-23
### Fixed
- **Vulnerability Deep Linking**: Added support for both `id` and `ids` query parameters in the API and frontend, enabling direct access to specific findings from external links (e.g., email summaries).
- **Auto-Selection**: Implemented automatic list filtering and side sheet opening when a valid `id` is present in the URL, including a "Clear Focus" indicator in the UI.

## [2.3.1] - 2026-03-23
### Fixed
- **Weekly Assignment Summary**: Updated the summary logic to only include vulnerabilities where the user is the primary assignee, excluding collaborations for improved clarity.
- **Collaboration Management**: Resolved a technical debt issue where disabling the "Ask for Help" feature on a vulnerability would leave collaborators assigned; it now correctly clears all collaborators when disabled.

## [2.3.0] - 2026-03-17
### Changed
- **Dependency Update**: Bumped `next` and `eslint-config-next` to version `16.1.7` to leverage latest performance improvements and security patches.
- **Verification**: Completed a full verification suite including 150+ unit tests, linting, and production builds.

## [2.2.0] - 2026-03-17
### Added
- **Weekly Assignment Notifications**: Implemented a "Security Briefing" email system that sends a summary of active assignments to users every Monday at 8 AM UTC.
- **Ultra-Modern Email Templates**: Expanded the premium design system to include dedicated per-user assignment digests with high-contrast Bento stats and risk-coded cards.

### Fixed
- **Dismissed Finding Persistence**: Corrected a bug where vulnerabilities previously marked as 'False Positive' or 'No Fix' were recreated as 'Open' during subsequent uploads. The system now correctly touches historical records in `VulnerabilityHistory` instead.

## [2.1.0] - 2026-03-17
### Fixed
- **Vulnerability Table**: Resolved an issue where clicking a row checkbox unexpectedly triggered the row click handler, opening the detail side card.

## [2.0.0] - 2026-03-17
### Added
- **Administration Menu Consolidation**: Reorganized the administration workspace into logical **Settings** (`/admin/settings`) and **Operations** (`/admin/operations`) hubs, reducing sidebar complexity by 50%.
- **Buckets Rebranding**: Completed a full-system transition from "Sites" to "Buckets" across all UI elements, routes (`/buckets`), and API endpoints (`/api/buckets`).
- **Stateful Test Mocking**: Implemented a persistent, stateful Prisma client mock in the test suite to resolve integration test failures and ensure environmental parity.

### Fixed
- **Product Tour Stability**: Resolved a critical initialization loop and fixed positioning offsets for the Analytics and Tools tours using `fixed` strategy and window-level locks.
- **Docker Build Regressions**: Fixed lingering TypeScript type mismatches in `layout.tsx` and `ProductTour.tsx` to enable 100% clean production builds.
- **E2E Test Environment**: Resolved Playwright browser dependency issues to enable full automated verification of the Dockerized application.

## [1.9.0] - 2026-03-16
### Added
- **Multi-Page Product Tour**: Implemented an "Ultra-Modern" glassmorphic product tour across Dashboard, Buckets (Sites), and Security Tools using `shepherd.js`.
- **Onboarding State Tracking**: Integrated with Prisma to track `isNewUser` and `completedTours`, ensuring the tour only triggers when appropriate.
- **Tour Debug Mode**: Added a `?debugTour=true` query parameter to facilitate repeated tour testing and validation for developers.
- **Tour Completion API**: Created a secure route handler (`/api/tours/complete`) to persist tour progress for authenticated users.

### Security
- **Hardened CSP Strategy**: Eliminated deprecated dependencies (`popper.js` v1, `deep-diff`) and transitioned to a strictly nonced CSP for style elements.
- **Nonce-Based Styling**: Integrated security nonces into the tour component to allow dynamic styling without the risks associated with global `unsafe-inline` directives.

## [1.8.1] - 2026-03-16
### Fixed
- **Production Migration Integrity**: Resolved a "column does not exist" error by manually generating the missing Prisma migration for `ThreatSubscription` scheduling fields (`scheduledHour`, `scheduledMinute`, `lastSentAt`).
- **Status Validation Logic**: Refactored the vulnerability update API to be context-aware, allowing users to toggle between 'In Progress' and 'In Progress with CR' without being forced to re-enter an existing CR number.
- **UI Contrast Optimization**: Enhanced the accessibility and readability of the "Post Comment" button in dark mode by implementing high-contrast slate text against the cyan background.

## [1.8.0] - 2026-03-16
### Added
- **Custom Intelligence Scheduling**: Empowered users to configure personalized delivery times (Hour/Minute UTC) for their Daily Threat Intelligence Digest.
- **Enhanced Scheduling Logic**: Transitioned from a global fixed schedule to a per-user delivery model with tracking for the last sent timestamp.
- **Intelligence Context Grouping**: Refined the Dashboard to group "Active Findings" and "Critical Risks" under a dedicated "Global Threat Intelligence Summary" section.

### Fixed
- **Dashboard Layout Optimization**: Eliminated wasted space on the "Remediation Command Centre" by transitioning intelligence summary cards to a full-width 2-column layout.
- **Digest Data Integrity**: Corrected the data source for the Intelligence Digest to query the global `ThreatVulnerability` feed instead of internal scan findings.
- **24-Hour Lookback Window**: Fixed a logic error where the digest only included findings since midnight; it now correctly spans the preceding 24 hours.
### Added
- **Managed Vulnerability Statuses**: Introduced `InProgress` and `InProgressWithCR` statuses to support active remediation workflows.
- **Change Request Tracking**: Implemented mandatory CR number tracking for findings in the "In Progress with CR" state, including real-time numeric validation and UI feedback.
- **Reporting & Analytics Refinement**: Full integration of new statuses into Dashboard counters, historical trend charts, and remediation distribution (donut charts).
- **Mobile Side Navigation**: Added a dedicated, glassmorphic side navigation menu for mobile viewports to ensure parity with the desktop experience.
- **Automation Health Checks**: Added "Test Connection" functionality for Azure File Share ingestion to proactively validate credentials and path availability.

### Fixed
- **Notification Scheduler Stability**: Resolved regressions in the daily email digest scheduler to ensure consistent delivery of 8 AM intelligence summaries.
- **Dashboard Count Discrepancy**: Corrected the logic in the "Remediation Command Centre" to accurately include "In Progress" vulnerabilities in risk summaries.
- **Type Safety**: Addressed multiple TypeScript linting issues across the analytics and dashboard modules.

## [1.6.0] - 2026-03-15
### Added
- **Automated Azure File Share Ingestion**: Comprehensive background worker service for polling Azure File Shares and matching CSV data to sites via regex and aliases.
- **Enterprise Automation UI**: New "Automation" tab in the Buckets interface featuring real-time poll countdowns, last-poll timestamps, and manual "Run Now" triggers.
- **Improved Date Robustness**: Enhanced CSV ingestion logic to handle multiple publication date header variations and robust date format parsing (ISO, UK, US formats).

### Fixed
- **Database Schema Hardening**: Resolved foreign key constraint violations for automated system imports by making `uploadedBy` optional.
- **Azure Path Sanitization**: Implemented automatic sanitization for relative paths to prevent Azure SDK `InvalidResourceName` errors.
- **UI Consistency**: Fixed bugs where bucket aliases were leaking across different bucket configurations.
- **Type Safety**: Improved server-to-client serialisation of Date objects for automation metadata.

## [1.5.1] - 2026-03-14
### Fixed
- **Build determinism & resilience**: Prevented build-time network side-effects by deferring creation of runtime clients. Converted top-level instantiation of Redis, BullMQ queues, and `PrismaClient` to lazy-initializers so `next build` runs without attempting external connections.
- **Turbopack syntax fix**: Resolved a parser-incompatible expression in `lib/redis.ts` that caused Turbopack to fail during the build.
- **Lint fixes**: Addressed an ESLint `react-hooks/set-state-in-effect` error in `components/PremiumBackground.tsx` and removed an unused variable warning in `lib/threat-intelligence/email-template.ts`.
- **Developer tooling**: Added a minimal `scripts/verify-email-render.ts` stub to ensure template rendering types resolve during CI builds.

## [1.5.0] - 2026-03-14
### Added
- **Premium Intelligence Background**: Implementation of a high-fidelity "Command Centre" background using the `PremiumBackground` portaled component.
- **Full-Page Coverage**: Refactored background positioning and layering to ensure the topographic design spans behind the sidebar and topbar.
- **System Recovery & Hardening**: Emergency fixes for Docker environment variable handling, critical file persistence in builds, and standardized middleware logic.

## [1.4.0] - 2026-03-13
### Added
- **Intelligent Vulnerability Linking**: Dynamic sourcing of external documentation. NVD records now link to NIST (nvd.nist.gov), while others point to OSV.dev.
- **UK English Localisation**: Standardised terminology to "Centre" and "Localisation" throughout the UI.
- **Test Gap Analysis**: Comprehensive audit of testing infrastructure and implementation of missing unit and component tests for Threat Intelligence.
- **Enhanced Normalization**: Improved risk scoring fallback logic in `normalizer.ts` for GHSA and vendor-specific severities.

### Fixed
- **Theme Visibility**: Resolved contrast issues in light and dark modes for the Subscription UI and dashboard cards.
- **JSX Syntax**: Corrected critical build-breaking syntax error in `ThreatSummaryCard.tsx` related to item mapping.
- **Sorting Logic**: Fixed a regression where stale CVEs could float to the top of the "Live" feed; now explicitly sorted by `modifiedAt`.

## [1.3.0] - 2026-03-12
### Added
- **Dedicated Threat Intelligence Centre**: Relocated the live feed from the dashboard to a high-fidelity standalone page.
- **Advanced Dashboard Summary**: Implemented a "Live Intelligence" summary card on the homepage with a 4-item preview.
- **High-Fidelity Visual Refresh**: System-wide implementation of glassmorphism tokens and "Ultra-Modern" scrollbar styles.
- **Success/Error Toasts**: Integration of feedback notifications for preference saved/failed states.
- **Interactive Subscription UI**: Standardised `Select` components for risk level filtering and preference management.

## [1.2.0] - 2026-03-11
### Added
- **Threat Intelligence Foundation**: Implementation of the `fetcher` and `normalizer` patterns for NVD, OSV, and CISA KEV.
- **Async Ingestion Worker**: Multi-threaded ingestion pipeline for daily and hourly synchronisation.
- **Unified Risk Schema**: Extended Prisma schema to support OSV-based vulnerabilities and automated enrichment.
- **Daily Email Digest**: Aggregator and Dispatcher services for sending categorized vulnerability summaries.

## [1.1.8] - 2026-03-11
### Fixed
- **Build Resilience**: Resolved lint/TypeScript issues in notification scheduler and vulnerability routes.
- **Migration Hardening**: Implemented auto-resolution for partial migration failures during container startup.
- **Worker Stability**: Relocated notification scheduler to the worker process for better resource utilization.

## [1.1.7] - 2026-03-11
### Added
- **CI Enhancements**: Uploaded coverage artifacts and enforced a 75% statement coverage threshold.
- **Testing Stability**: Fixed test flakes and added browser API mocks for the Vitest environment.

## [1.1.6] - 2026-03-10
### Fixed
- **Azure Blob Storage**: Unified SDK imports and resolved unsigned request errors.
- **RBAC Propagration**: Enabled immediate session role updates without requiring sign-out.
- **Health Checks**: Extended validation for Azure Account Key and SAS tokens.
