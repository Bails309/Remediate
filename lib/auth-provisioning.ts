import type { User, Account, Profile } from "next-auth";
import { UserRole } from "@prisma/client";
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
    const adminRoles = [
        "site_admin",
        "web_app_admin",
        "pentest_admin",
        "web_app_user",
        "pentest_user"
    ];
    const roles = (user as any).roles || (isPrimaryAdmin ? adminRoles : ((existingUser as any)?.roles || defaultRoles));

    console.log(`[Auth] Provisioning ${authSource} user: ${email} with roles: ${roles.join(", ")}`);

    try {
        await (prisma.user as any).upsert({
            where: { email },
            update: {
                name: user.name || "User",
                roles: roles,
                authSource
            },
            create: {
                email,
                name: user.name || "User",
                roles: roles,
                authSource
            },
        });
        return true;
    } catch (upsertError) {
        console.error(`[Auth] Failed to provision user ${email}:`, upsertError);
        // Fallback for extremely old schema if somehow still present in DB
        try {
            console.log("[Auth] Attempting fallback to legacy 'role' field...");
            await (prisma.user as any).upsert({
                where: { email },
                update: {
                    name: user.name || "User",
                    role: isPrimaryAdmin ? "Admin" : "User",
                    authSource
                },
                create: {
                    email,
                    name: user.name || "User",
                    role: isPrimaryAdmin ? "Admin" : "User",
                    authSource
                },
            });
            return true;
        } catch (fallbackError) {
            console.error(`[Auth] Legacy fallback also failed for ${email}:`, fallbackError);
            return false;
        }
    }
}
