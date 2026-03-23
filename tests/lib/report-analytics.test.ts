import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { groupBy: vi.fn() },
  site: { findMany: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

beforeEach(() => vi.clearAllMocks());

describe("getWeeklyCriticalHighSummary", () => {
  it("returns totals for critical and high risks", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([
      { risk: "Critical", siteId: "s1", _count: { _all: 3 } },
      { risk: "High", siteId: "s1", _count: { _all: 7 } },
      { risk: "Critical", siteId: "s2", _count: { _all: 2 } },
    ]);
    mockPrisma.site.findMany.mockResolvedValue([
      { id: "s1", name: "Production" },
      { id: "s2", name: "Staging" },
    ]);

    const { getWeeklyCriticalHighSummary } = await import("../../lib/report-analytics");
    const result = await getWeeklyCriticalHighSummary();

    expect(result.totals.critical).toBe(5);
    expect(result.totals.high).toBe(7);
    expect(result.summary).toHaveLength(3);
    expect(result.summary[0].siteName).toBe("Production");
  });

  it("returns zero totals when no data", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([]);
    mockPrisma.site.findMany.mockResolvedValue([]);

    const { getWeeklyCriticalHighSummary } = await import("../../lib/report-analytics");
    const result = await getWeeklyCriticalHighSummary();

    expect(result.totals).toEqual({ critical: 0, high: 0 });
    expect(result.summary).toHaveLength(0);
  });

  it("uses siteId as fallback name when site not found", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([
      { risk: "Critical", siteId: "unknown-id", _count: { _all: 1 } },
    ]);
    mockPrisma.site.findMany.mockResolvedValue([]);

    const { getWeeklyCriticalHighSummary } = await import("../../lib/report-analytics");
    const result = await getWeeklyCriticalHighSummary();

    expect(result.summary[0].siteName).toBe("unknown-id");
  });
});
