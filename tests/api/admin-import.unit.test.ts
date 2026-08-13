import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockPrisma = {
  importConfig: { findUnique: vi.fn(), create: vi.fn(), upsert: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => {
  const guard = vi.fn();
  return { requireAdmin: guard, requireSiteAdmin: guard };
});
vi.mock("../../lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => vi.clearAllMocks());

describe("/api/admin/import GET", () => {
  it("returns existing config", async () => {
    mockPrisma.importConfig.findUnique.mockResolvedValue({
      id: "singleton",
      pluginGracePeriodDays: 30,
    });

    const { GET } = await import("../../app/api/admin/import/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pluginGracePeriodDays).toBe(30);
  });

  it("creates default config when none exists", async () => {
    mockPrisma.importConfig.findUnique.mockResolvedValue(null);
    mockPrisma.importConfig.create.mockResolvedValue({
      id: "singleton",
      pluginGracePeriodDays: 30,
    });

    const { GET } = await import("../../app/api/admin/import/route");
    const res = await GET();
    const data = await res.json();
    expect(data.pluginGracePeriodDays).toBe(30);
    expect(mockPrisma.importConfig.create).toHaveBeenCalled();
  });
});

describe("/api/admin/import POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/admin/import/route");
    const req = new NextRequest("http://localhost/api/admin/import", {
      method: "POST",
      body: JSON.stringify({ pluginGracePeriodDays: 14 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 for negative days", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const { POST } = await import("../../app/api/admin/import/route");
    const req = new NextRequest("http://localhost/api/admin/import", {
      method: "POST",
      body: JSON.stringify({ pluginGracePeriodDays: -5 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric days", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const { POST } = await import("../../app/api/admin/import/route");
    const req = new NextRequest("http://localhost/api/admin/import", {
      method: "POST",
      body: JSON.stringify({ pluginGracePeriodDays: "abc" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("upserts valid grace period", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    mockPrisma.importConfig.upsert.mockResolvedValue({
      id: "singleton",
      pluginGracePeriodDays: 14,
    });

    const { POST } = await import("../../app/api/admin/import/route");
    const req = new NextRequest("http://localhost/api/admin/import", {
      method: "POST",
      body: JSON.stringify({ pluginGracePeriodDays: 14 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.pluginGracePeriodDays).toBe(14);
  });

  it("returns 400 for malformed JSON body", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("../../app/api/admin/import/route");
    const req = new NextRequest("http://localhost/api/admin/import", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
    consoleSpy.mockRestore();
  });
});
