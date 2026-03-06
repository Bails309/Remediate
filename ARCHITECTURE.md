# Architecture Overview

High-level components:

- `app` (Next.js): user-facing web UI and API routes. Runs on port 3000.
- `worker`: background job processor that consumes upload payloads from Redis.
- `PostgreSQL` (Prisma): primary relational datastore for sites, vulnerabilities, history, uploads.
- `Redis`: short-lived payload storage and queue coordination.

Data flow (simplified):

1. User uploads Nessus CSV via the UI/API.
2. API saves the file payload to Redis and enqueues a job.
3. `worker` dequeues, processes the payload, writes current rows to `Vulnerability` and historical rows to `VulnerabilityHistory` as needed.
4. `app` queries aggregates (directly or via `VulnerabilityView`) to render analytics.

Scalability and resiliency:
- Stateless `app` and `worker` images can be scaled horizontally; `worker` concurrency is limited by Redis queue and DB load.
- Use advisory-lock protected migrations to avoid races during scale-out.
- Use managed Postgres and Redis (Azure Database for PostgreSQL, Azure Redis Cache) for production reliability.

Observability:
- Application logs (container stdout) for startup/migration output and worker job traces.
- Integrate a centralized log/metric system (Azure Monitor / Log Analytics) in production.

Key files and locations:
- UI and routes: `app/`
- Background logic: `scripts/worker.ts`, `lib/ingest.ts`, `lib/queue.ts`
- DB schema: `prisma/schema.prisma`
- Analytics helpers: `lib/report-analytics.ts`
