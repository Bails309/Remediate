import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/progress", () => ({
  setProgress: vi.fn(),
}));

vi.mock("@/lib/csv", () => ({
  parseNessusCsv: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    importConfig: { findUnique: vi.fn() },
    vulnerability: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    vulnerabilityHistory: { createMany: vi.fn() },
    uploadHistory: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn().mockResolvedValue({
    read: vi.fn().mockResolvedValue("csv"),
    delete: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    expire: vi.fn(),
    eval: vi.fn().mockResolvedValue(1),
  },
}));

import { processNessusUpload } from "@/lib/ingest";
import { parseNessusCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { setProgress } from "@/lib/progress";
import { redis } from "@/lib/redis";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processNessusUpload", () => {
  it("filters out Risk.None rows and writes uploadHistory and progress", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    // two rows: one None and one High
    vi.mocked(parseNessusCsv).mockReturnValue([
      { pluginId: "p1", host: "h1", port: "80", risk: "None" },
      { pluginId: "p2", host: "h2", port: "443", risk: "High", cve: "CVE-1", cvssScore: "7.5", name: "Test", synopsis: "s", description: "d", solution: "sol", seeAlso: "", pluginOutput: "o", pluginPublicationDate: null, pluginModificationDate: null, protocol: "tcp" },
    ] as any);

    vi.mocked((prisma as any).importConfig.findUnique).mockResolvedValue({ pluginGracePeriodDays: 0 } as any);
    vi.mocked(prisma.vulnerability.findMany).mockResolvedValue([]);
    vi.mocked(prisma.vulnerability.createMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.vulnerability.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.uploadHistory.update).mockResolvedValue({ id: "upload-1" } as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([[]]);

    await processNessusUpload({ uploadId: "upload-1", siteId: "site-1", storageKey: "nessus-upload-1.csv" });

    // setProgress called multiple times; final call should be Completed
    expect(setProgress).toHaveBeenCalled();
    expect(prisma.uploadHistory.update).toHaveBeenCalledWith({ where: { id: "upload-1" }, data: { status: expect.anything(), rowCount: 1 } });
    expect(prisma.vulnerability.createMany).toHaveBeenCalled();
  });

  it("succeeds if lock is already held by the same uploadId (re-entrant)", async () => {
    const uploadId = "upload-reentrant";
    const siteId = "site-1";

    // Simulate lock already held by this uploadId
    vi.mocked(redis.set).mockResolvedValue(null); // NX fails
    vi.mocked(redis.get).mockResolvedValue(uploadId); // But it's our lock

    vi.mocked(parseNessusCsv).mockReturnValue([] as any);
    vi.mocked((prisma as any).importConfig.findUnique).mockResolvedValue({ pluginGracePeriodDays: 0 } as any);
    vi.mocked(prisma.vulnerability.findMany).mockResolvedValue([]);
    vi.mocked(prisma.uploadHistory.update).mockResolvedValue({ id: uploadId } as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([[]]);

    await processNessusUpload({ uploadId, siteId, storageKey: "nessus-upload-1.csv" });

    // Should refresh TTL and proceed
    expect(redis.expire).toHaveBeenCalled();
    expect(prisma.uploadHistory.update).toHaveBeenCalled();
  });

  it("fails if lock is held by a different uploadId", async () => {
    const uploadId = "upload-new";
    const siteId = "site-1";

    // Simulate lock held by someone else
    vi.mocked(redis.set).mockResolvedValue(null);
    vi.mocked(redis.get).mockResolvedValue("different-upload");

    await expect(processNessusUpload({ uploadId, siteId, storageKey: "nessus-upload-1.csv" }))
      .rejects.toThrow("Lock already held for this site");
  });
});
