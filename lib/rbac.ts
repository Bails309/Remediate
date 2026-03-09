import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";


export const WEB_APP_ADMIN_ROLES = ["site_admin", "web_app_admin"] as const;
export const PENTEST_ROLES = ["site_admin", "pentest_admin", "pentest_user"] as const;
export const PENTEST_ADMIN_ROLES = ["site_admin", "pentest_admin"] as const;

export type AppRole = typeof WEB_APP_ADMIN_ROLES[number]
  | typeof PENTEST_ROLES[number]
  | "web_app_user";

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
