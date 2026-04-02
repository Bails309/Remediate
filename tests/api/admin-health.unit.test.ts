import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  vulnerability: { count: vi.fn() },
  storageConfig: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
};

const mockRedis = {
  ping: vi.fn(),
  info: vi.fn(),
  get: vi.fn(),
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/redis", () => ({ redis: mockRedis }));
vi.mock("../../lib/rbac", () => ({
  requireAdmin: vi.fn(),
}));
vi.mock("../../lib/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Mock fs and path (imported in route)
vi.mock("fs", () => ({ default: {} }));
vi.mock("path", () => ({ default: { join: vi.fn() } }));

// Mock global fetch for toolkit health check
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { requireAdmin } from "../../lib/rbac";
import { enforceRateLimit } from "../../lib/rate-limit";
import { NextRequest } from "next/server";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PENTEST_BACKEND_URL;
});

function makeRequest() {
  return new NextRequest("http://localhost/api/admin/health", { method: "GET" });
}

describe("/api/admin/health GET", () => {
  it("returns 429 when rate limited", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns 401 when not admin", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockRejectedValue(new Error("Not admin"));
    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns healthy status when all services up", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:5MB");
    mockRedis.get.mockResolvedValue(String(Date.now()));
    mockPrisma.vulnerability.count.mockResolvedValue(10);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.database.status).toBe("Healthy");
    expect(data.redis.status).toBe("Healthy");
    expect(data.redis.memory).toBe("5MB");
    expect(data.worker.status).toBe("Healthy");
    expect(data.toolkitBackend.status).toBe("Not configured");
    expect(data.schema.status).toBe("Healthy");
    expect(data.storage.provider).toBe("REDIS");
  });

  it("marks DB unhealthy on query failure", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    mockPrisma.$queryRaw.mockRejectedValue(new Error("DB down"));
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:2MB");
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.database.status).toBe("Unhealthy");
    expect(data.worker.status).toBe("No heartbeat");
  });

  it("marks Redis unhealthy on ping failure", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockRejectedValue(new Error("Redis down"));
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.redis.status).toBe("Unhealthy");
  });

  it("checks toolkit backend health when configured", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    process.env.PENTEST_BACKEND_URL = "http://toolkit:4000";
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:1MB");
    mockRedis.get.mockResolvedValue(String(Date.now()));
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);
    mockFetch.mockResolvedValue({ ok: true });

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.toolkitBackend.status).toBe("Healthy");
  });

  it("reports stale worker heartbeat", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:2MB");
    // heartbeat from 60 seconds ago
    mockRedis.get.mockResolvedValue(String(Date.now() - 60_000));
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.worker.status).toMatch(/^Stale/);
  });

  it("reports toolkit backend unhealthy when fetch throws", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    process.env.PENTEST_BACKEND_URL = "http://toolkit:4000";
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:1MB");
    mockRedis.get.mockResolvedValue(String(Date.now()));
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);
    mockFetch.mockRejectedValue(new Error("Connection refused"));

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.toolkitBackend.status).toBe("Unhealthy");
  });

  it("reports toolkit backend unhealthy status code", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    process.env.PENTEST_BACKEND_URL = "http://toolkit:4000";
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:1MB");
    mockRedis.get.mockResolvedValue(String(Date.now()));
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.toolkitBackend.status).toBe("Unhealthy (503)");
  });

  it("reports schema out of sync when count throws", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("used_memory_human:1MB");
    mockRedis.get.mockResolvedValue(String(Date.now()));
    mockPrisma.vulnerability.count.mockRejectedValue(new Error("Table not found"));
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.schema.status).toBe("Out of sync");
  });

  it("reports redis memory when no match found", async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockRedis.ping.mockResolvedValue("PONG");
    mockRedis.info.mockResolvedValue("some_other_info:value"); // no used_memory_human match
    mockRedis.get.mockResolvedValue(String(Date.now()));
    mockPrisma.vulnerability.count.mockResolvedValue(0);
    mockPrisma.storageConfig.findUnique.mockResolvedValue(null);

    const { GET } = await import("../../app/api/admin/health/route");
    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.redis.memory).toBe("0MB");
  });
});
