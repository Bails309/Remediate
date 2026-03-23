import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  threatVulnerability: { findMany: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../auth", () => ({ auth: vi.fn() }));

import { auth } from "../../auth";

beforeEach(() => vi.clearAllMocks());

describe("/api/threat-intelligence/feed GET", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);
    const { GET } = await import("../../app/api/threat-intelligence/feed/route");
    const res = await GET(new Request("http://localhost/api/threat-intelligence/feed"));
    expect(res.status).toBe(401);
  });

  it("returns feed with default limit", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
    mockPrisma.threatVulnerability.findMany.mockResolvedValue(items);

    const { GET } = await import("../../app/api/threat-intelligence/feed/route");
    const res = await GET(new Request("http://localhost/api/threat-intelligence/feed"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(10);
    expect(mockPrisma.threatVulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });

  it("caps limit at 100", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockPrisma.threatVulnerability.findMany.mockResolvedValue([]);

    const { GET } = await import("../../app/api/threat-intelligence/feed/route");
    const res = await GET(new Request("http://localhost/api/threat-intelligence/feed?limit=9999"));
    expect(res.status).toBe(200);
    expect(mockPrisma.threatVulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("floors limit at 1", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockPrisma.threatVulnerability.findMany.mockResolvedValue([]);

    const { GET } = await import("../../app/api/threat-intelligence/feed/route");
    const res = await GET(new Request("http://localhost/api/threat-intelligence/feed?limit=-5"));
    expect(res.status).toBe(200);
    expect(mockPrisma.threatVulnerability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 })
    );
  });
});
