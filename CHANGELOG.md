# Changelog

All notable changes to this project are documented in this file. The project follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`) and the [Keep a Changelog](https://keepachangelog.com/) conventions.

> **Sections used**: `Added`, `Changed`, `Fixed`, `Security`, `Removed`, `Deprecated`. Dates are ISO-8601 (`YYYY-MM-DD`). Version numbers correspond to the value in `package.json` and the `APP_VERSION` build argument surfaced on `/admin/health`.

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
