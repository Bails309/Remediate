# Changelog

All notable changes to this project are documented in this file. The project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) and the [Keep a Changelog](https://keepachangelog.com/) conventions.

> **Sections used**: `Added`, `Changed`, `Fixed`, `Security`, `Removed`, `Deprecated`. Dates are ISO-8601 (`YYYY-MM-DD`). Version numbers correspond to the value in `package.json` and the `APP_VERSION` build argument surfaced on `/admin/health`.

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
