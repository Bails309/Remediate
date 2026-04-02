import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  auditLog: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { auth } from "../../auth";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

describe("/api/admin/audit-log GET", () => {
  it("returns 401 for non-site_admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["web_app_user"] } } as any);
    const { GET } = await import("../../app/api/admin/audit-log/route");
    const res = await GET(new Request("http://localhost/api/admin/audit-log") as any);
    expect(res.status).toBe(401);
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { GET } = await import("../../app/api/admin/audit-log/route");
    const res = await GET(new Request("http://localhost/api/admin/audit-log") as any);
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["site_admin"] } } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { GET } = await import("../../app/api/admin/audit-log/route");
    const res = await GET(new Request("http://localhost/api/admin/audit-log") as any);
    expect(res.status).toBe(429);
  });

  it("returns paginated audit logs", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["site_admin"] } } as any);
    mockPrisma.auditLog.findMany.mockResolvedValue([{ id: "log1", action: "test" }]);
    mockPrisma.auditLog.count.mockResolvedValue(1);

    const { GET } = await import("../../app/api/admin/audit-log/route");
    const res = await GET(new Request("http://localhost/api/admin/audit-log?page=1&limit=10") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(10);
  });

  it("applies entityType and action filters", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["site_admin"] } } as any);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const { GET } = await import("../../app/api/admin/audit-log/route");
    await GET(new Request("http://localhost/api/admin/audit-log?entityType=User&action=user.created") as any);

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: "User",
          action: { contains: "user.created" },
        }),
      })
    );
  });

  it("clamps page and limit to valid ranges", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { roles: ["site_admin"] } } as any);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);

    const { GET } = await import("../../app/api/admin/audit-log/route");
    const res = await GET(new Request("http://localhost/api/admin/audit-log?page=-5&limit=999") as any);
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.limit).toBe(100);
  });
});
