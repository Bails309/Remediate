import { vi, describe, it, expect, beforeEach } from "vitest";

const mockPrisma: any = {
  importConfig: { findUnique: vi.fn() },
  vulnerability: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
  },
  vulnerabilityHistory: { 
    createMany: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
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
vi.mock("@/lib/csv", () => ({ parseNessusCsv: vi.fn(), parseAcrCsv: vi.fn() }));
vi.mock("@/lib/progress", () => ({ setProgress: mockSetProgress }));
vi.mock("@/lib/redis", () => ({ redis: mockRedis }));
vi.mock("@/lib/queue", () => ({ getLockKey: (siteId: string) => `lock:${siteId}` }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: vi.fn(async () => mockStorage) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.eval.mockResolvedValue(1);
  mockPrisma.vulnerabilityHistory.findMany.mockResolvedValue([]);
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

  it("does not recreate vulnerabilities that are in history as FalsePositive", async () => {
    mockRedis.set.mockResolvedValue("OK");
    mockStorage.read.mockResolvedValue("csv-data");
    mockPrisma.importConfig.findUnique.mockResolvedValue({ pluginGracePeriodDays: 0 });

    const { parseNessusCsv } = await import("@/lib/csv");
    (parseNessusCsv as any).mockImplementation(() => [
      {
        pluginId: "400",
        host: "10.0.0.2",
        port: "443",
        risk: "High",
        pluginPublicationDate: "2020-01-01",
        name: "Test vuln in history",
        cve: "CVE-400",
      },
    ]);

    // Mock no active vulnerabilities
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    // Mock existing history vulnerability
    mockPrisma.vulnerabilityHistory.findMany = vi.fn().mockResolvedValue([
      {
        id: "h1",
        pluginId: "400",
        host: "10.0.0.2",
        port: "443",
        cve: "CVE-400",
        status: "FalsePositive",
      },
    ]);
    mockPrisma.vulnerabilityHistory.updateMany = vi.fn().mockResolvedValue({ count: 1 });
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});
    mockPrisma.vulnerability.createMany = vi.fn().mockResolvedValue({ count: 0 });
    mockPrisma.uploadHistory.update.mockResolvedValue({});

    const { processNessusUpload } = await import("@/lib/ingest");

    await processNessusUpload({ uploadId: "u5", siteId: "site-y", storageKey: "k5" });

    // Verify that createMany was NOT called as a result of the loop data
    // (createMany might be called with empty array if not guarded, but our logic guards it)
    expect(mockPrisma.vulnerability.createMany).not.toHaveBeenCalled();
    // Verify that history was updated
    expect(mockPrisma.vulnerabilityHistory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["h1"] } },
      data: { lastSeenAt: expect.any(Date) },
    });
  });
});

describe("processAcrUpload", () => {
  it("does not recreate ACR findings that are in history as NoFixAvailable", async () => {
    mockRedis.set.mockResolvedValue("OK");
    mockStorage.read.mockResolvedValue("acr-csv-data");

    const { parseAcrCsv } = await import("@/lib/csv");
    (parseAcrCsv as any).mockImplementation(() => [
      {
        cveId: "CVE-2024-9999",
        registryName: "myregistry",
        repository: "myrepo",
        packageName: "openssl",
        installedVersion: "1.1.1",
        severity: "High",
        imageDigest: "sha256:abc",
        imageTag: "latest",
        description: "desc",
        remediation: "upgrade",
        timeGenerated: "2026-07-01T00:00:00Z",
      },
    ]);

    // No matching active vulnerability
    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    // But there IS a matching history record archived as NoFixAvailable
    mockPrisma.vulnerabilityHistory.findMany.mockResolvedValue([
      {
        id: "h-acr-1",
        pluginId: "CVE-2024-9999",
        host: "myregistry/myrepo",
        port: "openssl",
        cve: "CVE-2024-9999",
        status: "NoFixAvailable",
      },
    ]);
    mockPrisma.vulnerabilityHistory.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});
    mockPrisma.vulnerability.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.uploadHistory.update.mockResolvedValue({});

    const { processAcrUpload } = await import("@/lib/ingest");

    await processAcrUpload({ uploadId: "acr-u1", siteId: "site-acr", storageKey: "acr-key" });

    // A new Open vulnerability MUST NOT be created for an archived NoFixAvailable finding.
    expect(mockPrisma.vulnerability.createMany).not.toHaveBeenCalled();
    // The history row's lastSeenAt should be refreshed so it stays discoverable.
    expect(mockPrisma.vulnerabilityHistory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["h-acr-1"] } },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("does not recreate ACR findings that are in history as FalsePositive", async () => {
    mockRedis.set.mockResolvedValue("OK");
    mockStorage.read.mockResolvedValue("acr-csv-data");

    const { parseAcrCsv } = await import("@/lib/csv");
    (parseAcrCsv as any).mockImplementation(() => [
      {
        cveId: "CVE-2024-1111",
        registryName: "myregistry",
        repository: "myrepo",
        packageName: "curl",
        installedVersion: "7.88.1",
        severity: "Medium",
        imageDigest: "sha256:def",
        imageTag: "stable",
        description: "desc",
        remediation: "upgrade",
        timeGenerated: "2026-07-01T00:00:00Z",
      },
    ]);

    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.vulnerabilityHistory.findMany.mockResolvedValue([
      {
        id: "h-acr-fp-1",
        pluginId: "CVE-2024-1111",
        host: "myregistry/myrepo",
        port: "curl",
        cve: "CVE-2024-1111",
        status: "FalsePositive",
      },
    ]);
    mockPrisma.vulnerabilityHistory.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});
    mockPrisma.vulnerability.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.uploadHistory.update.mockResolvedValue({});

    const { processAcrUpload } = await import("@/lib/ingest");

    await processAcrUpload({ uploadId: "acr-u2", siteId: "site-acr", storageKey: "acr-key-2" });

    expect(mockPrisma.vulnerability.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.vulnerabilityHistory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["h-acr-fp-1"] } },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("still completes the upload when the lock release fails (Redis stalled)", async () => {
    mockRedis.set.mockResolvedValue("OK");
    // Simulate a degraded Redis: the atomic lock-release eval rejects. This must
    // NOT prevent the upload from being marked Completed, and must not throw
    // (otherwise a wedged worker would block every subsequent upload).
    mockRedis.eval.mockRejectedValue(new Error("Redis cluster unreachable"));
    mockStorage.read.mockResolvedValue("acr-csv-data");

    const { parseAcrCsv } = await import("@/lib/csv");
    (parseAcrCsv as any).mockImplementation(() => [
      {
        cveId: "CVE-2024-2222",
        registryName: "myregistry",
        repository: "myrepo",
        packageName: "zlib",
        installedVersion: "1.2.13",
        severity: "High",
        imageDigest: "sha256:ghi",
        imageTag: "latest",
        description: "desc",
        remediation: "upgrade",
        timeGenerated: "2026-07-01T00:00:00Z",
      },
    ]);

    mockPrisma.vulnerability.findMany.mockResolvedValue([]);
    mockPrisma.vulnerability.updateMany.mockResolvedValue({});
    mockPrisma.vulnerability.createMany.mockResolvedValue({ count: 1 });
    mockPrisma.uploadHistory.update.mockResolvedValue({});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { processAcrUpload } = await import("@/lib/ingest");

    await expect(
      processAcrUpload({ uploadId: "acr-u3", siteId: "site-acr", storageKey: "acr-key-3" }),
    ).resolves.toBeUndefined();

    // The upload was still marked Completed despite the release failure.
    expect(mockPrisma.uploadHistory.update).toHaveBeenCalledWith({
      where: { id: "acr-u3" },
      data: { status: expect.anything(), rowCount: 1 },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Lock release failed"),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
