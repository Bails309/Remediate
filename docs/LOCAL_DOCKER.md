# Local Docker Compose

This project ships with `docker-compose.yml` for local development. It defines the web `app`, `db` (Postgres), `redis`, `worker`, and `pentest-backend` services.

Prerequisites
- Docker Desktop
- Copy `.env.example` → `.env` and populate values

Start locally
```bash
# Build and start containers
docker compose up -d --build

# Follow logs for the app
docker compose logs -f app
```

Notes
- The app expects `DATABASE_URL` and `REDIS_URL` to point to the services in the compose environment (the default `.env.example` uses `db` and `redis` hostnames).
- If you want to expose the pentest backend to the host for testing, modify `docker-compose.yml` to add a port mapping for `pentest-backend` and set `PENTEST_BACKEND_URL=http://localhost:8000` in `.env`.

Database migrations
- Run migrations from host or container:

```bash
# From host (requires pnpm/npm installed):
npx prisma migrate dev

# From inside the app container:
docker compose exec app sh -c 'npx prisma migrate deploy'
```

Seeding data
```bash
# From host
npx prisma db seed

# or via container script
docker compose exec app sh -c 'node prisma/seed.js'
```
