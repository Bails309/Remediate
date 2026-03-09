import type { User, Session, NextAuthConfig } from "next-auth";
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
                // Local auth (useful for first-time setup or emergency access)
                // If enabled, you can sign in using local credentials even in production.
                const enabled = process.env.LOCAL_AUTH_ENABLED === "true";
                if (!enabled) return null;

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
                        roles: ["site_admin", "web_app_admin", "pentest_admin", "web_app_user", "pentest_user"],
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
                token.roles = user.roles;
                token.userId = user.id;
            }
            return token;
        },
        async session({ session, token }: { session: Session, token: JWT }) {
            if (session.user) {
                session.user.id = token.userId as string;
                session.user.roles = token.roles as string[];
            }
            return session;
        },
    },
} satisfies NextAuthConfig;
