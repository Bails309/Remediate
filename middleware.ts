import NextAuth from "next-auth";
import authConfig from "./auth.config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";

const { auth } = NextAuth(authConfig);

interface AuthRequest extends NextRequest {
    auth: Session | null;
}

export default auth((req: AuthRequest) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth;

    const publicPaths = ["/login", "/api/health", "/api/auth"];
    const isPublicPath = publicPaths.some((path) => nextUrl.pathname.startsWith(path)) || nextUrl.pathname.startsWith("/_next");

    if (isPublicPath) {
        return NextResponse.next();
    }

    if (!isLoggedIn) {
        if (nextUrl.pathname.startsWith("/api/")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        return NextResponse.redirect(new URL("/login", nextUrl));
    }

    const userRole = req.auth?.user?.role;
    if (nextUrl.pathname.startsWith("/admin") && userRole !== "Admin") {
        return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
