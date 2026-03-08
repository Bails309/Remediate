import NextAuth from "next-auth";
import type { User, Account, Profile, Session, NextAuthConfig } from "next-auth";
import type { JWT } from "next-auth/jwt";
import authConfig from "./auth.config";
import { prisma } from "@/lib/prisma";
import Keycloak from "next-auth/providers/keycloak";

// Dynamic configuration for NextAuth v5
const result = NextAuth(async () => {
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
            async signIn(params: { user: User; account: Account | null; profile?: Profile }) {
                const { provisionUser } = await import("@/lib/auth-provisioning");
                return provisionUser(params);
            },
            async jwt({ token, user }: { token: JWT; user?: User }) {
                // This only runs on sign in when the user object is available
                if (user) {
                    const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
                    if (dbUser) {
                        /* eslint-disable @typescript-eslint/no-explicit-any */
                        token.roles = (dbUser as any).roles as string[];
                        token.userId = dbUser.id;
                        token.authSource = (dbUser as any).authSource;
                        /* eslint-enable @typescript-eslint/no-explicit-any */
                    }
                }
                return token;
            },
            async session({ session, token }: { session: Session; token: JWT }) {
                if (session.user) {
                    session.user.id = token.userId as string;
                    session.user.roles = token.roles as string[];
                    session.user.authSource = token.authSource as string;
                }
                return session;
            }
        }
    } as NextAuthConfig;
});

export const { handlers, signIn, signOut, auth } = result;
