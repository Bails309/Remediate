import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Import the handlers relatively so module resolution matches runtime
// Route module will be dynamically imported after mocks are set to ensure proper hoisting

// Mocks
const mockPrisma = {
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/rbac", () => ({ checkAdmin: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { auth } from "../../auth";
import { checkAdmin } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin users route (unit)", () => {
  it("returns 401 when not admin", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { GET } = await import("../../app/api/admin/users/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/users"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);

    const { GET } = await import("../../app/api/admin/users/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/users"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Too many requests");
  });

  it("GET returns users on success", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", email: "a@a" }] as any);

    const { GET } = await import("../../app/api/admin/users/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/users"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("PATCH returns 400 for invalid body", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    const { PATCH } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({}) });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required fields");
  });

  it("PATCH rejects invalid role", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    const { PATCH } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: "x", roles: ["invalid_role"] }) });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid role");
  });

  it("PATCH prevents removing last site_admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    // simulate adminCount <=1 and target user has site_admin
    mockPrisma.user.count.mockResolvedValue(1 as any);
    mockPrisma.user.findUnique.mockResolvedValue({ roles: ["site_admin"] } as any);

    const { PATCH } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: "admin", roles: ["web_app_user"] }) });
    const res = await PATCH(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Cannot remove last site admin");
  });

  it("DELETE returns 400 when missing userId", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    const { DELETE: DELETE_HANDLER } = await import("../../app/api/admin/users/route");
    const res = await DELETE_HANDLER(new Request("http://localhost/api/admin/users", { method: "DELETE", body: JSON.stringify({}) }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing userId");
  });

  it("DELETE returns 404 when user not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findUnique.mockResolvedValue(null as any);

    const { DELETE: DELETE_HANDLER } = await import("../../app/api/admin/users/route");
    const res = await DELETE_HANDLER(new Request("http://localhost/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: "x" }) }) as any);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("User not found");
  });

  it("DELETE prevents deleting last site admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findUnique.mockResolvedValue({ roles: ["site_admin"] } as any);
    mockPrisma.user.count.mockResolvedValue(1 as any);

    const { DELETE: DELETE_HANDLER } = await import("../../app/api/admin/users/route");
    const res = await DELETE_HANDLER(new Request("http://localhost/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: "u2" }) }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Cannot delete last site admin");
  });

  it("DELETE prevents deleting yourself", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "me" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findUnique.mockResolvedValue({ roles: [] } as any);

    const { DELETE: DELETE_HANDLER } = await import("../../app/api/admin/users/route");
    const res = await DELETE_HANDLER(new Request("http://localhost/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: "me" }) }) as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Cannot delete yourself");
  });

  it("DELETE deletes user on success", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findUnique.mockResolvedValue({ roles: [] } as any);
    mockPrisma.user.delete.mockResolvedValue({ id: "u-del" } as any);

    const { DELETE: DELETE_HANDLER } = await import("../../app/api/admin/users/route");
    const res = await DELETE_HANDLER(new Request("http://localhost/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: "u-del" }) }) as any);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it("DELETE succeeds for site_admin user when multiple admins exist", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "admin" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findUnique.mockResolvedValue({ roles: ["site_admin"] } as any);
    mockPrisma.user.count.mockResolvedValue(2 as any);
    mockPrisma.user.delete.mockResolvedValue({} as any);

    const { DELETE: DELETE_HANDLER } = await import("../../app/api/admin/users/route");
    const res = await DELETE_HANDLER(new Request("http://localhost/api/admin/users", { method: "DELETE", body: JSON.stringify({ userId: "other-admin" }) }) as any);
    expect(res.status).toBe(200);
  });

  it("GET returns 500 when prisma throws", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findMany.mockRejectedValue(new Error("DB connection lost"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await import("../../app/api/admin/users/route");
    const res = await GET(new NextRequest("http://localhost/api/admin/users"));
    expect(res.status).toBe(500);
    consoleSpy.mockRestore();
  });

  it("PATCH returns 403 when non-site_admin assigns site_admin role", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["web_app_admin"] } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    const { PATCH } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: "x", roles: ["site_admin"] }) });
    const res = await PATCH(req as any);
    expect(res.status).toBe(403);
  });

  it("PATCH returns 404 when target user not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findUnique.mockResolvedValue(null as any);

    const { PATCH } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: "missing", roles: ["web_app_user"] }) });
    const res = await PATCH(req as any);
    expect(res.status).toBe(404);
  });

  it("PATCH updates non-admin user role without transaction", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "a@a.com", roles: ["site_admin"] } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ roles: ["web_app_user"] } as any);
    mockPrisma.user.update.mockResolvedValue({ id: "u2", roles: ["web_app_user", "web_app_admin"] } as any);

    const { PATCH } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify({ userId: "u2", roles: ["web_app_admin"] }) });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
  });
});

describe("admin users POST route (unit)", () => {
  it("POST returns 401 when not admin", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    vi.mocked(checkAdmin).mockReturnValue(false as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("POST returns 429 when rate limited", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({}) });
    const res = await POST(req as any);
    expect(res.status).toBe(429);
  });

  it("POST returns 400 when missing email", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ roles: ["web_app_user"] }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing required fields");
  });

  it("POST returns 400 when user already exists", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" } as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ email: "existing@test.com", roles: ["web_app_user"] }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("User already exists");
  });

  it("POST returns 400 for invalid role", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findUnique.mockResolvedValue(null as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ email: "new@test.com", roles: ["hacker_role"] }) });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid role");
  });

  it("POST returns 403 when non-site_admin assigns privileged role", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["web_app_admin"] } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findUnique.mockResolvedValue(null as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ email: "new@test.com", roles: ["site_admin"] }) });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it("POST creates user successfully and adds web_app_user", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", email: "admin@a.com", roles: ["site_admin"] } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.user.findUnique.mockResolvedValue(null as any);
    mockPrisma.user.create.mockResolvedValue({ id: "new-u", email: "new@test.com", roles: ["web_app_admin", "web_app_user"] } as any);

    const { POST } = await import("../../app/api/admin/users/route");
    const req = new Request("http://localhost/api/admin/users", { method: "POST", body: JSON.stringify({ email: "new@test.com", roles: ["web_app_admin"] }) });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.email).toBe("new@test.com");
  });
});
