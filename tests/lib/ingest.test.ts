import { vi, describe, it, expect, beforeEach } from "vitest";

const mockPrisma: any = {
  importConfig: { findUnique: vi.fn() },
  vulnerability: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
  },
  vulnerabilityHistory: { createMany: vi.fn() },
  uploadHistory: { update: vi.fn() },
  $transaction: vi.fn(),
};

const mockRedis: any = {
  set: vi.fn(),
  get: vi.fn(),
  expire: vi.fn(),
  eval: vi.fn(),
};

const mockStorage = {
  read: vi.fn(),
  delete: vi.fn(),
};

const mockSetProgress = vi.fn();

// Register module mocks at top-level so vitest can hoist them correctly
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/csv", () => ({ parseNessusCsv: vi.fn() }));
vi.mock("@/lib/progress", () => ({ setProgress: mockSetProgress }));
vi.mock("@/lib/redis", () => ({ redis: mockRedis }));
vi.mock("@/lib/queue", () => ({ getLockKey: (siteId: string) => `lock:${siteId}` }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: vi.fn(async () => mockStorage) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processNessusUpload", () => {
  it("throws if lock is held by another owner", async () => {
    mockRedis.set.mockResolvedValue(null);
    mockRedis.get.mockResolvedValue("other-upload-id");

    const { processNessusUpload } = await import("@/lib/ingest");

    await expect(processNessusUpload({ uploadId: "u1", siteId: "s1", storageKey: "k" })).rejects.toThrow(
      /Lock already held/,
    );
    expect(mockRedis.set).toHaveBeenCalled();
  }, 20000);

  it("skips rows within grace period and completes with zero rows", async () => {
    // Acquire lock
    mockRedis.set.mockResolvedValue("OK");

    // Storage returns CSV text (not parsed in our mock)
    mockStorage.read.mockResolvedValue("csv-data");

    // import config has grace days > 0
    mockPrisma.importConfig.findUnique.mockResolvedValue({ pluginGracePeriodDays: 365 });

    // CSV returns a single row with recent pluginPublicationDate and medium risk
    const { parseNessusCsv } = await import("@/lib/csv");
    (parseNessusCsv as any).mockImplementation(() => [
      {
        pluginId: "100",
        host: "1.2.3.4",
        port: "80",
        risk: "Medium",
        pluginPublicationDate: new Date().toISOString(),
      },
    ]);

    // No existing active vulnerabilities
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});
    mockPrisma.vulnerability.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.uploadHistory.update.mockResolvedValue({});

    const { processNessusUpload } = await import("@/lib/ingest");

    await processNessusUpload({ uploadId: "u2", siteId: "site-x", storageKey: "k" });

    expect(mockPrisma.uploadHistory.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { status: expect.anything(), rowCount: 0 } });
    expect(mockStorage.delete).toHaveBeenCalledWith("k");
  });

  it("creates vulnerabilities when none exist and updates uploadHistory", async () => {
    mockRedis.set.mockResolvedValue("OK");
    mockStorage.read.mockResolvedValue("csv-data");
    mockPrisma.importConfig.findUnique.mockResolvedValue({ pluginGracePeriodDays: 0 });

    const { parseNessusCsv } = await import("@/lib/csv");
    (parseNessusCsv as any).mockImplementation(() => [
      {
        pluginId: "200",
        host: "10.0.0.1",
        port: "443",
        risk: "High",
        pluginPublicationDate: "2020-01-01",
        name: "Test vuln",
        synopsis: "s",
        description: "d",
        solution: "sol",
        seeAlso: "",
        pluginOutput: "out",
        cve: null,
        cvssScore: null,
        protocol: "tcp",
      },
    ]);

    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});
    mockPrisma.vulnerability.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.uploadHistory.update.mockResolvedValue({});

    const { processNessusUpload } = await import("@/lib/ingest");

    await processNessusUpload({ uploadId: "u3", siteId: "site-y", storageKey: "k2" });

    expect(mockPrisma.vulnerability.createMany).toHaveBeenCalled();
    expect(mockPrisma.uploadHistory.update).toHaveBeenCalledWith({ where: { id: "u3" }, data: { status: expect.anything(), rowCount: 1 } });
    expect(mockStorage.delete).toHaveBeenCalledWith("k2");
  });

  it("rethrows Prisma P2002 errors from createMany", async () => {
    mockRedis.set.mockResolvedValue("OK");
    mockStorage.read.mockResolvedValue("csv-data");
    mockPrisma.importConfig.findUnique.mockResolvedValue({ pluginGracePeriodDays: 0 });

    const { parseNessusCsv } = await import("@/lib/csv");
    (parseNessusCsv as any).mockImplementation(() => [
      { pluginId: "300", host: "8.8.8.8", port: "22", risk: "High", pluginPublicationDate: "2020-01-01" },
    ]);

    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});

    class FakePrismaError extends Error {}
    const pErr: any = new FakePrismaError("unique");
    pErr.code = "P2002";
    // make instanceof check match Prisma.PrismaClientKnownRequestError by duck-typing
    (pErr as any).name = "PrismaClientKnownRequestError";

    mockPrisma.vulnerability.createMany.mockRejectedValue(pErr);

    const { processNessusUpload } = await import("@/lib/ingest");

    await expect(processNessusUpload({ uploadId: "u4", siteId: "site-z", storageKey: "k3" })).rejects.toBe(pErr);
    // Ensure cleanup eval was attempted
    expect(mockRedis.eval).toHaveBeenCalled();
  });
});
