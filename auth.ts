import NextAuth from "next-auth";
import type { NextAuthConfig, User, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Auth.js v5 configuration
const config = {
    adapter: PrismaAdapter(prisma),
    session: { strategy: "jwt" },
    providers: [
        Keycloak({
            clientId: process.env.OIDC_CLIENT_ID || "placeholder",
            clientSecret: process.env.OIDC_CLIENT_SECRET || "placeholder",
            issuer: process.env.OIDC_ISSUER_URL || "https://placeholder",
        }),
        Credentials({
            name: "Local",
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                const enabled = process.env.LOCAL_AUTH_ENABLED === "true";
                if (process.env.NODE_ENV === "production" || !enabled) return null;

                const localUser = process.env.LOCAL_AUTH_USER;
                const localPass = process.env.LOCAL_AUTH_PASS;
                const localEmail = process.env.LOCAL_AUTH_EMAIL || localUser;
                const localName = process.env.LOCAL_AUTH_NAME || "Local Admin";

                if (!credentials?.username || !credentials.password) return null;
                if (credentials.username === localUser && credentials.password === localPass) {
                    return {
                        id: localEmail as string,
                        name: localName,
                        email: localEmail as string,
                        role: "Admin",
                    };
                }
                return null;
            }
        })
    ],
    callbacks: {
        async signIn({ user, profile }: { user: User, profile?: any }) {
            const email = user.email || profile?.email;
            if (!email) return false;

            const adminEmail = process.env.ADMIN_EMAIL;
            const role = adminEmail && adminEmail.toLowerCase() === email.toLowerCase() ? "Admin" : "User";

            await prisma.user.upsert({
                where: { email },
                update: { name: user.name || "User", role },
                create: {
                    email,
                    name: user.name || "User",
                    role,
                },
            });
            return true;
        },
        async jwt({ token, user }: { token: JWT, user?: User }) {
            if (user) {
                const dbUser = await prisma.user.findUnique({ where: { email: user.email! } });
                if (dbUser) {
                    token.role = dbUser.role;
                    token.userId = dbUser.id;
                }
            }
            return token;
        },
        async session({ session, token }: { session: Session, token: JWT }) {
            if (session.user) {
                session.user.id = token.userId as string;
                session.user.role = token.role as any;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
