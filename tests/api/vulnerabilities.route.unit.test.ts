import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  vulnerability: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  vulnerabilityHistory: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  $queryRawUnsafe: vi.fn(),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => ({ requireUser: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));

import { requireUser } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";

describe("vulnerabilities route scope handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue(undefined as never);
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