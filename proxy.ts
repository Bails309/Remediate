import NextAuth from "next-auth";
import authConfig from "./auth.config";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import crypto from "crypto";

const { auth } = NextAuth(authConfig);

function isPassThroughResponse(response: Response | NextResponse) {
    return response.status === 200 && !response.headers.has("location") && !response.headers.has("x-middleware-rewrite");
}

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

function getOrCreateNonce(req: NextRequest, responseHeaders: Headers) {
    const cookieNonce = req.cookies.get("x-nonce")?.value;
    if (cookieNonce) return cookieNonce;

    const forwardedProto = req.headers.get('x-forwarded-proto');
    const isHttps = forwardedProto === 'https' || req.url.startsWith('https://');
    const secureSuffix = isHttps ? '; Secure' : '';

    const newNonce = crypto.randomUUID();
    // Set cookie for subsequent sub-requests to keep nonce stable during SPA session
    responseHeaders.append("Set-Cookie", `x-nonce=${newNonce}; Path=/; HttpOnly; SameSite=Lax${secureSuffix}`);
    return newNonce;
}

export async function proxy(...args: Parameters<typeof proxyHandler>) {
    const [req] = args;
    const responseHeaders = new Headers();
    const nonce = getOrCreateNonce(req, responseHeaders);
    
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);

    let response = await proxyHandler(...args);
    if (!response) return response;

    const forwardedProto = req.headers.get('x-forwarded-proto');
    const isHttps = forwardedProto === 'https' || req.url.startsWith('https://');

    if (isPassThroughResponse(response)) {
        const nextResponse = NextResponse.next({
            request: {
                headers: requestHeaders,
            },
        });

        response.headers.forEach((value, key) => {
            nextResponse.headers.set(key, value);
        });

        response = nextResponse;
    }

    // Add baseline security headers
    // Note: X-Frame-Options is intentionally NOT set — it is deprecated and
    // superseded by CSP `frame-ancestors 'none'` (set below). Sending both is
    // redundant and was flagged in a pentest.
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    response.headers.set('x-nonce', nonce);
    
    // Copy any Set-Cookie headers from our nonce generation
    responseHeaders.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
            response.headers.append(key, value);
        }
    });

    // Development tooling injects styles without a nonce. In dev we allow inline styles;
    // in production we follow a strict script policy but allow inline styles for the tour.
    const styleSrc = ["'self'", "'unsafe-inline'"];
    const styleSrcElem = ["'self'", "'unsafe-inline'"];
    const styleSrcAttr = ["'unsafe-inline'"];

    let csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src ${styleSrc.join(" ")}; style-src-elem ${styleSrcElem.join(" ")}; style-src-attr ${styleSrcAttr.join(" ")}; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';`;

    if (isHttps) {
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        csp += " upgrade-insecure-requests;";
    }

    response.headers.set('Content-Security-Policy', csp);

    return response;
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
