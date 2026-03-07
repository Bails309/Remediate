import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
    const provisionParams = {
      user: {
        email: session.user.email,
        name: session.user.name || "User",
      } as any,
      account: {
        provider: session.user.authSource === "Local" ? "credentials" : "keycloak",
      } as any,
    };

    await provisionUser(provisionParams);
    user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Failed to re-provision user");
  }

  session.user.id = user.id;
  session.user.role = user.role;
  session.user.authSource = user.authSource;
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user?.role !== "Admin") {
    throw new Error("Forbidden");
  }
  return session;
}

export function checkAdmin(user: { role?: string | null } | null | undefined) {
  return user?.role === "Admin";
}
