import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = {
  site: { update: vi.fn(), delete: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("../../lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => vi.clearAllMocks());

const bucketId = "b1";
const params = Promise.resolve({ bucketId });

function makeRequest(method: string, body?: object) {
  return new NextRequest(`http://localhost/api/buckets/${bucketId}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
}

describe("/api/buckets/[bucketId] PUT", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { PUT } = await import("../../app/api/buckets/[bucketId]/route");
    const res = await PUT(makeRequest("PUT", { name: "Test" }), { params });
    expect(res.status).toBe(429);
  });

  it("updates bucket with valid payload", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const bucket = { id: bucketId, name: "Updated" };
    mockPrisma.site.update.mockResolvedValue(bucket);

    const { PUT } = await import("../../app/api/buckets/[bucketId]/route");
    const res = await PUT(makeRequest("PUT", { name: "Updated" }), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Updated");
    expect(mockPrisma.site.update).toHaveBeenCalledWith({
      where: { id: bucketId },
      data: expect.objectContaining({ name: "Updated" }),
    });
  });

  it("rejects name shorter than 2 chars", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const { PUT } = await import("../../app/api/buckets/[bucketId]/route");
    // Zod.parse throws on invalid input
    await expect(
      PUT(makeRequest("PUT", { name: "X" }), { params })
    ).rejects.toThrow();
  });

  it("rejects invalid regex in importPattern", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const { PUT } = await import("../../app/api/buckets/[bucketId]/route");
    await expect(
      PUT(makeRequest("PUT", { name: "Test", importPattern: "[invalid" }), { params })
    ).rejects.toThrow();
  });

  it("accepts valid importPattern and importAliases", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const bucket = { id: bucketId, name: "Test", importPattern: "^prod-.*", importAliases: ["prod", "production"] };
    mockPrisma.site.update.mockResolvedValue(bucket);

    const { PUT } = await import("../../app/api/buckets/[bucketId]/route");
    const res = await PUT(makeRequest("PUT", {
      name: "Test",
      importPattern: "^prod-.*",
      importAliases: ["prod", "production"],
    }), { params });
    expect(res.status).toBe(200);
  });
});

describe("/api/buckets/[bucketId] DELETE", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { DELETE } = await import("../../app/api/buckets/[bucketId]/route");
    const res = await DELETE(makeRequest("DELETE"), { params });
    expect(res.status).toBe(429);
  });

  it("deletes bucket successfully", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.site.delete.mockResolvedValue({ id: bucketId });

    const { DELETE } = await import("../../app/api/buckets/[bucketId]/route");
    const res = await DELETE(makeRequest("DELETE"), { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 500 when delete fails", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.site.delete.mockRejectedValue(new Error("FK constraint"));

    const { DELETE } = await import("../../app/api/buckets/[bucketId]/route");
    const res = await DELETE(makeRequest("DELETE"), { params });
    expect(res.status).toBe(500);
  });
});
