import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
  comment: { findMany: vi.fn() },
  uploadHistory: { findMany: vi.fn() },
  pentestExecution: { findMany: vi.fn() },
  vulnerability: { findMany: vi.fn(), updateMany: vi.fn() },
  threatSubscription: { findUnique: vi.fn() },
  $transaction: vi.fn((actions: unknown[]) => Promise.all(actions)),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/audit-log", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "../../auth";

beforeEach(() => {
  vi.clearAllMocks();
});

const session = { user: { id: "u1", email: "user@test.com", roles: ["web_app_user"] } };

describe("/api/account GET (SAR export)", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { GET } = await import("../../app/api/account/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 when user not in database", async () => {
    vi.mocked(auth).mockResolvedValue(session as any);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.comment.findMany.mockResolvedValue([]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([]);
    mockPrisma.pentestExecution.findMany.mockResolvedValue([]);
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.threatSubscription.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/account/route");
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("exports user data on success", async () => {
    vi.mocked(auth).mockResolvedValue(session as any);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "user@test.com", name: "User" });
    mockPrisma.comment.findMany.mockResolvedValue([{ id: "c1" }]);
    mockPrisma.uploadHistory.findMany.mockResolvedValue([]);
    mockPrisma.pentestExecution.findMany.mockResolvedValue([]);
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.threatSubscription.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/account/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user.id).toBe("u1");
    expect(body.exportDate).toBeDefined();
    expect(body.comments).toHaveLength(1);
  });
});

describe("/api/account DELETE (self-delete)", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { DELETE } = await import("../../app/api/account/route");
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 404 when user not in database", async () => {
    vi.mocked(auth).mockResolvedValue(session as any);
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const { DELETE } = await import("../../app/api/account/route");
    const res = await DELETE();
    expect(res.status).toBe(404);
  });

  it("prevents last site_admin from deleting themselves", async () => {
    const adminSession = { user: { id: "u1", email: "admin@test.com", roles: ["site_admin"] } };
    vi.mocked(auth).mockResolvedValue(adminSession as any);
    mockPrisma.user.findUnique.mockResolvedValue({ roles: ["site_admin"] });
    mockPrisma.user.count.mockResolvedValue(1);

    const { DELETE } = await import("../../app/api/account/route");
    const res = await DELETE();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("last site admin");
  });

  it("deletes user and returns success", async () => {
    vi.mocked(auth).mockResolvedValue(session as any);
    mockPrisma.user.findUnique.mockResolvedValue({ roles: ["web_app_user"] });
    mockPrisma.vulnerability.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.user.delete.mockResolvedValue({ id: "u1" });

    const { DELETE } = await import("../../app/api/account/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
