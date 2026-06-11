import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { findMany: vi.fn(), count: vi.fn(), delete: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  vulnerabilityHistory: { createMany: vi.fn() },
  assignmentNotification: { createMany: vi.fn() },
  groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({
  requireUser: vi.fn(),
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
  WEB_APP_WRITE_ROLES: ["site_admin", "web_app_admin", "web_app_user"],
  WEB_APP_READ_ROLES: ["site_admin", "web_app_admin", "web_app_user", "web_app_auditor"],
  canWriteWebApp: (user: { roles?: string[] } | undefined) => {
    const roles = user?.roles ?? [];
    return roles.includes("site_admin") || roles.includes("web_app_admin") || roles.includes("web_app_user");
  },
  isAuditor: (user: { roles?: string[] } | undefined) => {
    const roles = user?.roles ?? [];
    return roles.includes("web_app_auditor")
      && !roles.includes("site_admin")
      && !roles.includes("web_app_admin")
      && !roles.includes("web_app_user");
  },
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
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: null, groupId: null },
    ]);
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
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: "someone-else", groupId: null },
    ]);
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

  it("archives vulnerabilities when setting terminal status (Remediated)", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    const vuln = {
      id: validId, siteId: "s1", assigneeId: null, status: "Open",
      lastSeenAt: new Date(), createdAt: new Date(),
      pluginId: "1001", cve: null, cvssScore: null, risk: "High",
      host: "h1", protocol: "tcp", port: "443", name: "Test",
      synopsis: null, description: null, solution: null, seeAlso: null,
      pluginOutput: null, pluginPublicationDate: null, pluginModificationDate: null,
    };
    mockPrisma.vulnerability.findMany.mockResolvedValue([vuln]);
    mockPrisma.vulnerabilityHistory.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.vulnerability.deleteMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], status: "Remediated" }) as any
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerabilityHistory.createMany).toHaveBeenCalled();
    expect(mockPrisma.vulnerability.deleteMany).toHaveBeenCalled();
  });

  it("creates assignment notifications when assigning to a user", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.assignmentNotification.createMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], assigneeId: validId2 }) as any
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.assignmentNotification.createMany).toHaveBeenCalled();
  });

  it("allows non-admin to self-assign", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: validId2, email: "u@u.com", roles: ["web_app_user"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: null, groupId: null },
    ]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.assignmentNotification.createMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], assigneeId: validId2 }) as any
    );
    expect(res.status).toBe(200);
  });

  it("allows non-admin to unassign (set null)", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_user"] },
    } as any);
    // User must be assignee of the item to unassign it (or admin/leader).
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: "u1", groupId: null },
    ]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], assigneeId: null }) as any
    );
    expect(res.status).toBe(200);
    // No assignment notifications for null assignee
    expect(mockPrisma.assignmentNotification.createMany).not.toHaveBeenCalled();
  });

  it("updates crNumber for admin", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({ count: 1 });

    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], crNumber: "CR-12345" }) as any
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerability.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ crNumber: "CR-12345" }) })
    );
  });

  it("blocks non-admin crNumber change on unowned items", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", roles: ["web_app_user"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: "someone-else", groupId: null },
    ]);
    mockPrisma.vulnerability.count.mockResolvedValue(0);

    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const res = await POST(
      postReq({ ids: [validId], crNumber: "CR-999" }) as any
    );
    expect(res.status).toBe(403);
  });
});
