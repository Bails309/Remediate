# Remediate
Direct, Serious, Zero Fluff

## Overview
Remediate is a Nessus remediation triage app built with Next.js, Prisma, PostgreSQL, and Redis. It ingests Nessus CSVs, diffs weekly uploads, tracks remediation status, and supports assignment workflows.

## Prerequisites
- Docker Desktop (for local development)

## Local Development (Docker)
1. Copy env file:
   ```bash
  # Windows (PowerShell)
  copy .env.example .env

  # macOS / Linux
  cp .env.example .env
   ```
2. Start services:
   ```bash
  docker compose up -d --build
   ```
3. Open http://localhost:3000
4. Apply Prisma schema:
  ```bash
  # Alternatively run migrations from the host
  npx prisma migrate dev

  # Or inside a container (Windows example)
  docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:push
  ```
5. Optional seed data:
  ```bash
  docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:seed
  ```

## Seed Data
Seed an admin user and a sample site:
```bash
docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:seed
```

## Prisma
- Generate client:
  ```bash
  docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run prisma -- generate
  ```
- Apply schema to local DB:
  ```bash
  docker run --rm -v "%cd%:/app" -w /app node:lts-slim npm run db:push
  ```

## Environment Variables
See .env.example for all required values. Minimum local dev values:
- DATABASE_URL
- REDIS_URL
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- AUTH_SECRET
- ADMIN_EMAIL

AUTH_SECRET is used to encrypt OIDC config stored in Postgres.

External DB/Redis support:
- Set DATABASE_URL and REDIS_URL to your external services.
- The app does not depend on container-local storage for either service.

Docker compose overrides DATABASE_URL and REDIS_URL to use the db/redis service names.

## Upload Processing
- Uploads are queued in Redis and processed by the `worker` service.
- The API stores CSV payloads in Redis temporarily (2-hour TTL) for the worker to consume.
- Failed uploads retry up to 3 times with exponential backoff before landing in a dead-letter queue.
- Admins can requeue failed uploads from /admin/dead-letter.

## Weekly Reports
- Configure SMTP and schedule weekly critical/high summaries in /admin/reports.
- Report settings are stored encrypted in Postgres using AUTH_SECRET.

## Migrations
On container startup the `app` and `worker` entrypoints run `prisma migrate deploy` inside `scripts/migrate.js`.

Key points:
- `scripts/migrate.js` waits for the database to be reachable, then acquires a Postgres advisory lock before running `npx prisma migrate deploy`. This ensures only one instance applies migrations at a time.
- The repository also includes a guarded `scripts/optimize-db.ts` script that applie(s) optional database optimizations (indexes, views, VACUUM). The app startup command runs this after migrations when appropriate.
- A CI workflow (.github/workflows/migrations.yml) is provided to run migrations + DB optimizations as part of your deploy pipeline — recommended for production.

Recommended patterns:
- CI-driven: run `npx prisma migrate deploy` in your CI before updating production containers (strongly recommended for Azure Container Apps).
- Runtime fallback: keep `scripts/migrate.js` as a startup fallback — advisory lock prevents concurrent runs but CI-first is preferred to avoid runtime surprises.

To run migrations locally:
```bash
# Run migrations (development)
npx prisma migrate dev

# Run migrations (deploy-style)
npx prisma migrate deploy
```

## Authentication
- Keycloak OIDC is configured via .env or the Admin UI.
- If you prefer UI configuration, set the values in the Admin page and redeploy or restart to pick them up.

## Deployment (Azure Container Apps)
High-level steps:
1. Build and push image to ACR (or another registry).
2. Provision Azure Database for PostgreSQL and Azure Cache for Redis.
3. Create an Azure Container Apps environment and app.
4. Configure app secrets and environment variables in ACA.
5. Enable ingress, set the container port to 3000, and deploy.

Recommended ACA settings:
- Min replicas: 0, Max replicas: 3+
- Scale on HTTP concurrency
- Use managed identities for Azure resources where possible

Migration recommendation for ACA:
- Use a CI-driven migration step or an Azure Container Apps Job to run:
  - `npx prisma migrate deploy`
  - `npx tsx scripts/optimize-db.ts`
- Keep the runtime `scripts/migrate.js` as a safe fallback — it uses an advisory lock so multiple replicas won't race.

CI example: see `.github/workflows/migrations.yml` which runs migrations and DB optimizations on push to `main`.

## Repo Structure
- app/: Next.js app router
- prisma/: Prisma schema
- Dockerfile: Multi-stage container build
- docker-compose.yml: Local dev stack (app, Postgres, Redis)
