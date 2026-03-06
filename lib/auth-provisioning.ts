import { prisma } from "@/lib/prisma";

export async function provisionUser({ user, account, profile }: any) {
    const email = user.email || profile?.email;
    if (!email) return false;

    const provider = account?.provider;
    const localAuthEmail = process.env.LOCAL_AUTH_EMAIL;
    const isLocal = provider === "credentials" || (localAuthEmail && email.toLowerCase() === localAuthEmail.toLowerCase());
    const authSource = isLocal ? "Local" : "SSO";

    const adminEmail = process.env.ADMIN_EMAIL;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    const isPrimaryAdmin = !!(adminEmail && adminEmail.toLowerCase() === email.toLowerCase());

    // Preserve existing role unless they are the primary admin defined in ENV
    const role = isPrimaryAdmin ? "Admin" : (existingUser?.role || "User");

    await prisma.user.upsert({
        where: { email },
        update: {
            name: user.name || "User",
            role,
            authSource
        },
        create: {
            email,
            name: user.name || "User",
            role,
            authSource
        },
    });
    return true;
}
