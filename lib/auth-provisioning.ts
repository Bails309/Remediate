import type { User, Account, Profile } from "next-auth";
import { prisma } from "@/lib/prisma";

export async function provisionUser({ user, account, profile }: { user: User; account: Account | null; profile?: Profile }) {
    const email = user.email || profile?.email;
    if (!email) return false;

    const provider = account?.provider;
    const localAuthEmail = process.env.LOCAL_AUTH_EMAIL;
    const isLocal = provider === "credentials" || (localAuthEmail && email.toLowerCase() === localAuthEmail.toLowerCase());
    const authSource = isLocal ? "Local" : "SSO";

    const adminEmail = process.env.ADMIN_EMAIL;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    const isPrimaryAdmin = !!(adminEmail && adminEmail.toLowerCase() === email.toLowerCase());

    const defaultRoles = ["web_app_user"];
    const adminRoles = ["site_admin", "web_app_admin", "pentest_admin", "web_app_user", "pentest_user"];
    const roles = isPrimaryAdmin ? adminRoles : (existingUser?.roles || defaultRoles);

    await prisma.user.upsert({
        where: { email },
        update: {
            name: user.name || "User",
            roles,
            authSource
        },
        create: {
            email,
            name: user.name || "User",
            roles,
            authSource
        },
    });
    return true;
}
