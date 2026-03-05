import { getServerSession } from "next-auth";
import { buildAuthOptions } from "@/lib/auth";

export async function requireUser() {
  const session = await getServerSession(await buildAuthOptions());
  if (!session?.user?.email || !session.user.id) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.user?.role !== "Admin") {
    throw new Error("Forbidden");
  }
  return session;
}
