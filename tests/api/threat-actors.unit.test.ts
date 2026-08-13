import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  threatActor: { findMany: vi.fn(), count: vi.fn() },
  threatFeedMetadata: { findUnique: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/rbac", () => ({ requireAdmin: vi.fn() }));
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/threat-intelligence/actors", () => ({
  syncThreatActors: vi.fn(),
  ATTACK_FEED_ID: "MITRE_ATTACK",
}));

import { auth } from "../../auth";
import { requireAdmin } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";
import { syncThreatActors } from "../../lib/threat-intelligence/actors";

function get(url: string) {
  return new Request(url) as never;
}

beforeEach(() => {
  // resetAllMocks so a rejected requireAdmin in one test cannot leak forward.
  vi.resetAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "u1", roles: ["site_admin"] } } as never);
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1", roles: ["web_app_user"] } } as never);
  mockPrisma.threatActor.findMany.mockResolvedValue([]);
  mockPrisma.threatActor.count.mockResolvedValue(0);
  mockPrisma.threatFeedMetadata.findUnique.mockResolvedValue(null);
});

describe("/api/threat-intelligence/actors GET", () => {
  it("requires a session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    const res = await GET(get("http://localhost/api/threat-intelligence/actors"));
    expect(res.status).toBe(401);
  });

  it("returns actors, a total and the feed's last sync time", async () => {
    mockPrisma.threatActor.findMany.mockResolvedValue([{ id: "a1", name: "APT29" }]);
    mockPrisma.threatActor.count.mockResolvedValue(1);
    mockPrisma.threatFeedMetadata.findUnique.mockResolvedValue({
      lastSyncedAt: new Date("2026-08-13T00:00:00Z"),
    });

    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    const body = await (await GET(get("http://localhost/api/threat-intelligence/actors"))).json();

    expect(body.actors).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.lastSyncedAt).toBe("2026-08-13T00:00:00.000Z");
  });

  it("reports a null sync time when the feed has never run", async () => {
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    const body = await (await GET(get("http://localhost/api/threat-intelligence/actors"))).json();
    expect(body.lastSyncedAt).toBeNull();
  });

  it("searches name, aliases and external id together", async () => {
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    await GET(get("http://localhost/api/threat-intelligence/actors?q=cozy"));

    expect(mockPrisma.threatActor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: "cozy", mode: "insensitive" } },
            { aliases: { has: "cozy" } },
            { externalId: { contains: "cozy", mode: "insensitive" } },
          ],
        }),
      })
    );
  });

  it("omits the search clause entirely for a blank query", async () => {
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    await GET(get("http://localhost/api/threat-intelligence/actors?q=%20%20"));

    const where = mockPrisma.threatActor.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
  });

  it("applies the tactic, sector, region and type facets", async () => {
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    await GET(
      get(
        "http://localhost/api/threat-intelligence/actors?tactic=initial-access&sector=Finance&region=Europe&type=State-Sponsored"
      )
    );

    expect(mockPrisma.threatActor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tactics: { has: "initial-access" },
          targetSectors: { has: "Finance" },
          targetRegions: { has: "Europe" },
          actorType: "State-Sponsored",
        }),
      })
    );
  });

  it("counts against the same filter it lists with", async () => {
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    await GET(get("http://localhost/api/threat-intelligence/actors?type=Hacktivist"));

    const listWhere = mockPrisma.threatActor.findMany.mock.calls[0][0].where;
    const countWhere = mockPrisma.threatActor.count.mock.calls[0][0].where;
    expect(countWhere).toEqual(listWhere);
  });

  it.each([
    ["", 100],
    ["1", 1],
    ["500", 200],
    ["0", 1],
    ["-5", 1],
    // Junk must fall back to the default rather than reaching Prisma as NaN.
    ["abc", 100],
  ])("clamps limit=%s to %i", async (raw, expected) => {
    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    await GET(get(`http://localhost/api/threat-intelligence/actors?limit=${raw}`));
    expect(mockPrisma.threatActor.findMany.mock.calls[0][0].take).toBe(expected);
  });

  it("returns 500 without leaking the underlying error", async () => {
    mockPrisma.threatActor.findMany.mockRejectedValue(new Error("column does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { GET } = await import("../../app/api/threat-intelligence/actors/route");
    const res = await GET(get("http://localhost/api/threat-intelligence/actors"));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Internal Error");
  });
});

describe("/api/threat-intelligence/actors POST (manual refresh)", () => {
  it("is admin-gated", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("Forbidden"));
    const { POST } = await import("../../app/api/threat-intelligence/actors/route");
    await expect(POST(get("http://localhost/api/threat-intelligence/actors"))).rejects.toThrow("Forbidden");
    expect(syncThreatActors).not.toHaveBeenCalled();
  });

  it("is rate limited so the upstream feed cannot be hammered", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as never);
    const { POST } = await import("../../app/api/threat-intelligence/actors/route");
    const res = await POST(get("http://localhost/api/threat-intelligence/actors"));
    expect(res.status).toBe(429);
    expect(syncThreatActors).not.toHaveBeenCalled();
  });

  it("returns the sync result", async () => {
    vi.mocked(syncThreatActors).mockResolvedValue({ created: 2, updated: 174 } as never);
    const { POST } = await import("../../app/api/threat-intelligence/actors/route");
    const res = await POST(get("http://localhost/api/threat-intelligence/actors"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 2, updated: 174 });
  });

  it("reports 502 when the upstream feed fails", async () => {
    vi.mocked(syncThreatActors).mockRejectedValue(new Error("ENOTFOUND raw.githubusercontent.com"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("../../app/api/threat-intelligence/actors/route");
    const res = await POST(get("http://localhost/api/threat-intelligence/actors"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Sync failed");
  });
});
