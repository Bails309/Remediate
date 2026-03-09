# Architecture Overview

A high-level view of Remediate components and interactions.

![Architecture diagram](images/architecture-diagram.svg)

The diagram above shows the main runtime components and their primary interactions.

Key components
- Next.js `app/` — server + client renderer. Exposes API routes used by admin pages and vulnerability ingestion.
- Postgres — persistent store managed via Prisma.
- Redis — queue and ephemeral storage for uploads/progress.
- Worker — background job processor that consumes Redis queues and writes results to Postgres.
- Pentest backend — isolated service that runs curated pentest tools; accessed only from the app or worker.

Deployment patterns
- Local: Docker Compose (single network, internal services)
- Production: ACA (front-end) + managed Postgres + Redis + optional pentest service in separate environment (recommended)

Security
- Keep `AUTH_SECRET` and `NEXTAUTH_SECRET` private.
- Restrict access to pentest backend; it executes binaries — treat it as a high-risk component.

