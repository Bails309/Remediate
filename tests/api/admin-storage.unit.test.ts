import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  storageConfig: { findUnique: vi.fn(), upsert: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/rbac", () => {
  const guard = vi.fn();
  return { requireAdmin: guard, requireSiteAdmin: guard };
});
vi.mock("../../lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("../../lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
  fingerprintSecret: vi.fn(() => "****abcd"),
}));

import { enforceRateLimit } from "../../lib/rate-limit";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: true } as any);
});

describe("/api/admin/storage", () => {
  describe("GET", () => {
    it("returns storage config with masked credentials", async () => {
      mockPrisma.storageConfig.findUnique.mockResolvedValue({
        provider: "AZURE",
        azureAuthMethod: "CONNECTION_STRING",
        azureConnectionStringEnc: "enc:connstr",
        azureAccountName: "myacct",
        azureAccountKeyEnc: null,
        azureSasTokenEnc: null,
        azureContainerName: "uploads",
      });

      const { GET } = await import("../../app/api/admin/storage/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.provider).toBe("AZURE");
      expect(body.azureConnectionStringMasked).toBe("********");
      expect(body.azureAccountName).toBe("myacct");
    });

    it("returns defaults when no config exists", async () => {
      mockPrisma.storageConfig.findUnique.mockResolvedValue(null);
      const { GET } = await import("../../app/api/admin/storage/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.provider).toBe("REDIS");
    });
  });

  describe("POST", () => {
    it("returns 429 when rate limited", async () => {
      vi.mocked(enforceRateLimit).mockResolvedValue({ allowed: false } as any);
      const { POST } = await import("../../app/api/admin/storage/route");
      const res = await POST(
        new Request("http://localhost/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({ provider: "REDIS" }),
        }) as any
      );
      expect(res.status).toBe(429);
    });

    it("encrypts new connection string", async () => {
      mockPrisma.storageConfig.findUnique.mockResolvedValue(null);
      mockPrisma.storageConfig.upsert.mockResolvedValue({ provider: "AZURE" });

      const { POST } = await import("../../app/api/admin/storage/route");
      const res = await POST(
        new Request("http://localhost/api/admin/storage", {
          method: "POST",
          body: JSON.stringify({
            provider: "AZURE",
            azureConnectionString: "DefaultEndpoints=...",
            azureContainerName: "uploads",
          }),
        }) as any
      );
      expect(res.status).toBe(200);
    });
  });
});
