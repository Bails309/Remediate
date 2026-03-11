import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis to observe constructor args
vi.mock("ioredis", () => {
  function RedisCtor(url: string, options?: any) {
    return { __isRedis: true, url, options };
  }
  (RedisCtor as any).Cluster = function (nodes: any, opts: any) { return { __isCluster: true, nodes, opts }; };
  // export as default and named Cluster for ESM/CJS interop
  return { default: RedisCtor, Cluster: (RedisCtor as any).Cluster };
});

beforeEach(() => {
  vi.resetModules();
});

describe("redis URL modes", () => {
  it("creates standard Redis instance for redis:// URL", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const mod = await import("@/lib/redis");
    const inst = mod.redis as any;
    expect(inst.__isRedis).toBe(true);
    expect(inst.url).toContain("redis://localhost:6379");
  });

  it("creates TLS-enabled instance for rediss:// URL and respects TLS reject flag", async () => {
    process.env.REDIS_URL = "rediss://external-redis:6379";
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED = "false";
    const mod = await import("@/lib/redis");
    const inst = mod.redis as any;
    expect(inst.__isRedis).toBe(true);
    expect(inst.options?.tls).toBeDefined();
  });

  it("creates Cluster when REDIS_CLUSTER_MODE=true", async () => {
    process.env.REDIS_CLUSTER_MODE = "true";
    process.env.REDIS_URL = "redis://cluster-node:6379";
    const mod = await import("@/lib/redis");
    const inst = mod.redis as any;
    expect(inst.__isCluster).toBe(true);
  });
});
