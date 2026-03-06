# Security Guidelines

This file lists practical security controls and best practices for running Remediate.

## Secrets & Credentials
- Store sensitive values (`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, SMTP creds) in your platform's secret store (GitHub Secrets, Azure Key Vault, ACA secrets).
- Never commit secrets to the repository.

## Encryption
- `AUTH_SECRET` is used to encrypt OIDC/SMTP configuration stored in Postgres — keep it safe and rotate periodically.
- Use TLS for all external services (Postgres endpoint, Redis, SMTP).

## Access Control
- Grant the minimal DB role required. Use managed identities where supported.
- Restrict network access to Postgres and Redis to trusted subnets or services.

## Runtime Migration Safety
- `scripts/migrate.js` uses a Postgres advisory lock to ensure only one instance applies migrations. This reduces risk when multiple containers start simultaneously.

## Container & Image Security
- Build images from official base images and pin versions in CI.
- Scan images for vulnerabilities (e.g., GitHub Code Scanning, Microsoft Defender).

## Dependencies
- Keep `npm` dependencies up to date. Run periodic `npm audit` and address critical findings.

## Backups & DR
- Schedule regular backups for Postgres and snapshot retention for Redis (or use managed service backups).
- Test restoring backups periodically in a staging environment.

## Operational Practices
- Run migrations in CI and gate deployment on successful migration to avoid surprise runtime failures.
- Log and alert on migration failures; fail fast and stop deployments.

## Notes
- Avoid running untested schema changes in production. Use feature flags or phased rollouts for high-risk changes.
