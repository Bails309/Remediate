# Security Guidelines

This file lists practical security controls and best practices for running Remediate.

## Secrets & Credentials
- Store sensitive values (`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, SMTP creds) in your platform's secret store (GitHub Secrets, Azure Key Vault, ACA secrets).
- Never commit secrets to the repository.
- Credential values (connection strings, account keys, SAS tokens) are never written to application logs.

## Encryption
- `AUTH_SECRET` is used to encrypt OIDC/SMTP configuration stored in Postgres — keep it safe and rotate periodically.
- Use TLS for all external services (Postgres endpoint, Redis, SMTP).

## Authentication
- Local credential comparison uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.
- Auth provisioning never overwrites manually assigned database roles on subsequent logins.

## Access Control
- Grant the minimal DB role required. Use managed identities where supported.
- Restrict network access to Postgres and Redis to trusted subnets or services.
- **RBAC Hierarchy**: Non-site-admins cannot grant `site_admin` or `toolkit_admin` roles via the admin API.
- **Last-Admin Protection**: Role removal and user deletion for the last `site_admin` are guarded within database transactions to prevent race conditions.
- **Rate Limiting**: Authenticated API routes key rate limits on user identity rather than client IP headers where possible.

## Input Validation
- All user-facing search queries escape SQL LIKE wildcards (`%`, `_`, `\`) to prevent pattern injection.
- Vulnerability statuses are validated against a strict enum whitelist.
- Tour IDs, analytics site IDs, and comment content are validated with Zod schemas at the API boundary.
- Page numbers and feed limits are capped to prevent unbounded queries.
- Bucket import patterns are validated for regex syntax and length.

## Content Security Policy
- The middleware generates a cryptographic nonce (`crypto.randomUUID`) for each request, applied to `script-src` and `style-src` CSP directives.

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
- Full `VACUUM` operations should be scheduled as periodic maintenance (e.g., daily cron), not run per-upload.

## Notes
- Avoid running untested schema changes in production. Use feature flags or phased rollouts for high-risk changes.
