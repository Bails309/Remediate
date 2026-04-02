import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}));

vi.mock("@/lib/redis", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}));

describe("/api/health GET", () => {
  it("returns 200 with ok:true when deps are healthy", async () => {
    const { GET } = await import("../../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.postgres).toBe("ok");
    expect(body.redis).toBe("ok");
  });
});
