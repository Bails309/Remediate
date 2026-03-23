import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { groupBy: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({ requireUser: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true, remaining: 100, resetSeconds: 60 } as any);
});

describe("/api/analytics GET", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false, remaining: 0, resetSeconds: 30 } as any);
    const { GET } = await import("../../app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics") as any);
    expect(res.status).toBe(429);
  });

  it("returns grouped data without siteId", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([
      { risk: "Critical", _count: { _all: 5 } },
    ]);
    const { GET } = await import("../../app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
  });

  it("returns 400 for invalid siteId UUID", async () => {
    const { GET } = await import("../../app/api/analytics/route");
    const res = await GET(new Request("http://localhost/api/analytics?siteId=not-a-uuid") as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid siteId");
  });

  it("accepts valid UUID siteId", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([]);
    const { GET } = await import("../../app/api/analytics/route");
    const res = await GET(
      new Request("http://localhost/api/analytics?siteId=a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11") as any
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerability.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          siteId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        }),
      })
    );
  });
});
