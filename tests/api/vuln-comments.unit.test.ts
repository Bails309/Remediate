import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  user: { findUnique: vi.fn() },
  vulnerability: { findUnique: vi.fn() },
  comment: { findMany: vi.fn(), create: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/rbac", () => ({
  WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"],
}));

import { auth } from "../../auth";

beforeEach(() => vi.clearAllMocks());

const adminUser = { id: "admin1", roles: ["site_admin"] };
const vuln = { id: "v1", assigneeId: "std1", askForHelp: false, collaborators: [] };

function postReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vulnerabilities/v1/comments", {
    method: "POST",
    body: JSON.stringify(body),
  }) as unknown;
}

describe("vulnerabilities/[id]/comments", () => {
  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);
      const { GET } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 404 when user not in DB", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { email: "x@x.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const { GET } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(404);
    });

    it("returns 404 when vulnerability not found", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      mockPrisma.vulnerability.findUnique.mockResolvedValue(null);
      const { GET } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(404);
    });

    it("returns comments for admin", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
      mockPrisma.comment.findMany.mockResolvedValue([{ id: "c1", content: "test" }]);
      const { GET } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await GET(new Request("http://localhost") as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);
      const { POST } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await POST(postReq({ content: "hi" }) as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 400 when content is empty", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      const { POST } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await POST(postReq({ content: "" }) as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 400 when content exceeds 10000 chars", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      const { POST } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await POST(postReq({ content: "x".repeat(10001) }) as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 403 when non-admin non-assignee non-collaborator", async () => {
      const otherUser = { id: "other1", roles: ["web_app_user"] };
      vi.mocked(auth).mockResolvedValue({ user: { email: "o@o.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(otherUser);
      mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
      const { POST } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await POST(postReq({ content: "hello" }) as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(403);
    });

    it("allows admin to post comment", async () => {
      vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
      mockPrisma.user.findUnique.mockResolvedValue(adminUser);
      mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
      mockPrisma.comment.create.mockResolvedValue({ id: "c2", content: "hello", authorId: "admin1" });
      const { POST } = await import("../../app/api/vulnerabilities/[id]/comments/route");
      const res = await POST(postReq({ content: "hello" }) as any, { params: Promise.resolve({ id: "v1" }) });
      expect(res.status).toBe(200);
    });
  });
});
