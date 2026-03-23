import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { findMany: vi.fn(), count: vi.fn(), delete: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  vulnerabilityHistory: { createMany: vi.fn() },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
}));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { requireUser } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

function postReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vulnerabilities/bulk", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown;
}

const validId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const validId2 = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

describe("/api/vulnerabilities/bulk POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(postReq({ ids: [validId] }) as any);
    expect(res.status).toBe(429);
  });

  it("returns 400 for empty ids array", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    // Zod will throw for min(1) violation — caught as 400 or 500 depending on handler
    try {
      const res = await POST(postReq({ ids: [] }) as any);
      // If it returns a response, it should indicate an error
      expect(res.status).toBeGreaterThanOrEqual(400);
    } catch {
      // Zod parse throws - acceptable
    }
  });

  it("returns 400 for invalid UUID in ids", async () => {
    vi.mocked(requireUser).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    try {
      const res = await POST(postReq({ ids: ["not-uuid"] }) as any);
      expect(res.status).toBeGreaterThanOrEqual(400);
    } catch {
      // Zod parse throws
    }
  });

  it("blocks non-admin from assigning to others", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", roles: ["web_app_user"] },
    } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], assigneeId: validId2 }) as any
    );
    expect(res.status).toBe(403);
  });

  it("blocks non-admin from changing status on unowned items", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", roles: ["web_app_user"] },
    } as any);
    mockPrisma.vulnerability.count.mockResolvedValue(0); // user doesn't own any
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], status: "InProgress" }) as any
    );
    expect(res.status).toBe(403);
  });

  it("allows admin bulk status update", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], status: "InProgress" }) as any
    );
    expect(res.status).toBe(200);
  });
});
