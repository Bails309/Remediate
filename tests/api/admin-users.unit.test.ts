import { describe, it, expect, vi, beforeEach } from "vitest";

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
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);

    const { GET } = await import("../../app/api/admin/users/route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("Too many requests");
  });

  it("GET returns users on success", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    vi.mocked(checkAdmin).mockReturnValue(true as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);

    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", email: "a@a" }] as any);

    const { GET } = await import("../../app/api/admin/users/route");
    const res = await GET(new Request("http://localhost/api/admin/users"));
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
});
