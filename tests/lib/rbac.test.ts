import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`Redirected to ${url}`);
  }),
}));

import { requireUser, hasAnyRole, checkAdmin } from "@/lib/rbac";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.ADMIN_EMAIL;
});

describe("requireUser", () => {
  it("throws when no session user email", async () => {
    vi.mocked(auth).mockResolvedValue({} as any);

    await expect(requireUser()).rejects.toThrow("Redirected to /login");
  });

  it("returns session when id and roles are present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com", id: "u1", roles: ["web_app_user"] } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "a@b.com", roles: ["web_app_user"], authSource: "Local" } as any);

    const session = await requireUser();
    expect(session.user.id).toBe("u1");
    expect(session.user.roles).toEqual(["web_app_user"]);
  });

  it("throws Unauthorized when user is missing from DB", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "deleted@example.com", name: "Deleted User" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("Redirected to /login?error=SessionExpired");
  });
});

describe("admin and pentest guards", () => {
  it("requireAdmin throws when user lacks admin roles", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "x@x.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "x@x.com", roles: ["web_app_user"] } as any);
    await expect(import("@/lib/rbac").then((m) => m.requireAdmin())).rejects.toThrow("Forbidden");
  });

  it("requireAdmin returns session when user has admin role", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "admin@example.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u-admin", email: "admin@example.com", roles: ["site_admin"] } as any);
    const session = await import("@/lib/rbac").then((m) => m.requireAdmin());
    expect(session.user.id).toBe("u-admin");
  });

  it("requireToolkitUser throws when missing toolkit roles", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "user@example.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", email: "user@example.com", roles: ["web_app_user"] } as any);
    await expect(import("@/lib/rbac").then((m) => m.requireToolkitUser())).rejects.toThrow("Forbidden");
  });

  it("requireToolkitAdmin requires toolkit toolkit roles", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "padmin@example.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u2", email: "padmin@example.com", roles: ["toolkit_admin"] } as any);
    const session = await import("@/lib/rbac").then((m) => m.requireToolkitAdmin());
    expect(session.user.id).toBe("u2");
  });

  it("requireToolkitAdmin throws when user has toolkit_user role only", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "tuser@example.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u3", email: "tuser@example.com", roles: ["toolkit_user"] } as any);
    await expect(import("@/lib/rbac").then((m) => m.requireToolkitAdmin())).rejects.toThrow("Forbidden");
  });

  it("requireToolkitUser returns session for toolkit_user role", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "tuser@example.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u4", email: "tuser@example.com", roles: ["toolkit_user"] } as any);
    const session = await import("@/lib/rbac").then((m) => m.requireToolkitUser());
    expect(session.user.id).toBe("u4");
  });

  it("hasAnyRole and checkAdmin behave correctly", () => {
    expect(hasAnyRole({ roles: ["site_admin"] }, ["site_admin"])).toBe(true);
    expect(hasAnyRole(null, ["a"])).toBe(false);
    expect(hasAnyRole({ roles: [] }, ["a"])).toBe(false);
    expect(hasAnyRole({ roles: null }, ["a"])).toBe(false);
    expect(checkAdmin({ roles: ["web_app_admin"] })).toBe(true);
    expect(checkAdmin({ roles: ["web_app_user"] })).toBe(false);
    expect(checkAdmin(undefined)).toBe(false);
  });
});

describe("auditor predicates", () => {
  it("isAuditor returns true only for pure auditor users", async () => {
    const { isAuditor } = await import("@/lib/rbac");
    expect(isAuditor({ roles: ["web_app_auditor"] })).toBe(true);
    // Auditor alongside writer role → not blocked (writer wins)
    expect(isAuditor({ roles: ["web_app_auditor", "web_app_user"] })).toBe(false);
    expect(isAuditor({ roles: ["web_app_auditor", "web_app_admin"] })).toBe(false);
    expect(isAuditor({ roles: ["web_app_auditor", "site_admin"] })).toBe(false);
    expect(isAuditor({ roles: ["web_app_user"] })).toBe(false);
    expect(isAuditor({ roles: [] })).toBe(false);
    expect(isAuditor(null)).toBe(false);
    expect(isAuditor(undefined)).toBe(false);
    expect(isAuditor({ roles: null })).toBe(false);
  });

  it("canWriteWebApp returns true for writer roles only", async () => {
    const { canWriteWebApp } = await import("@/lib/rbac");
    expect(canWriteWebApp({ roles: ["site_admin"] })).toBe(true);
    expect(canWriteWebApp({ roles: ["web_app_admin"] })).toBe(true);
    expect(canWriteWebApp({ roles: ["web_app_user"] })).toBe(true);
    expect(canWriteWebApp({ roles: ["web_app_auditor"] })).toBe(false);
    expect(canWriteWebApp({ roles: ["toolkit_user"] })).toBe(false);
    expect(canWriteWebApp({ roles: [] })).toBe(false);
    expect(canWriteWebApp(null)).toBe(false);
    expect(canWriteWebApp(undefined)).toBe(false);
  });

  it("requireWebAppWriter throws Forbidden for auditor", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "aud@x.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-aud",
      email: "aud@x.com",
      roles: ["web_app_auditor"],
    } as any);
    await expect(import("@/lib/rbac").then((m) => m.requireWebAppWriter())).rejects.toThrow("Forbidden");
  });

  it("requireWebAppWriter returns session for writer", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "w@x.com" } } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-w",
      email: "w@x.com",
      roles: ["web_app_user"],
    } as any);
    const session = await import("@/lib/rbac").then((m) => m.requireWebAppWriter());
    expect(session.user.id).toBe("u-w");
  });
});
