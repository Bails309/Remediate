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
        trustHost: true,
        session: { strategy: "jwt" },
        providers: [
            ...authConfig.providers,
            oidcProvider,
        ],
        callbacks: {
            ...authConfig.callbacks,
            async signIn(params: { user: User; account: Account | null; profile?: Profile }) {
                try {
                    const { provisionUser } = await import("@/lib/auth-provisioning");
                    const success = await provisionUser(params);
                    if (!success) {
                        console.error("[Auth] User provisioning failed");
                    }
                    return success;
                } catch (e) {
                    console.error("[Auth] Critical error in signIn callback:", e);
                    return false;
                }
            },
            async jwt({ token, user, trigger }: { token: JWT; user?: User; trigger?: string }) {
                const now = Math.floor(Date.now() / 1000);
                const ONE_HOUR = 3600;

                // Initial sign-in or forced refresh
                if (user || trigger === "update" || !token.lastRefreshed || (now - (token.lastRefreshed as number) > ONE_HOUR)) {
                    const email = user?.email || token.email;
                    if (email) {
                        const dbUser = await prisma.user.findUnique({ where: { email } });
                        if (dbUser) {
                            token.roles = (dbUser as any).roles as string[];
                            token.userId = dbUser.id;
                            token.authSource = (dbUser as any).authSource;
                            token.lastRefreshed = now;
                        }
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
