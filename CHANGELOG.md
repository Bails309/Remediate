# Changelog

All notable changes to this project are documented in this file.

## [1.1.7] - 2026-03-11
- Added focused unit tests to improve coverage for `tools-client` and `users-client`.
- Updated CI workflow to upload coverage artifacts and enforce a statements coverage threshold.
- Fixed multiple test flakes and added mocks for browser APIs in the test environment.
- Removed temporary analysis artifacts (TEST_GAP_ANALYSIS.md).
- Bumped package version to `1.1.7`.

## [1.1.8] - 2026-03-11
- Fixed lint and TypeScript issues discovered during build (notification scheduler, vulnerabilities route).
- Hardened migration startup (auto-resolve partial migration failures) to allow container startup while reconciling DB state.
- Started the notification scheduler in the worker process and added stronger typing for notification records.
- Minor test and CI maintenance.

## [1.1.6] - previous
- Prior release notes.
