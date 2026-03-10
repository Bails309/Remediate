# Architecture Overview

A high-level view of Remediate components and interactions.

![Architecture diagram](docs/images/architecture-diagram.svg)

## Core Components
- **`app` (Next.js)**: User-facing web UI and API routes. Exposes endpoints for admin management and vulnerability ingestion. Runs on port 3000.
- **`worker` (BullMQ)**: Background job processor that consumes upload payloads from Redis and handles periodic maintenance (VACUUM, retention).
- **`pentest-backend` (Node/Express)**: Isolated toolkit service that executes curated pentest binaries (Nmap, Nuclei, etc.). Accessed via signed JWTs from the main app.
- **PostgreSQL (Prisma)**: Primary relational datastore for sites, vulnerabilities, scan history, and tool execution logs.
- **Redis**: Short-lived payload storage, queue coordination via BullMQ, and worker heartbeats.

## Data Flow
1. **Ingestion**: User uploads Nessus CSV. The API saves the payload to Redis (2-hour TTL) and enqueues a BullMQ job.
2. **Processing**: The `worker` dequeues the job, parses the CSV, filters results based on grace periods, and diffs against existing vulnerabilities.
3. **Persistence**: Current findings are written to the `Vulnerability` table, and remediated items are archived to `VulnerabilityHistory`.
4. **Analytics**: The UI queries aggregates (directly or via views) to render dashboard metrics.

## Scalability & Resiliency
- Stateless `app` and `worker` images support horizontal scaling.
- Advisory-lock protected migrations (`scripts/migrate.js`) prevent race conditions during cluster startup.
- Use managed Postgres and Redis (e.g., Azure Database for PostgreSQL, Azure Redis Cache) for production reliability.
- **Redis Cluster Support**: Uses Redis Hash Tags (`{bull}`) to ensure cross-slot compatibility in clustered environments.

## Security
- **RBAC**: Enforced at the API level for sensitive admin and pentest tool routes.
- **Inter-service Auth**: Communication with the pentest backend is secured with short-lived, signed JWTs using `AUTH_SECRET`.
- **Encryption**: OIDC and SMTP configuration secrets are stored encrypted in Postgres.

## Key File Locations
- **UI & API Routes**: `app/`
- **Background Logic**: `lib/ingest.ts`, `lib/queue.ts`, `scripts/worker.ts`
- **DB Schema**: `prisma/schema.prisma`
- **Pentest Service**: `pentest-backend/`
