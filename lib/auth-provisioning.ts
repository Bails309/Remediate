import type { User as NextAuthUser, Account, Profile } from "next-auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function provisionUser({ user, account, profile }: { user: NextAuthUser; account: Account | null; profile?: Profile }) {
    const email = user.email || profile?.email;
    if (!email) return false;

    const provider = account?.provider;
    const localAuthEmail = process.env.LOCAL_AUTH_EMAIL;
    const isLocal = provider === "credentials" || (localAuthEmail && email.toLowerCase() === localAuthEmail.toLowerCase());
    const authSource = isLocal ? "Local" : "SSO";

    const adminEmail = process.env.ADMIN_EMAIL;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    const isPrimaryAdmin = !!(adminEmail && adminEmail.toLowerCase() === email.toLowerCase());

    const defaultRoles: UserRole[] = [UserRole.web_app_user];
    const adminRoles: UserRole[] = [
        UserRole.site_admin,
        UserRole.web_app_admin,
        UserRole.pentest_admin,
        UserRole.web_app_user,
        UserRole.pentest_user,
    ];

    const userRolesFromSession = (user as unknown as { roles?: UserRole[] }).roles;
    const isNewUser = !existingUser;

    let roles: UserRole[];
    if (isNewUser) {
        // New users from SSO should get the least-privileged default.
        // Allow local/credentials flow to supply roles via session when present.
        if (isPrimaryAdmin) {
            roles = adminRoles;
        } else if (isLocal) {
            roles = userRolesFromSession ?? defaultRoles;
        } else {
            roles = defaultRoles;
        }
    } else {
        // Existing users keep their stored roles; local session roles can override.
        roles = userRolesFromSession ?? existingUser?.roles ?? defaultRoles;
    }

    console.log(`[Auth] Provisioning ${authSource} user: ${email} with roles: ${roles.join(", ")}`);

    try {
        await prisma.user.upsert({
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
            // Legacy schema fallback may have a singular `role` field which is not
            // present in the current Prisma schema/type definitions. Create a
            // narrow, typed view of the `user` model to avoid using `any`.
            type LegacyUserModel = { upsert: (args: unknown) => Promise<unknown> };
            const legacyUser = (prisma as unknown as { user: LegacyUserModel }).user;
            await legacyUser.upsert({
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
