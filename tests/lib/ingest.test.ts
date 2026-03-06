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
    },
    uploadHistory: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { processNessusUpload } from "@/lib/ingest";
import { parseNessusCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { setProgress } from "@/lib/progress";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processNessusUpload", () => {
  it("filters out Risk.None rows and writes uploadHistory and progress", async () => {
    // two rows: one None and one High
    (parseNessusCsv as any).mockReturnValue([
      { pluginId: "p1", host: "h1", port: "80", risk: "None" },
      { pluginId: "p2", host: "h2", port: "443", risk: "High", cve: "CVE-1", cvssScore: "7.5", name: "Test", synopsis: "s", description: "d", solution: "sol", seeAlso: "", pluginOutput: "o", pluginPublicationDate: null, pluginModificationDate: null, protocol: "tcp" },
    ]);

    (prisma as any).importConfig.findUnique.mockResolvedValue({ pluginGracePeriodDays: 0 });
    (prisma as any).vulnerability.findMany.mockResolvedValue([]);
    (prisma as any).vulnerability.createMany.mockResolvedValue({ count: 1 });
    (prisma as any).vulnerability.updateMany.mockResolvedValue({ count: 0 });
    (prisma as any).uploadHistory.update.mockResolvedValue({ id: "upload-1" });
    (prisma as any).$transaction.mockResolvedValue([[]]);

    await processNessusUpload({ uploadId: "upload-1", siteId: "site-1", text: "csv" });

    // setProgress called multiple times; final call should be Completed
    expect(setProgress).toHaveBeenCalled();
    expect(prisma.uploadHistory.update).toHaveBeenCalledWith({ where: { id: "upload-1" }, data: { status: expect.anything(), rowCount: 1 } });
    expect((prisma as any).vulnerability.createMany).toHaveBeenCalled();
  });
});
