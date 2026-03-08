import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { User as NextAuthUser, Account as NextAuthAccount, Profile as NextAuthProfile } from "next-auth";

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
    const provisionParams: { user: NextAuthUser; account: NextAuthAccount | null; profile?: NextAuthProfile } = {
      user: {
        email: session.user.email,
        name: session.user.name || "User",
        id: undefined,
      } as unknown as NextAuthUser,
      account: {
        provider: session.user.authSource === "Local" ? "credentials" : "keycloak",
      } as unknown as NextAuthAccount,
    };

    await provisionUser(provisionParams);
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Failed to re-provision user");
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
