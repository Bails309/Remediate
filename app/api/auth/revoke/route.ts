import { auth } from "@/auth";
import { redis } from "@/lib/redis";
import { NextResponse } from "next/server";
import { decode } from "next-auth/jwt";

const SESSION_MAX_AGE = 8 * 60 * 60; // Must match auth.ts session.maxAge

export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: true }); // Already logged out
  }

  // Read the raw session token from the cookie
  const cookieStore = await (await import("next/headers")).cookies();
  const tokenCookie =
    cookieStore.get("__Secure-authjs.session-token") ??
    cookieStore.get("authjs.session-token");

  if (tokenCookie?.value) {
    try {
      const decoded = await decode({
        token: tokenCookie.value,
        salt: tokenCookie.name,
        secret: process.env.AUTH_SECRET!,
      });

      if (decoded?.jti) {
        // Add jti to Redis blacklist with TTL matching the session max age
        await redis.set(`revoked:${decoded.jti}`, "1", "EX", SESSION_MAX_AGE);
      }
    } catch {
      // Token decode failed — session will be cleared by NextAuth signOut anyway
    }
  }

  return NextResponse.json({ ok: true });
}
