import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryRaw = vi.hoisted(() => vi.fn());
const mockPing = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

vi.mock("@/lib/redis", () => ({
  redis: { ping: mockPing },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("/api/health GET", () => {
  it("returns 200 with ok:true when deps are healthy", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockPing.mockResolvedValue("PONG");
    const { GET } = await import("../../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.postgres).toBe("ok");
    expect(body.redis).toBe("ok");
  });

  it("returns 503 when postgres is unavailable", async () => {
    mockQueryRaw.mockRejectedValue(new Error("ECONNREFUSED"));
    mockPing.mockResolvedValue("PONG");
    const { GET } = await import("../../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.postgres).toBe("unavailable");
    expect(body.redis).toBe("ok");
  });

  it("returns 503 when redis is unavailable", async () => {
    mockQueryRaw.mockResolvedValue([1]);
    mockPing.mockRejectedValue(new Error("ECONNREFUSED"));
    const { GET } = await import("../../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.postgres).toBe("ok");
    expect(body.redis).toBe("unavailable");
  });

  it("reports redis degraded when ping returns non-PONG", async () => {
    mockQueryRaw.mockResolvedValue([1]);
    mockPing.mockResolvedValue("LOADING");
    const { GET } = await import("../../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redis).toBe("degraded");
  });
});
