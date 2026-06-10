import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma: any = {
  user: {
    findUnique: vi.fn(),
  },
  vulnerability: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
  },
  assignmentNotification: {
    create: vi.fn(),
    createMany: vi.fn(),
  },
  vulnerabilityHistory: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    createMany: vi.fn(),
  },
  groupMembership: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  $transaction: vi.fn(async (arg: any) => {
    if (typeof arg === "function") return await arg(mockPrisma);
    return Promise.all(arg);
  }),
  $queryRawUnsafe: vi.fn(),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({ requireUser: vi.fn(), WEB_APP_ADMIN_ROLES: ["site_admin", "web_app_admin"] }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { requireUser } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";
import { auth } from "@/auth";

describe("vulnerabilities route scope handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      user: { id: "scope-test-user", email: "s@e.com", roles: ["site_admin"] },
    } as never);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as never);
  });

  it("queries active vulnerabilities by default", async () => {
    mockPrisma.vulnerability.count.mockResolvedValue(1);
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      {
        id: "v1",
        name: "Active finding",
        host: "host-1",
        port: "443",
        pluginId: "1001",
        cve: null,
        risk: "High",
        status: "Open",
        lastSeenAt: new Date("2026-03-12T00:00:00.000Z"),
        assigneeId: null,
        assignee: null,
        askForHelp: false,
        collaborators: [],
      },
    ]);

    const { GET } = await import("../../app/api/vulnerabilities/route");
    const res = await GET(new Request("http://localhost/api/vulnerabilities") as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerability.count).toHaveBeenCalledTimes(1);
    expect(mockPrisma.vulnerabilityHistory.count).not.toHaveBeenCalled();
    expect(body.scope).toBe("active");
    expect(body.items[0].recordScope).toBe("active");
  });

  it("queries archived vulnerability history when scope=archived", async () => {
    mockPrisma.vulnerabilityHistory.count.mockResolvedValue(1);
    mockPrisma.vulnerabilityHistory.findMany.mockResolvedValue([
      {
        id: "vh1",
        name: "Archived finding",
        host: "host-2",
        port: "443",
        pluginId: "2002",
        cve: null,
        risk: "Low",
        status: "Remediated",
        lastSeenAt: new Date("2026-03-11T00:00:00.000Z"),
        archivedAt: new Date("2026-03-12T00:00:00.000Z"),
        assigneeId: null,
        assignee: null,
      },
    ]);

    const { GET } = await import("../../app/api/vulnerabilities/route");
    const res = await GET(new Request("http://localhost/api/vulnerabilities?scope=archived&status=Remediated") as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerabilityHistory.count).toHaveBeenCalledTimes(1);
    expect(mockPrisma.vulnerability.findMany).not.toHaveBeenCalled();
    expect(body.scope).toBe("archived");
    expect(body.items[0]).toEqual(
      expect.objectContaining({
        recordScope: "archived",
        askForHelp: false,
        collaborators: [],
        status: "Remediated",
      })
    );
  });

  it("applies archived date range filters to archived history queries", async () => {
    mockPrisma.vulnerabilityHistory.count.mockResolvedValue(0);
    mockPrisma.vulnerabilityHistory.findMany.mockResolvedValue([]);

    const { GET } = await import("../../app/api/vulnerabilities/route");
    const res = await GET(
      new Request("http://localhost/api/vulnerabilities?scope=archived&archivedFrom=2026-03-01&archivedTo=2026-03-12") as never
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerabilityHistory.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: {
            gte: new Date("2026-03-01T00:00:00.000Z"),
            lte: new Date("2026-03-12T23:59:59.999Z"),
          },
        }),
      })
    );
    expect(body.scope).toBe("archived");
  });
});

const MOCK_USER_ID = "00000000-0000-4000-a000-000000000001";
const MOCK_PEER_ID = "00000000-0000-4000-a000-000000000003";
const MOCK_VULN_ID = "00000000-0000-4000-a000-000000000004";

describe("vulnerabilities RBAC Enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({ user: { id: MOCK_USER_ID, email: "u1@e.com", roles: ["standard_user"] } } as any);
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(auth).mockResolvedValue({ user: { id: MOCK_USER_ID, email: "u1@e.com", roles: ["standard_user"] } } as any);
    mockPrisma.user.findUnique.mockResolvedValue({ id: MOCK_USER_ID, email: "u1@e.com", roles: ["standard_user"] });
  });

  async function callPatch(id: string, body: any, user: any = { id: MOCK_USER_ID, email: "u1@e.com", roles: ["standard_user"] }) {
    vi.mocked(requireUser).mockResolvedValue({ user } as any);
    vi.mocked(auth).mockResolvedValue({ user } as any);
    const { PATCH } = await import("../../app/api/vulnerabilities/[id]/route");
    const req = new Request(`http://localhost/api/vulnerabilities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return await PATCH(req as any, { params: { id } } as any);
  }

  async function callBulk(body: any, user: any = { id: MOCK_USER_ID, email: "u1@e.com", roles: ["standard_user"] }) {
    vi.mocked(requireUser).mockResolvedValue({ user } as any);
    vi.mocked(auth).mockResolvedValue({ user } as any);
    const { POST } = await import("../../app/api/vulnerabilities/bulk/route");
    const req = new Request(`http://localhost/api/vulnerabilities/bulk`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return await POST(req as any);
  }

  it("allows standard user to self-assign (id route)", async () => {
    mockPrisma.vulnerability.findUnique.mockResolvedValue({ id: MOCK_VULN_ID, assigneeId: null });
    mockPrisma.vulnerability.update.mockResolvedValue({ id: MOCK_VULN_ID });

    const res = await callPatch(MOCK_VULN_ID, { assigneeId: MOCK_USER_ID });
    expect(res.status).toBe(200);
  });

  it("forbids peer assignment (id route)", async () => {
    mockPrisma.vulnerability.findUnique.mockResolvedValue({ id: MOCK_VULN_ID, assigneeId: null });

    const res = await callPatch(MOCK_VULN_ID, { assigneeId: MOCK_PEER_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("assign to yourself");
  });

  it("bulk update supports crNumber", async () => {
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: MOCK_VULN_ID, assigneeId: MOCK_USER_ID, groupId: null },
    ]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.vulnerability.count.mockResolvedValue(1);

    const res = await callBulk({ ids: [MOCK_VULN_ID], status: "InProgressWithCR", crNumber: "CR-999" });
    expect(res.status).toBe(200);
    expect(mockPrisma.vulnerability.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ crNumber: "CR-999" })
    }));
  });

  it("bulk update enforces ownership for metadata changes", async () => {
    mockPrisma.vulnerability.findMany.mockResolvedValue([
      { id: MOCK_VULN_ID, assigneeId: MOCK_USER_ID, groupId: null },
      { id: "00000000-0000-4000-a000-000000000005", assigneeId: MOCK_PEER_ID, groupId: null },
    ]);
    mockPrisma.vulnerability.count.mockResolvedValue(1); // Only 1 owned but 2 requested

    const res = await callBulk({ ids: [MOCK_VULN_ID, "00000000-0000-4000-a000-000000000005"], status: "InProgress" });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("take ownership");
  });
});
