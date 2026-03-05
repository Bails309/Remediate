import type { NextAuthOptions } from "next-auth";
import KeycloakProvider from "next-auth/providers/keycloak";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { getOidcConfigFromDb } from "@/lib/oidc";

function getEnvOidcConfig() {
  const clientId = process.env.OIDC_CLIENT_ID ?? "";
  const clientSecret = process.env.OIDC_CLIENT_SECRET ?? "";
  const issuerUrl = process.env.OIDC_ISSUER_URL ?? "";
  const tenantId = process.env.OIDC_TENANT_ID ?? undefined;

  if (!clientId || !clientSecret || !issuerUrl) {
    return null;
  }

  return { clientId, clientSecret, issuerUrl, tenantId };
}

function getLocalAuthConfig() {
  const enabled = process.env.LOCAL_AUTH_ENABLED === "true";
  if (process.env.NODE_ENV === "production" || !enabled) {
    return null;
  }

  const username = process.env.LOCAL_AUTH_USER ?? "";
  const password = process.env.LOCAL_AUTH_PASS ?? "";
  const email = process.env.LOCAL_AUTH_EMAIL ?? username;
  const name = process.env.LOCAL_AUTH_NAME ?? "Local Admin";

  if (!username || !password || !email) {
    return null;
  }

  return { username, password, email, name };
}

export async function buildAuthOptions(): Promise<NextAuthOptions> {
  const envConfig = getEnvOidcConfig();
  const dbConfig = envConfig ? null : await getOidcConfigFromDb();
  const config = envConfig ?? dbConfig;
  const localConfig = getLocalAuthConfig();

  if (!config && !localConfig) {
    throw new Error("Auth config missing. Configure OIDC or enable local auth in development.");
  }

  const providers = [] as NextAuthOptions["providers"];

  if (config) {
    providers.push(
      KeycloakProvider({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        issuer: config.issuerUrl,
        profile(profile) {
          return {
            id: profile.sub,
            name: profile.name ?? profile.preferred_username ?? "User",
            email: profile.email,
          };
        },
      })
    );
  }

  if (localConfig) {
    providers.push(
      CredentialsProvider({
        name: "Local",
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.username || !credentials.password) {
            return null;
          }
          if (credentials.username !== localConfig.username || credentials.password !== localConfig.password) {
            return null;
          }
          return {
            id: localConfig.email,
            name: localConfig.name,
            email: localConfig.email,
          };
        },
      })
    );
  }

  return {
    secret: process.env.NEXTAUTH_SECRET,
    session: { strategy: "jwt" },
    providers,
    callbacks: {
      async signIn({ profile, user }) {
        const email = profile?.email ?? user?.email;
        const name = profile?.name ?? user?.name ?? "User";
        if (!email) {
          return false;
        }
        const adminEmail = process.env.ADMIN_EMAIL;
        const role = adminEmail && adminEmail.toLowerCase() === email.toLowerCase() ? "Admin" : "User";
        await prisma.user.upsert({
          where: { email },
          update: { name, role },
          create: {
            email,
            name,
            role,
          },
        });
        return true;
      },
      async jwt({ token }) {
        if (token.email) {
          const user = await prisma.user.findUnique({ where: { email: token.email } });
          if (user) {
            token.role = user.role;
            token.userId = user.id;
          }
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.userId as string | undefined;
          session.user.role = token.role as string | undefined;
        }
        return session;
      },
    },
    pages: {
      signIn: "/login",
    },
  };
}
