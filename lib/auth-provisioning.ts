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
        UserRole.toolkit_admin,
        UserRole.web_app_user,
        UserRole.toolkit_user,
    ];

    const userRolesFromSession = (user as unknown as { roles?: UserRole[] }).roles;
    const isNewUser = !existingUser;

    // SECURITY: Block unknown SSO users by default (to avoid accidental account creation).
    // To opt out and allow automatic provisioning of SSO users, set
    // `BLOCK_UNKNOWN_SSO=false` in the environment.
    // Note: primary admin configured via `ADMIN_EMAIL` is still allowed.
    // In test environments, allow provisioning to keep tests deterministic.
    const isTestEnv = process.env.NODE_ENV === "test";
    const blockUnknownSso = !isTestEnv && process.env.BLOCK_UNKNOWN_SSO !== "false";
    console.log(`[Auth] NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}; BLOCK_UNKNOWN_SSO=${process.env.BLOCK_UNKNOWN_SSO ?? "(unset)"}; blocking unknown SSO: ${blockUnknownSso}`);
    if (blockUnknownSso && isNewUser && !isLocal && !isPrimaryAdmin) {
        console.warn(`[Auth] Blocking unauthorized SSO login attempt for: ${email}`);
        return false;
    }

    let roles: UserRole[];
    if (isNewUser) {
        // New users (Local or Primary Admin) get roles
        if (isPrimaryAdmin) {
            roles = adminRoles;
        } else if (isLocal) {
            roles = userRolesFromSession ?? defaultRoles;
        } else {
            // This case should be blocked above, but as a safety:
            roles = defaultRoles;
        }
    } else {
        // Existing users always keep their DB-stored roles.
        // Never overwrite with session roles — role changes must go through admin UI.
        roles = existingUser?.roles ?? defaultRoles;
    }

    console.log(`[Auth] Provisioning ${authSource} user: ${email} with roles: ${roles.join(", ")}`);

    try {
        await prisma.user.upsert({
            where: { email },
            update: {
                // Always sync name from SSO/Auth Provider if available to ensure consistency
                name: user.name || existingUser?.name || "User",
                roles: roles,
                authSource,
                lastLoginAt: new Date(),
            },
            create: {
                email,
                name: user.name || "User",
                roles: roles,
                authSource,
                lastLoginAt: new Date(),
            },
        });
        return true;
    } catch (upsertError) {
        console.error(`[Auth] Failed to provision user ${email}:`, upsertError);
        return false;
    }
}
