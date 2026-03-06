import type { NextAuthConfig, User, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";

export default {
    providers: [
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
                    } as User;
                }
                return null;
            }
        })
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async jwt({ token, user }: { token: JWT, user?: User }) {
            if (user) {
                token.role = user.role;
                token.userId = user.id;
            }
            return token;
        },
        async session({ session, token }: { session: Session, token: JWT }) {
            if (session.user) {
                session.user.id = token.userId as string;
                session.user.role = token.role as string;
            }
            return session;
        },
    },
} satisfies NextAuthConfig;
