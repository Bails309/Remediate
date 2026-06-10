import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  vulnerability: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  vulnerabilityHistory: { create: vi.fn() },
  assignmentNotification: { create: vi.fn(), createMany: vi.fn() },
  groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/audit-log", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "../../auth";

beforeEach(() => vi.clearAllMocks());

function patchReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/vulnerabilities/v1", {
    method: "PATCH",
    body: JSON.stringify(body),
  }) as unknown;
}

const adminUser = { id: "admin1", roles: ["site_admin", "web_app_user"] };
const stdUser = { id: "std1", roles: ["web_app_user"] };

const vuln = {
  id: "v1",
  assigneeId: null,
  siteId: "s1",
  status: "Open",
  crNumber: null,
  collaborators: [],
  lastSeenAt: new Date(),
  createdAt: new Date(),
  pluginId: "1",
  cve: null,
  cvssScore: null,
  risk: "Medium",
  host: "h",
  protocol: "tcp",
  port: "80",
  name: "n",
  synopsis: null,
  description: null,
  solution: null,
  seeAlso: null,
  pluginOutput: null,
  pluginPublicationDate: null,
  pluginModificationDate: null,
};

describe("vulnerabilities/[id] PATCH", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(patchReq({}) as any, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user not in DB", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "x@x.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(patchReq({}) as any, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when vulnerability not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(null);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(patchReq({}) as any, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid status enum", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(patchReq({ status: "INVALID" }) as any, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid assigneeId format", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(patchReq({ assigneeId: "not-a-uuid" }) as any, { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when assignee user not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(adminUser)   // lookup current user
      .mockResolvedValueOnce(null);       // lookup assignee — not found
    mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
    mockPrisma.vulnerability.update.mockResolvedValue(vuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(
      patchReq({ assigneeId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }) as any,
      { params: Promise.resolve({ id: "v1" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Assignee user not found");
  });

  it("returns 400 when collaborator users not found", async () => {
    const ownedVuln = { ...vuln, assigneeId: "admin1" };
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(ownedVuln);
    mockPrisma.user.findMany.mockResolvedValue([]);  // none found
    mockPrisma.vulnerability.update.mockResolvedValue(ownedVuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(
      patchReq({ collaboratorIds: ["b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"], askForHelp: true }) as any,
      { params: Promise.resolve({ id: "v1" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Some collaborator users not found");
  });

  it("blocks non-admin from assigning to others", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "s@s.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(stdUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(
      patchReq({ assigneeId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33" }) as any,
      { params: Promise.resolve({ id: "v1" }) }
    );
    expect(res.status).toBe(403);
  });

  it("requires CR number for InProgressWithCR status", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(
      patchReq({ status: "InProgressWithCR" }) as any,
      { params: Promise.resolve({ id: "v1" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("CR Number is required");
  });

  it("admin can update vulnerability to active status", async () => {
    const ownedVuln = { ...vuln, assigneeId: "admin1" };
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(ownedVuln);
    mockPrisma.vulnerability.update.mockResolvedValue({ ...ownedVuln, status: "InProgress" });
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(
      patchReq({ status: "InProgress" }) as any,
      { params: Promise.resolve({ id: "v1" }) }
    );
    expect(res.status).toBe(200);
  });

  it("admin can archive vulnerability with Remediated status", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@a.com" } } as any);
    mockPrisma.user.findUnique.mockResolvedValue(adminUser);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(vuln);
    mockPrisma.vulnerabilityHistory.create.mockResolvedValue({
      ...vuln, status: "Remediated", archivedAt: new Date(),
      assignee: { id: "admin1", name: "Admin" },
    });
    mockPrisma.vulnerability.delete.mockResolvedValue(vuln);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const res = await PATCH(
      patchReq({ status: "Remediated" }) as any,
      { params: Promise.resolve({ id: "v1" }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recordScope).toBe("archived");
  });
});

describe("/api/vulnerabilities/[id] GET", () => {
  const params = Promise.resolve({ id: "v1" });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { GET } = await import("../../app/api/vulnerabilities/[id]/route");
    const req = new Request("http://localhost/api/vulnerabilities/v1");
    const res = await GET(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 404 when vulnerability not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com", ...adminUser } } as any);
    mockPrisma.vulnerability.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/vulnerabilities/[id]/route");
    const req = new Request("http://localhost/api/vulnerabilities/v1");
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it("returns vulnerability with includes", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@b.com", ...adminUser } } as any);
    const fullVuln = {
      ...vuln,
      assignee: { id: "admin1", name: "Admin" },
      collaborators: [],
      site: { id: "s1", name: "Production" },
    };
    mockPrisma.vulnerability.findUnique.mockResolvedValue(fullVuln);

    const { GET } = await import("../../app/api/vulnerabilities/[id]/route");
    const req = new Request("http://localhost/api/vulnerabilities/v1");
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("v1");
    expect(data.site.name).toBe("Production");
  });
});
