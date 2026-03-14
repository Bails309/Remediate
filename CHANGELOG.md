# Changelog

All notable changes to this project are documented in this file.

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
