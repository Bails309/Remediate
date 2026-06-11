import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { findMany: vi.fn() },
  comment: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
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
  // Reset (not just clear) so queued mockResolvedValueOnce values from a
  // previous test cannot leak into the next one.
  vi.resetAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
  mockPrisma.groupMembership.findMany.mockResolvedValue([]);
});

const v1 = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const v2 = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";
const batchId = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33";
const invalidBatchId = "not-a-uuid";

function getReq(ids: string[]) {
  const url = `http://localhost/api/vulnerabilities/comment-batches?ids=${ids.join(",")}`;
  // The route uses request.nextUrl.searchParams — replicate that surface
  // on a plain Request without pulling in next/server internals.
  const req = new Request(url) as unknown as { nextUrl: URL };
  req.nextUrl = new URL(url);
  return req;
}

function patchReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vulnerabilities/comment-batches/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown;
}

function deleteReq() {
  return new Request("http://localhost/api/vulnerabilities/comment-batches/x", {
    method: "DELETE",
  }) as unknown;
}

describe("/api/vulnerabilities/comment-batches GET", () => {
  it("returns 400 for empty ids", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["site_admin"] },
    } as any);
    const { GET } = await import("../../app/api/vulnerabilities/comment-batches/route");
    const res = await GET(getReq([]) as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 when a selected vuln is not visible to non-admin", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_user"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: v1, groupId: "g1", assigneeId: "other" },
    ]);
    const { GET } = await import("../../app/api/vulnerabilities/comment-batches/route");
    const res = await GET(getReq([v1]) as any);
    expect(res.status).toBe(404);
  });

  it("returns empty list when no batchIds exist on selected vulns", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: v1, groupId: null, assigneeId: null },
    ]);
    mockPrisma.comment.findMany.mockResolvedValueOnce([]);
    const { GET } = await import("../../app/api/vulnerabilities/comment-batches/route");
    const res = await GET(getReq([v1]) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ batches: [] });
  });

  it("returns manageable batches for admin", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: v1, groupId: null, assigneeId: null },
      { id: v2, groupId: null, assigneeId: null },
    ]);
    // distinct batchIds
    mockPrisma.comment.findMany.mockResolvedValueOnce([{ batchId }]);
    // full batch rows
    mockPrisma.comment.findMany.mockResolvedValueOnce([
      {
        id: "c1",
        content: "hello",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        authorId: "someone",
        batchId,
        vulnerabilityId: v1,
        author: { name: "Author One", email: "auth@x.com" },
        vulnerability: { id: v1, groupId: null, assigneeId: null },
      },
      {
        id: "c2",
        content: "hello",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        authorId: "someone",
        batchId,
        vulnerabilityId: v2,
        author: { name: "Author One", email: "auth@x.com" },
        vulnerability: { id: v2, groupId: null, assigneeId: null },
      },
    ]);
    const { GET } = await import("../../app/api/vulnerabilities/comment-batches/route");
    const res = await GET(getReq([v1, v2]) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches).toHaveLength(1);
    expect(body.batches[0]).toMatchObject({
      batchId,
      content: "hello",
      authorName: "Author One",
      totalCount: 2,
      selectedCount: 2,
    });
  });

  it("hides batches the non-author/non-leader cannot manage", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_user"] },
    } as any);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: v1, groupId: null, assigneeId: "u1" }, // visible: self-assigned
    ]);
    mockPrisma.comment.findMany.mockResolvedValueOnce([{ batchId }]);
    mockPrisma.comment.findMany.mockResolvedValueOnce([
      {
        id: "c1",
        content: "by someone else",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        authorId: "other-author",
        batchId,
        vulnerabilityId: v1,
        author: { name: "Other", email: "other@x.com" },
        vulnerability: { id: v1, groupId: null, assigneeId: "u1" },
      },
    ]);
    const { GET } = await import("../../app/api/vulnerabilities/comment-batches/route");
    const res = await GET(getReq([v1]) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.batches).toEqual([]);
  });
});

describe("/api/vulnerabilities/comment-batches/[batchId] PATCH", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "x" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid batch id", async () => {
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "x" }) as any, {
      params: Promise.resolve({ batchId: invalidBatchId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for read-only auditor", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_auditor"] },
    } as any);
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "x" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty content", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["site_admin"] },
    } as any);
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when batch is empty", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.comment.findMany.mockResolvedValue([]);
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "edited" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when non-admin non-author non-leader tries to edit", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_user"] },
    } as any);
    mockPrisma.comment.findMany.mockResolvedValue([
      { id: "c1", authorId: "other", vulnerabilityId: v1, vulnerability: { groupId: null } },
    ]);
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "edited" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(404);
  });

  it("admin can edit any batch", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.comment.findMany.mockResolvedValue([
      { id: "c1", authorId: "other", vulnerabilityId: v1, vulnerability: { groupId: null } },
      { id: "c2", authorId: "other", vulnerabilityId: v2, vulnerability: { groupId: null } },
    ]);
    mockPrisma.comment.updateMany.mockResolvedValue({ count: 2 });
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "edited" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, updated: 2 });
  });

  it("author can edit own batch", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_user"] },
    } as any);
    mockPrisma.comment.findMany.mockResolvedValue([
      { id: "c1", authorId: "u1", vulnerabilityId: v1, vulnerability: { groupId: null } },
    ]);
    mockPrisma.comment.updateMany.mockResolvedValue({ count: 1 });
    const { PATCH } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await PATCH(patchReq({ content: "edited" }) as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(200);
  });
});

describe("/api/vulnerabilities/comment-batches/[batchId] DELETE", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { DELETE } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await DELETE(deleteReq() as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid batch id", async () => {
    const { DELETE } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await DELETE(deleteReq() as any, {
      params: Promise.resolve({ batchId: invalidBatchId }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 for read-only auditor", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["web_app_auditor"] },
    } as any);
    const { DELETE } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await DELETE(deleteReq() as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when batch is empty", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "u1", email: "u@u.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.comment.findMany.mockResolvedValue([]);
    const { DELETE } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await DELETE(deleteReq() as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(404);
  });

  it("admin can delete any batch", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "admin1", email: "a@a.com", roles: ["site_admin"] },
    } as any);
    mockPrisma.comment.findMany.mockResolvedValue([
      { id: "c1", authorId: "other", vulnerabilityId: v1, vulnerability: { groupId: null } },
    ]);
    mockPrisma.comment.deleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import("../../app/api/vulnerabilities/comment-batches/[batchId]/route");
    const res = await DELETE(deleteReq() as any, {
      params: Promise.resolve({ batchId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, deleted: 1 });
  });
});
