import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";


export const WEB_APP_ADMIN_ROLES = ["site_admin", "web_app_admin"] as const;
export const TOOLKIT_ROLES = ["site_admin", "toolkit_admin", "toolkit_user"] as const;
export const TOOLKIT_ADMIN_ROLES = ["site_admin", "toolkit_admin"] as const;

// Roles that grant read access to the web app workspace (dashboard, analytics,
// vulnerabilities, threat intelligence). Auditor is read-only; admins/users can
// also write subject to the per-action checks in group-rbac and route handlers.
export const WEB_APP_READ_ROLES = [
  "site_admin",
  "web_app_admin",
  "web_app_user",
  "web_app_auditor",
] as const;

// Roles that grant write access to web-app workspace entities. The auditor role
// is intentionally absent: a user holding ONLY web_app_auditor must not mutate.
export const WEB_APP_WRITE_ROLES = [
  "site_admin",
  "web_app_admin",
  "web_app_user",
] as const;

export type AppRole = typeof WEB_APP_ADMIN_ROLES[number]
  | typeof TOOLKIT_ROLES[number]
  | "web_app_user"
  | "web_app_auditor";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect("/login");
  }
  const email = session.user.email;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    redirect("/login?error=SessionExpired");
  }

  session.user.id = user.id;
  session.user.roles = (user as unknown as { roles?: string[] }).roles || [];
  session.user.authSource = (user as unknown as { authSource?: string }).authSource || "Local";
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (!hasAnyRole(session.user, WEB_APP_ADMIN_ROLES)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireToolkitUser() {
  const session = await requireUser();
  if (!hasAnyRole(session.user, TOOLKIT_ROLES)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requireToolkitAdmin() {
  const session = await requireUser();
  if (!hasAnyRole(session.user, TOOLKIT_ADMIN_ROLES)) {
    throw new Error("Forbidden");
  }
  return session;
}

export function hasAnyRole(user: { roles?: string[] | null } | null | undefined, roles: readonly string[]) {
  if (!user?.roles?.length) return false;
  return roles.some((role) => user.roles?.includes(role));
}

export function checkAdmin(user: { roles?: string[] | null } | null | undefined) {
  return hasAnyRole(user, WEB_APP_ADMIN_ROLES);
}

/**
 * Auditor predicate.
 *
 * A user is considered an auditor (read-only) when they hold the
 * `web_app_auditor` role AND do NOT hold any role that grants write access.
 * This means assigning auditor alongside admin/user roles is a no-op for
 * write-blocking purposes — those other roles continue to grant their writes.
 * The Users admin UI should prevent that combination, but enforcement here is
 * defensive only.
 */
export function isAuditor(user: { roles?: string[] | null } | null | undefined) {
  if (!user?.roles?.length) return false;
  const hasAuditor = user.roles.includes("web_app_auditor");
  if (!hasAuditor) return false;
  const hasWriter = (WEB_APP_WRITE_ROLES as readonly string[]).some((r) => user.roles!.includes(r));
  return !hasWriter;
}

export function canWriteWebApp(user: { roles?: string[] | null } | null | undefined) {
  return hasAnyRole(user, WEB_APP_WRITE_ROLES);
}

/**
 * Like `requireUser` but additionally blocks read-only auditors from any
 * mutation route. Use in place of `requireUser` in POST/PATCH/DELETE handlers
 * that touch workspace data (vulnerabilities, comments, assignments, etc.).
 *
 * Throws "Forbidden" on denial (matching the `requireAdmin` convention).
 * Prefer the predicate `canWriteWebApp` when you want a clean 403 response.
 */
export async function requireWebAppWriter() {
  const session = await requireUser();
  if (!canWriteWebApp(session.user)) {
    throw new Error("Forbidden");
  }
  return session;
}
