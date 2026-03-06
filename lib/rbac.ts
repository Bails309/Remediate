import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await getServerSession(await buildAuthOptions());
  if (!session?.user?.email) {
    throw new Error("Unauthorized");
  }
  const email = session.user.email;
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const role = adminEmail && adminEmail.toLowerCase() === email.toLowerCase() ? "Admin" : "User";
    user = await prisma.user.create({
      data: {
        email,
        name: session.user.name ?? "User",
        role,
      },
    });
  }
  session.user.id = user.id;
  session.user.role = user.role;
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user?.role !== "Admin") {
    throw new Error("Forbidden");
  }
  return session;
}
