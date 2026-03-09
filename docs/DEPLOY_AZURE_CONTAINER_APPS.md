# Deploying Remediate to Azure Container Apps (ACA)

This guide covers a simple CI/manual flow for deploying the `app` service to Azure Container Apps and wiring it to an Azure Database for PostgreSQL and Azure Cache for Redis.

Prerequisites
- Azure CLI (login: `az login`)
- An Azure subscription with permissions to create resources
- Docker (to build images) and access to a container registry (Azure Container Registry used below)

Overview
1. Create a resource group and ACR
2. Build and push the container image
3. Provision managed data services (Postgres, Redis)
4. Create an ACA environment and the container app
5. Configure secrets and env vars

These instructions use `az` and assume `jq` is available for simple JSON parsing.

1) Create RG and ACR
```bash
az group create -n remediate-rg -l eastus
az acr create -n remediateacr -g remediate-rg --sku Basic
az acr login -n remediateacr
```

2) Build & push image
```bash
# Tag name
IMAGE_NAME=remediateacr.azurecr.io/remediate-app:latest
# Build and push
docker build -t $IMAGE_NAME -f Dockerfile .
docker push $IMAGE_NAME
```

3) Provision Postgres + Redis (managed)
- Use Azure Database for PostgreSQL Flexible Server and Azure Cache for Redis.

Example (quick start, not hardened):
```bash
# Postgres
az postgres flexible-server create -g remediate-rg -n remediate-pg --sku-name Standard_B1ms --storage-size 32 -l eastus --admin-user pgadmin --admin-password "P@ssword123!"
PG_CONN="postgresql://pgadmin:P@ssword123!@remediate-pg.postgres.database.azure.com:5432/remediate?sslmode=require"

# Redis
az redis create -n remediate-redis -g remediate-rg --sku Basic --vm-size c0 -l eastus
REDIS_CONN="rediss://:YOUR_REDIS_PRIMARY_KEY@remediate-redis.redis.cache.windows.net:6380"
```

4) Create ACA environment
```bash
# Create container apps environment
az containerapp env create -g remediate-rg -n remediate-env -l eastus
```

5) Configure secrets and create container app
Provide the following minimum environment variables to the ACA app (store as secrets when possible):
- DATABASE_URL (Postgres connection string)
- REDIS_URL (Redis connection string)
- NEXTAUTH_URL (https://your-domain)
- NEXTAUTH_SECRET (strong random value)
- AUTH_SECRET (used by app to encrypt OIDC/config)
- ADMIN_EMAIL (initial admin email)
- PENTEST_BACKEND_URL (if using pentest backend service)

Example: create secrets and set env vars
```bash
# Set secrets
az containerapp secret set -g remediate-rg --name remediate-app --secrets \
  DATABASE_URL="$PG_CONN" \
  REDIS_URL="$REDIS_CONN" \
  NEXTAUTH_SECRET="$(openssl rand -hex 32)" \
  AUTH_SECRET="$(openssl rand -hex 32)"

# Create container app
az containerapp create -g remediate-rg -n remediate-app \
  --environment remediate-env \
  --image $IMAGE_NAME \
  --ingress 'external' --target-port 3000 \
  --registry-server remediateacr.azurecr.io \
  --secrets DATABASE_URL=DATABASE_URL REDIS_URL=REDIS_URL NEXTAUTH_SECRET=NEXTAUTH_SECRET AUTH_SECRET=AUTH_SECRET \
  --env-vars DATABASE_URL="@DATABASE_URL" REDIS_URL="@REDIS_URL" NEXTAUTH_SECRET="@NEXTAUTH_SECRET" AUTH_SECRET="@AUTH_SECRET" NEXTAUTH_URL="https://<your-host>" ADMIN_EMAIL="admin@example.com" PENTEST_BACKEND_URL="https://<pentest-host>"
```

Notes & recommendations
- Use Azure Key Vault for secrets and reference them in ACA via the Key Vault integration.
- Configure a managed identity for ACA when integrating with other Azure resources.
- Back up your Postgres with automated backups and enable VNet integration for production.
- Use a staging slot or separate container app environment for blue/green or canary deployments.

Database migrations
- Run `npx prisma migrate deploy` in a CI step before updating ACA, or run a one-off job/container to apply migrations.
- Example: use `az container create --image $IMAGE_NAME --command-line 'npx prisma migrate deploy'` or a dedicated CI job.

Health checks & scaling
- Set probes in ACA for `/api/health` endpoints.
- Configure scale rules (HTTP concurrency, CPU, or custom KEDA metrics).

Cleanup (when finished)
```bash
az group delete -n remediate-rg --yes --no-wait
```
