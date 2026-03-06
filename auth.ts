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
            async signIn(params: any) {
                const { provisionUser } = await import("@/lib/auth-provisioning");
                return provisionUser(params);
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
