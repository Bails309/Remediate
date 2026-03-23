import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  uploadHistory: { findMany: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({ requireUser: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

describe("/api/uploads/history GET", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { GET } = await import("../../app/api/uploads/history/route");
    const res = await GET(new Request("http://localhost/api/uploads/history") as any);
    expect(res.status).toBe(429);
  });

  it("returns upload history", async () => {
    mockPrisma.uploadHistory.findMany.mockResolvedValue([
      { id: "h1", uploadDate: new Date(), site: { name: "s1" }, uploader: { name: "u1" } },
    ]);
    const { GET } = await import("../../app/api/uploads/history/route");
    const res = await GET(new Request("http://localhost/api/uploads/history") as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });
});
