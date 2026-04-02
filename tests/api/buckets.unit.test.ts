import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  site: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { requireUser, requireAdmin } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
  vi.mocked(requireUser).mockResolvedValue({ user: { id: "u1" } } as any);
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
});

describe("/api/buckets GET", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { GET } = await import("../../app/api/buckets/route");
    const res = await GET(new Request("http://localhost/api/buckets") as any);
    expect(res.status).toBe(429);
  });

  it("returns sites list", async () => {
    mockPrisma.site.findMany.mockResolvedValue([{ id: "s1", name: "Bucket A" }]);
    const { GET } = await import("../../app/api/buckets/route");
    const res = await GET(new Request("http://localhost/api/buckets") as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Bucket A");
  });
});

describe("/api/buckets POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/buckets/route");
    const req = new Request("http://localhost/api/buckets", {
      method: "POST",
      body: JSON.stringify({ name: "New Bucket" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(429);
  });

  it("returns 400 for name shorter than 2 chars", async () => {
    const { POST } = await import("../../app/api/buckets/route");
    const req = new Request("http://localhost/api/buckets", {
      method: "POST",
      body: JSON.stringify({ name: "X" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing name", async () => {
    const { POST } = await import("../../app/api/buckets/route");
    const req = new Request("http://localhost/api/buckets", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("creates bucket on valid input", async () => {
    mockPrisma.site.create.mockResolvedValue({ id: "s2", name: "New Bucket" });
    const { POST } = await import("../../app/api/buckets/route");
    const req = new Request("http://localhost/api/buckets", {
      method: "POST",
      body: JSON.stringify({ name: "New Bucket" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("New Bucket");
  });
});
