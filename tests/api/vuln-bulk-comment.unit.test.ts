import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { findMany: vi.fn() },
  comment: { createMany: vi.fn() },
  groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
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
  mockPrisma.groupMembership.findMany.mockResolvedValue([]);
  mockPrisma.comment.createMany.mockResolvedValue({ count: 0 });
});

const validId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const validId2 = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

function postReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vulnerabilities/bulk-comment", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown;
}

describe("/api/vulnerabilities/bulk-comment POST", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "hi" }) as any);
    expect(res.status).toBe(429);
  });

  it("returns 403 for read-only auditor", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["web_app_auditor"] },
    } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "hi" }) as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty ids array", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [], content: "hi" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty content", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid uuid", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: ["not-uuid"], content: "hi" }) as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 when a vuln is not visible to non-admin", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["web_app_user"] },
    } as any);
    // User has no membership, vuln belongs to a group and is not assigned/help — not visible.
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      {
        id: validId,
        assigneeId: "other",
        groupId: "g1",
        askForHelp: false,
        collaborators: [],
      },
    ]);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "hi" }) as any);
    expect(res.status).toBe(404);
  });

  it("returns 403 when user cannot comment on at least one item", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["web_app_user"] },
    } as any);
    // Vuln has no group, visible to all, but user is not the assignee → cannot comment.
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      {
        id: validId,
        assigneeId: "other",
        groupId: null,
        askForHelp: false,
        collaborators: [],
      },
    ]);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "hi" }) as any);
    expect(res.status).toBe(403);
  });

  it("returns ok with 0 when no victims found", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "hi" }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, created: 0 });
  });

  it("creates comments for admin on multiple items and returns batchId", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin1", email: "admin@example.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: null, groupId: null, askForHelp: false, collaborators: [] },
      { id: validId2, assigneeId: null, groupId: null, askForHelp: false, collaborators: [] },
    ]);
    mockPrisma.comment.createMany.mockResolvedValue({ count: 2 });
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId, validId2], content: "hello" }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(2);
    expect(typeof body.batchId).toBe("string");
    expect(body.batchId.length).toBeGreaterThan(0);
    expect(mockPrisma.comment.createMany).toHaveBeenCalledTimes(1);
    const call = mockPrisma.comment.createMany.mock.calls[0][0] as { data: any[] };
    expect(call.data).toHaveLength(2);
    expect(call.data[0].batchId).toBe(body.batchId);
    expect(call.data[0].authorId).toBe("admin1");
    expect(call.data[0].content).toBe("hello");
    expect(call.data[0].isPrivate).toBe(true);
  });

  it("respects explicit isPrivate=false", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin1", email: "admin@example.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: null, groupId: null, askForHelp: false, collaborators: [] },
    ]);
    mockPrisma.comment.createMany.mockResolvedValue({ count: 1 });
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "x", isPrivate: false }) as any);
    expect(res.status).toBe(200);
    const call = mockPrisma.comment.createMany.mock.calls[0][0] as { data: any[] };
    expect(call.data[0].isPrivate).toBe(false);
  });

  it("allows assignee (non-admin) to comment on own vuln", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@example.com", roles: ["web_app_user"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: validId, assigneeId: "u1", groupId: null, askForHelp: false, collaborators: [] },
    ]);
    mockPrisma.comment.createMany.mockResolvedValue({ count: 1 });
    const { POST } = await import("../../app/api/vulnerabilities/bulk-comment/route");
    const res = await POST(postReq({ ids: [validId], content: "self note" }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
  });
});
