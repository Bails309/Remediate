# Architecture Overview

A high-level view of Remediate components and interactions.

![Architecture diagram](docs/images/architecture-diagram.svg)

## Core Components
- **`app` (Next.js)**: User-facing web UI and API routes. Exposes endpoints for admin management and vulnerability ingestion. Runs on port 3000.
- **`worker` (BullMQ)**: Background job processor that handles:
    - Nessus upload parsing and diffing.
    - **Threat Intelligence Sync**: Hourly delta and daily full syncs from NVD, OSV, and CISA KEV.
    - **Notification Dispatcher**: Daily 08:00 AM email digests based on user-defined risk filters.
- **Threat Intelligence Centre (Frontend)**: Real-time vulnerability feed with source-aware external linking.
- **Unified Risk Schema (Prisma)**: Relational datastore for Nessus findings, global threats, and user-specific intelligence subscriptions.
- **Redis**: Job coordination via BullMQ, worker heartbeats, and temporary upload cache.
- **Azure Blob Storage (Optional)**: Persistent storage for upload payloads as an alternative to Redis (recommended for production clusters).

## Data Flow
1. **Ingestion**: User uploads Nessus CSV. The API saves the payload to Redis (2-hour TTL) and enqueues a BullMQ job.
2. **Processing**: The `worker` dequeues the job, parses the CSV, filters results based on grace periods, and diffs against existing vulnerabilities.
3. **Persistence**: Current findings are written to the `Vulnerability` table, and remediated items are archived to `VulnerabilityHistory`.
4. **Intelligence Aggregation**: Global threats are fetched, normalized via fallbacks (NVD Crisis logic), and stored with enrichment (CVSS/CISA KEV).
5. **Notification**: The dispatcher matches new threats against user preferences (Risk level/CISA status) and sends scheduled email digests.
6. **Analytics**: The UI queries aggregates to render dashboard metrics and the live intelligence feed.

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
- **Threat Intelligence**: `lib/threat-intelligence/`, `app/api/threat-intelligence/`, `app/(app)/threat-intelligence/`
- **Background Workers**: `lib/ingest.ts`, `lib/queue.ts`, `lib/threat-intelligence/worker.ts`
- **DB Schema**: `prisma/schema.prisma`
- **Pentest Service**: `pentest-backend/`
