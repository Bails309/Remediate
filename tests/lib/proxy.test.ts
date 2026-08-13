import { describe, it, expect, vi, beforeEach } from "vitest";

// `proxy.ts` wraps its handler in NextAuth's `auth()` HOF. Replacing NextAuth
// with an identity wrapper lets us drive the handler directly and pin the
// session, so these tests exercise the routing/RBAC logic rather than NextAuth.
vi.mock("next-auth", () => ({
    default: () => ({ auth: (handler: (req: unknown) => unknown) => (req: unknown) => handler(req) }),
}));
vi.mock("../../auth.config", () => ({ default: {} }));

import { NextRequest } from "next/server";
import { proxy as proxyEntry } from "../../proxy";

// The exported signature mirrors NextAuth's handler (req, ctx); the ctx is
// unused by our middleware, so tests call through this one-arg wrapper.
const proxy = (req: unknown) => proxyEntry(req as never, undefined as never);

type Roles = string[] | null;

function request(pathname: string, roles: Roles, init?: { cookie?: string; proto?: string; origin?: string }) {
    const origin = init?.origin ?? "http://localhost:3000";
    const headers = new Headers();
    if (init?.cookie) headers.set("cookie", init.cookie);
    if (init?.proto) headers.set("x-forwarded-proto", init.proto);

    const req = new NextRequest(new URL(pathname, origin), { headers });
    // NextAuth decorates the request with the resolved session.
    Object.defineProperty(req, "auth", {
        value: roles === null ? null : { user: { email: "u@example.com", roles } },
        configurable: true,
    });
    return req as NextRequest & { auth: unknown };
}

function locationOf(res: Response) {
    return res.headers.get("location") ? new URL(res.headers.get("location")!).pathname : null;
}

beforeEach(() => {
    vi.unstubAllEnvs();
});

describe("proxy — authentication", () => {
    it("redirects anonymous users to /login", async () => {
        const res = await proxy(request("/dashboard", null) as never);
        expect(res!.status).toBe(307);
        expect(locationOf(res!)).toBe("/login");
    });

    it.each(["/login", "/api/health", "/api/auth/session", "/_next/static/chunk.js"])(
        "lets anonymous traffic reach the public path %s",
        async (path) => {
            const res = await proxy(request(path, null) as never);
            expect(locationOf(res!)).toBeNull();
        }
    );

    it("lets an authenticated user reach the dashboard", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"]) as never);
        expect(locationOf(res!)).toBeNull();
    });

    it("treats a session without roles as having none", async () => {
        const res = await proxy(request("/admin/users", []) as never);
        expect(locationOf(res!)).toBe("/dashboard");
    });
});

describe("proxy — /admin is site_admin only", () => {
    // Regression guard for v2.16.0: web_app_admin previously reached every
    // /admin page. Installation config, identity and platform health must now
    // be site_admin only, and this is the outermost of the three enforcement
    // layers (edge -> page -> route handler).
    it.each([
        "/admin",
        "/admin/configuration",
        "/admin/users",
        "/admin/groups",
        "/admin/audit-log",
        "/admin/health",
    ])("redirects web_app_admin away from %s", async (path) => {
        const res = await proxy(request(path, ["web_app_admin"]) as never);
        expect(res!.status).toBe(307);
        expect(locationOf(res!)).toBe("/dashboard");
    });

    it.each(["web_app_user", "web_app_auditor", "toolkit_admin", "toolkit_user"])(
        "redirects %s away from /admin",
        async (role) => {
            const res = await proxy(request("/admin/users", [role]) as never);
            expect(locationOf(res!)).toBe("/dashboard");
        }
    );

    it("allows site_admin", async () => {
        const res = await proxy(request("/admin/users", ["site_admin"]) as never);
        expect(locationOf(res!)).toBeNull();
    });
});

describe("proxy — workspace-admin areas", () => {
    const workspacePaths = ["/uploads", "/uploads/nessus", "/buckets", "/automation/acr"];

    it.each(workspacePaths)("allows web_app_admin on %s", async (path) => {
        const res = await proxy(request(path, ["web_app_admin"]) as never);
        expect(locationOf(res!)).toBeNull();
    });

    it.each(workspacePaths)("allows site_admin on %s", async (path) => {
        const res = await proxy(request(path, ["site_admin"]) as never);
        expect(locationOf(res!)).toBeNull();
    });

    it.each(workspacePaths)("redirects web_app_user away from %s", async (path) => {
        const res = await proxy(request(path, ["web_app_user"]) as never);
        expect(locationOf(res!)).toBe("/dashboard");
    });

    it("does not let a toolkit role into the workspace areas", async () => {
        const res = await proxy(request("/uploads", ["toolkit_admin"]) as never);
        expect(locationOf(res!)).toBe("/dashboard");
    });
});

describe("proxy — /tools", () => {
    it.each(["site_admin", "toolkit_admin", "toolkit_user"])("allows %s", async (role) => {
        const res = await proxy(request("/tools", [role]) as never);
        expect(locationOf(res!)).toBeNull();
    });

    it.each(["web_app_admin", "web_app_user", "web_app_auditor"])("redirects %s", async (role) => {
        const res = await proxy(request("/tools", [role]) as never);
        expect(locationOf(res!)).toBe("/dashboard");
    });
});

describe("proxy — security headers", () => {
    it("sets the baseline hardening headers", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"]) as never);
        expect(res!.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(res!.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
        expect(res!.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
    });

    it("does not send the deprecated X-Frame-Options (CSP frame-ancestors supersedes it)", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"]) as never);
        expect(res!.headers.has("X-Frame-Options")).toBe(false);
        expect(res!.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    });

    it("strips the framework fingerprint", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"]) as never);
        expect(res!.headers.has("x-powered-by")).toBe(false);
    });

    it("sets HSTS and upgrade-insecure-requests only over https", async () => {
        const plain = await proxy(request("/dashboard", ["web_app_user"]) as never);
        expect(plain!.headers.has("Strict-Transport-Security")).toBe(false);
        expect(plain!.headers.get("Content-Security-Policy")).not.toContain("upgrade-insecure-requests");

        const secure = await proxy(request("/dashboard", ["web_app_user"], { proto: "https" }) as never);
        expect(secure!.headers.get("Strict-Transport-Security")).toBe(
            "max-age=31536000; includeSubDomains; preload"
        );
        expect(secure!.headers.get("Content-Security-Policy")).toContain("upgrade-insecure-requests");
    });

    it("applies headers to redirects as well as pass-throughs", async () => {
        const res = await proxy(request("/admin", ["web_app_admin"]) as never);
        expect(res!.status).toBe(307);
        expect(res!.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(res!.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    });
});

describe("proxy — CSP nonce", () => {
    it("issues a nonce and pins script-src to it, with no unsafe-inline", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"]) as never);
        const nonce = res!.headers.get("x-nonce");
        expect(nonce).toMatch(/^[0-9a-f-]{36}$/i);

        const csp = res!.headers.get("Content-Security-Policy")!;
        expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
        // A nonce is inert if 'unsafe-inline' is also present — browsers ignore
        // the nonce when both appear, so this must never regress.
        expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'self'");
        expect(csp).toContain("form-action 'self'");
    });

    it("persists the nonce in an HttpOnly cookie", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"]) as never);
        const setCookie = res!.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("x-nonce=");
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Lax");
        expect(setCookie).not.toContain("Secure");
    });

    it("marks the nonce cookie Secure behind an https proxy", async () => {
        const res = await proxy(request("/dashboard", ["web_app_user"], { proto: "https" }) as never);
        expect(res!.headers.get("set-cookie")).toContain("Secure");
    });

    it("reuses an existing nonce cookie instead of reissuing one", async () => {
        const existing = "11111111-2222-3333-4444-555555555555";
        const res = await proxy(
            request("/dashboard", ["web_app_user"], { cookie: `x-nonce=${existing}` }) as never
        );
        expect(res!.headers.get("x-nonce")).toBe(existing);
        expect(res!.headers.get("Content-Security-Policy")).toContain(`'nonce-${existing}'`);
        expect(res!.headers.get("set-cookie") ?? "").not.toContain("x-nonce=");
    });
});
