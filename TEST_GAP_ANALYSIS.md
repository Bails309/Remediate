# Test Gap Analysis

Summary of missing or weak test coverage identified in the repository (updated):

Current baseline (after added tests):
- Overall coverage: ~74% lines (Vitest v8 report).
- Library coverage: ~81% lines.

Key low-coverage areas (prioritized):
- High priority:
  - `lib/ingest.ts` — large code paths (parsing, redis interactions, file handling). Many branches untested; add unit tests that mock Redis and network I/O.
  - `app/(app)/uploads` client and server handlers — heavy UI logic and server routes have many untested branches.
  - `app/api/admin/users/route.ts` — low coverage on admin API error handling and auth edge cases.

- Medium priority:
  - `lib/queue.ts` — remaining branch coverage for error and retry flows; add tests that simulate BullMQ job removal and failures.
  - `lib/redis.ts` — TLS and cluster branches covered by recent tests, but some branches (detailed error paths) still untested.

- Lower priority:
  - End-to-end Playwright tests: keep running in CI; consider adding stable API mocks to make them less fragile.

Work completed in this pass:
1. Added unit tests: `tests/lib/csv.test.ts`, `tests/lib/pentest.test.ts`, `tests/lib/queue.test.ts`, `tests/lib/rbac.test.ts`, `tests/lib/storage.test.ts`, `tests/lib/storage.azure.test.ts`, and `tests/lib/redis.modes.test.ts`.
2. Re-ran the full test suite in Docker; all tests pass locally inside the `remediate-app-1` container.
3. Improved overall coverage from ~66% to ~74% (line coverage ~74.8%).

Recommended next steps to reach ~90%+ incrementally:
1. Add focused unit tests for `lib/ingest.ts` to cover parsing, error handling, and Redis interactions. Mock `@/lib/redis` and file/network operations.
2. Add server-route unit tests for `app/api/admin/users/route.ts` and other low-coverage API routes by mocking `prisma` and auth (`@/auth`) and testing success/error branches.
3. Add a small suite of additional unit tests for `app/(app)/uploads` UI logic (extract pure functions where possible) and for `lib/queue.ts` error flows.
4. Add a CI step to publish coverage artifacts (HTML/cobertura) and upload to Codecov or similar; optionally enforce a minimum coverage threshold (start low, e.g., 70%, then raise).

Quick wins to prioritize (in order):
1. `lib/ingest.ts` unit tests — likely yields the biggest single coverage increase.
2. `app/api/admin/users/route.ts` — improves backend route coverage.
3. Additional `lib/queue.ts` and `lib/redis.ts` branch tests.

Commands to reproduce locally (inside container):
```bash
npx vitest run --coverage
npx vitest run tests/lib/ingest.test.ts --coverage
```

If you want, I can start with `lib/ingest.ts` tests next (mock Redis/prisma, cover parse and error branches) and then update CI to publish coverage. Which should I tackle first?
