import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const WEB_APP_ADMIN_ROLES = ["site_admin", "web_app_admin"] as const;
export const PENTEST_ROLES = ["site_admin", "pentest_admin", "pentest_user"] as const;
export const PENTEST_ADMIN_ROLES = ["site_admin", "pentest_admin"] as const;

export type AppRole = typeof WEB_APP_ADMIN_ROLES[number]
  | typeof PENTEST_ROLES[number]
  | "web_app_user";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
  const email = session.user.email;

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Re-provision if database record is missing but session is valid
    const { provisionUser } = await import("@/lib/auth-provisioning");

    // Create a minimal user object for provisioning
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const provisionParams = {
      user: {
        email: session.user.email,
        name: session.user.name || "User",
      } as any,
      account: {
        provider: session.user.authSource === "Local" ? "credentials" : "keycloak",
      } as any,
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await provisionUser(provisionParams);
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Failed to re-provision user");
  }

  session.user.id = user.id;
  session.user.roles = user.roles as string[];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  session.user.authSource = (user as any).authSource;
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (!hasAnyRole(session.user, WEB_APP_ADMIN_ROLES)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requirePentestUser() {
  const session = await requireUser();
  if (!hasAnyRole(session.user, PENTEST_ROLES)) {
    throw new Error("Forbidden");
  }
  return session;
}

export async function requirePentestAdmin() {
  const session = await requireUser();
  if (!hasAnyRole(session.user, PENTEST_ADMIN_ROLES)) {
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
