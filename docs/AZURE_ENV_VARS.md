# Minimum Environment Variables for Azure Container Apps

Store these values as ACA secrets (or map to Key Vault):

- DATABASE_URL: Postgres connection string (use Azure Database for PostgreSQL Flexible Server)
- REDIS_URL: Redis connection string (Azure Cache for Redis)
- NEXTAUTH_URL: Public URL of the app (e.g., https://app.example.com)
- NEXTAUTH_SECRET: Strong random secret for NextAuth
- AUTH_SECRET: Application encryption key used for storing encrypted data (OIDC config, report settings)
- ADMIN_EMAIL: Primary administrator email populated by seed script
- PENTEST_BACKEND_URL: (Optional) URL to the pentest backend service
- TOOLS_CONFIG_PATH: (Optional) Path inside pentest backend for tools config (default `/config/tools.json`)
- NODE_ENV=production

Optional (local/dev):
- LOCAL_AUTH_ENABLED, LOCAL_AUTH_USER, LOCAL_AUTH_PASS, LOCAL_AUTH_EMAIL

Recommendations
- Keep secrets in Azure Key Vault and reference them via ACA Key Vault integration.
- Use managed identities for accessing other Azure resources.
- Ensure `DATABASE_URL` uses SSL (Azure-managed DBs require TLS). Example: `postgresql://user:pass@host:5432/db?sslmode=require`
