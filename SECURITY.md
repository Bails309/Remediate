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

## Key Rotation Procedure
1. **AUTH_SECRET**: Generate a new value (`openssl rand -base64 32`), update the secret store, and redeploy. Existing sessions will be invalidated — users must re-authenticate.
2. **DATABASE_URL**: Rotate credentials through your managed database provider (e.g. Azure Key Vault auto-rotation), then restart the application.
3. **REDIS_URL**: Update the password in both the Redis server and the secret store, then restart.
4. **SMTP credentials**: Update in the admin Settings page (encrypted at rest with `AUTH_SECRET`).
5. **Schedule**: Rotate `AUTH_SECRET` at least every 90 days, or immediately after any suspected compromise.

## Incident Response
1. **Detection** — Automated health checks (`GET /api/health`) monitor PostgreSQL and Redis availability. System status is visible in the admin Operations page. Audit logs (`AuditLog` table) record all security-relevant actions.
2. **Containment** — Revoke compromised sessions by rotating `AUTH_SECRET`. Disable affected user accounts via the admin Users page. If a credential is compromised, rotate it immediately per the Key Rotation Procedure above.
3. **Investigation** — Query the audit log via `GET /api/admin/audit-log` with action/entity filters. Review application logs for anomalous activity patterns.
4. **Recovery** — Restore from backups if data integrity is affected. Redeploy with rotated secrets. Verify system health via `/api/health`.
5. **Post-Incident** — Document the incident, root cause, and remediation steps. Update this guide with any new controls. Notify affected users per GDPR Article 34 if personal data was compromised.

## Data Retention Policy
- **User accounts**: Retained while active; deleted on GDPR erasure request (`DELETE /api/account`) or admin action.
- **Audit logs**: Retained for 12 months. Implement a scheduled job to purge entries older than the retention period.
- **Vulnerability data**: Retained as long as relevant; archived records preserved in `VulnerabilityHistory`.
- **Session data**: JWT tokens expire after 8 hours. Idle sessions time out after 20 minutes.
