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
        session: {
            strategy: "jwt",
            maxAge: 8 * 60 * 60, // 8-hour absolute session lifetime (OWASP recommendation)
        },
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

                // Check if this token has been revoked (server-side logout)
                if (token.jti) {
                    const { redis } = await import("@/lib/redis");
                    const revoked = await redis.get(`revoked:${token.jti}`);
                    if (revoked) {
                        // Return an empty token — NextAuth will treat this as invalid
                        return {} as JWT;
                    }
                }

                const email = user?.email || token.email;

                // If we have an email, check DB for the user so we can detect role/record updates
                const dbUser = email ? await prisma.user.findUnique({ where: { email } }) : null;

                // Refresh when:
                // - initial sign-in (user present)
                // - an explicit update trigger is provided
                // - no lastRefreshed timestamp
                // - more than ONE_HOUR has passed since last refresh
                // - OR the user's roles in the DB differ from the token (so role changes apply immediately)
                const tokenLastRefreshed = (token.lastRefreshed as number) || 0;

                const dbRoles = (dbUser?.roles ?? []) as string[];
                const tokenRoles = (token.roles as string[]) ?? [];
                const sortArr = (arr: string[]) => arr.slice().sort();
                const rolesChanged = JSON.stringify(sortArr(dbRoles)) !== JSON.stringify(sortArr(tokenRoles));

                if (
                    user ||
                    trigger === "update" ||
                    !token.lastRefreshed ||
                    (now - tokenLastRefreshed > ONE_HOUR) ||
                    rolesChanged
                ) {
                    if (dbUser) {
                        token.roles = dbRoles;
                        token.userId = dbUser.id;
                        token.authSource = (dbUser as { authSource?: string }).authSource;
                        token.lastRefreshed = now;
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

console.log("[Auth] result keys:", Object.keys(result));
export const { handlers, signIn, signOut, auth } = result;
console.log("[Auth] handlers exported:", !!handlers);
