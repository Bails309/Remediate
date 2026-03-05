# Remediate
Direct, Serious, Zero Fluff

## Overview
Remediate is a Nessus remediation triage app built with Next.js, Prisma, PostgreSQL, and Redis. It ingests Nessus CSVs, diffs weekly uploads, tracks remediation status, and supports assignment workflows.

## Prerequisites
- Docker Desktop (for local development)

## Local Development (Docker)
1. Copy env file:
   ```bash
   copy .env.example .env
   ```
2. Start services:
   ```bash
   docker compose up --build
   ```
3. Open http://localhost:3000
4. Apply Prisma schema:
  ```bash
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
- On container startup, the app runs `prisma migrate deploy` under a Postgres advisory lock.
- This prevents multiple instances from racing when scaled in Azure.

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

## Repo Structure
- app/: Next.js app router
- prisma/: Prisma schema
- Dockerfile: Multi-stage container build
- docker-compose.yml: Local dev stack (app, Postgres, Redis)
