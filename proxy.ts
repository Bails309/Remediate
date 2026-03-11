import NextAuth from "next-auth";
import authConfig from "./auth.config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

const { auth } = NextAuth(authConfig);

interface AuthRequest extends NextRequest {
    auth: Session | null;
}

const proxyHandler = auth((req: AuthRequest) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth;

    const publicPaths = ["/login", "/api/health", "/api/auth"];
    const isPublicPath = publicPaths.some((path) => nextUrl.pathname.startsWith(path)) || nextUrl.pathname.startsWith("/_next");

    if (isPublicPath) {
        return NextResponse.next();
    }

    if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/login", nextUrl));
    }

    const roles = req.auth?.user?.roles || [];
    const hasAnyRole = (allowed: string[]) => allowed.some((role) => roles.includes(role));

    if (nextUrl.pathname.startsWith("/admin") && !hasAnyRole(["site_admin", "web_app_admin"])) {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    if (nextUrl.pathname.startsWith("/tools") && !hasAnyRole(["site_admin", "toolkit_admin", "toolkit_user"])) {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    return NextResponse.next();
});

export function proxy(...args: Parameters<typeof proxyHandler>) {
    return proxyHandler(...args);
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
