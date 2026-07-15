import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/azure-blob-ingest", () => ({
  AzureBlobIngestService: {
    pollAndIngest: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    azureBlobIngestConfig: { findUnique: vi.fn() },
  },
}));

import { startAzureBlobIngestScheduler } from "@/lib/azure-blob-ingest-scheduler";
import { AzureBlobIngestService } from "@/lib/azure-blob-ingest";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startAzureBlobIngestScheduler", () => {
  it("kicks off an immediate poll and schedules the recurring interval from config", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      pollIntervalMinutes: 5,
    });

    await startAzureBlobIngestScheduler();

    // First poll runs immediately
    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalledTimes(1);

    // Advance 5 minutes => next scheduled poll fires
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalledTimes(2);
  });

  it("falls back to 60-minute default when no config row exists", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue(null);

    await startAzureBlobIngestScheduler();

    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalledTimes(1);

    // 60min should fire the interval
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalledTimes(2);
  });

  it("clears the prior interval when called a second time", async () => {
    (prisma.azureBlobIngestConfig.findUnique as any).mockResolvedValue({
      pollIntervalMinutes: 1,
    });

    await startAzureBlobIngestScheduler();
    await startAzureBlobIngestScheduler();

    // Two immediate polls (one per start call)
    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalledTimes(2);

    // Only the most recent interval should still be active — one poll per minute
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(AzureBlobIngestService.pollAndIngest).toHaveBeenCalledTimes(3);
  });
});
