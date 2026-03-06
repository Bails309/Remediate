import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { prisma } from "@/lib/prisma";
import Keycloak from "next-auth/providers/keycloak";

export const { handlers, auth, signIn, signOut } = NextAuth(async (req) => {
    const { getOidcConfigFromDb } = await import("@/lib/oidc");
    const dbConfig = await getOidcConfigFromDb();

    const oidcProvider = Keycloak({
        clientId: dbConfig?.clientId || "placeholder",
        clientSecret: dbConfig?.clientSecret || "placeholder",
        issuer: dbConfig?.issuerUrl || "https://placeholder",
    });

    return {
        ...authConfig,
        session: { strategy: "jwt" },
        providers: [
            ...authConfig.providers,
            oidcProvider,
        ],
        callbacks: {
            ...authConfig.callbacks,
            async signIn({ user, account, profile }: any) {
                const email = user.email || profile?.email;
                if (!email) return false;

                const provider = account?.provider;
                const localAuthEmail = process.env.LOCAL_AUTH_EMAIL;
                const isLocal = provider === "credentials" || (localAuthEmail && email.toLowerCase() === localAuthEmail.toLowerCase());
                const authSource = isLocal ? "Local" : "SSO";

                const adminEmail = process.env.ADMIN_EMAIL;
                const role = adminEmail && adminEmail.toLowerCase() === email.toLowerCase() ? "Admin" : "User";

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
            },
            async jwt({ token, user }: any) {
                // This only runs on sign in when the user object is available
                if (user) {
                    const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
                    if (dbUser) {
                        token.role = dbUser.role;
                        token.userId = dbUser.id;
                    }
                }
                return token;
            },
        }
    };
});
