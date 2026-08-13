import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockRedis } = vi.hoisted(() => ({
  mockPrisma: {
    vulnerability: { count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    threatActor: { findMany: vi.fn() },
    uploadHistory: { count: vi.fn(), groupBy: vi.fn() },
    site: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    group: { findMany: vi.fn() },
  },
  mockRedis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/redis", () => ({ redis: mockRedis }));

import { executeWidgetSpec } from "@/lib/dashboards/execute";
import { widgetSpecSchema } from "@/lib/dashboards/spec";

const admin = { userId: "u1", isAdmin: true, memberOf: [] };
const member = { userId: "u2", isAdmin: false, memberOf: ["g1"] };

beforeEach(() => {
  vi.resetAllMocks();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue("OK");
});

describe("executeWidgetSpec", () => {
  it("returns a single total when there is no grouping", async () => {
    mockPrisma.vulnerability.count.mockResolvedValue(42);
    const data = await executeWidgetSpec(widgetSpecSchema.parse({}), admin);
    expect(data.total).toBe(42);
    expect(data.rows).toEqual([]);
  });

  it("applies the group visibility wall for non-admins", async () => {
    mockPrisma.vulnerability.count.mockResolvedValue(3);
    await executeWidgetSpec(widgetSpecSchema.parse({}), member);

    const where = mockPrisma.vulnerability.count.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("groupId");
    expect(JSON.stringify(where)).toContain("g1");
  });

  it("does not apply a visibility wall for admins", async () => {
    mockPrisma.vulnerability.count.mockResolvedValue(9);
    await executeWidgetSpec(widgetSpecSchema.parse({}), admin);

    const where = mockPrisma.vulnerability.count.mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain("groupId");
  });

  it("groups vulnerabilities and sorts rows by value", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([
      { risk: "High", _count: { _all: 5 } },
      { risk: "Critical", _count: { _all: 8 } },
    ]);

    const data = await executeWidgetSpec(widgetSpecSchema.parse({ groupBy: "risk" }), admin);
    expect(data.rows).toEqual([
      { label: "Critical", value: 8 },
      { label: "High", value: 5 },
    ]);
    expect(data.total).toBe(13);
  });

  it("resolves bucket ids to names", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([{ siteId: "s1", _count: { _all: 4 } }]);
    mockPrisma.site.findMany.mockResolvedValue([{ id: "s1", name: "Mansfield" }]);

    const data = await executeWidgetSpec(widgetSpecSchema.parse({ groupBy: "site" }), admin);
    expect(data.rows).toEqual([{ label: "Mansfield", value: 4 }]);
  });

  it("counts threat actor array fields in memory", async () => {
    mockPrisma.threatActor.findMany.mockResolvedValue([
      { actorType: "State Sponsored", origin: "China", tactics: ["Execution", "Persistence"], targetSectors: [], targetRegions: [], targetTechnologies: [] },
      { actorType: "Cybercrime", origin: null, tactics: ["Execution"], targetSectors: [], targetRegions: [], targetTechnologies: [] },
    ]);

    const data = await executeWidgetSpec(
      widgetSpecSchema.parse({ source: "threatActors", groupBy: "tactic" }),
      admin
    );
    expect(data.rows[0]).toEqual({ label: "Execution", value: 2 });
  });

  it("marks results as truncated beyond the limit", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([
      { risk: "Critical", _count: { _all: 3 } },
      { risk: "High", _count: { _all: 2 } },
      { risk: "Low", _count: { _all: 1 } },
    ]);

    const data = await executeWidgetSpec(widgetSpecSchema.parse({ groupBy: "risk", limit: 2 }), admin);
    expect(data.rows).toHaveLength(2);
    expect(data.truncated).toBe(true);
  });

  it("serves a cached result without querying", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ total: 7, rows: [], truncated: false }));
    const data = await executeWidgetSpec(widgetSpecSchema.parse({}), admin);
    expect(data.total).toBe(7);
    expect(mockPrisma.vulnerability.count).not.toHaveBeenCalled();
  });

  it("caches under different keys per viewer scope", async () => {
    mockPrisma.vulnerability.count.mockResolvedValue(1);
    await executeWidgetSpec(widgetSpecSchema.parse({}), admin);
    await executeWidgetSpec(widgetSpecSchema.parse({}), member);

    const keys = mockRedis.set.mock.calls.map((call) => call[0]);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("omits the _avg selector unless the metric needs it", async () => {
    mockPrisma.vulnerability.groupBy.mockResolvedValue([]);
    await executeWidgetSpec(widgetSpecSchema.parse({ groupBy: "risk" }), admin);
    expect(mockPrisma.vulnerability.groupBy.mock.calls[0][0]).not.toHaveProperty("_avg");

    mockPrisma.vulnerability.groupBy.mockResolvedValue([]);
    await executeWidgetSpec(widgetSpecSchema.parse({ groupBy: "risk", metric: "avgCvss" }), member);
    expect(mockPrisma.vulnerability.groupBy.mock.calls[1][0]).toHaveProperty("_avg");
  });

  it("rejects an incoherent spec before touching the database", async () => {
    const spec = widgetSpecSchema.parse({ source: "uploads", metric: "avgCvss" });
    await expect(executeWidgetSpec(spec, admin)).rejects.toThrow(/Average CVSS/);
    expect(mockPrisma.uploadHistory.count).not.toHaveBeenCalled();
  });
});
