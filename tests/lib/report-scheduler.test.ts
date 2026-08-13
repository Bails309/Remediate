import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  threatFeedMetadata: { findUnique: vi.fn() },
  reportConfig: { findFirst: vi.fn(), update: vi.fn() },
  user: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
}));

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/reports", () => ({ getReportConfig: vi.fn() }));
vi.mock("../../lib/report-analytics", () => ({ getWeeklyCriticalHighSummary: vi.fn() }));
vi.mock("../../lib/email", () => ({ sendReportEmail: vi.fn(), renderEmailLayout: vi.fn(() => "") }));
vi.mock("../../lib/threat-intelligence/worker", () => ({ syncAllThreats: vi.fn() }));
vi.mock("../../lib/threat-intelligence/actors", () => ({ syncThreatActorsIfStale: vi.fn() }));
vi.mock("../../lib/threat-intelligence/dispatcher", () => ({ dispatchDailyThreatDigest: vi.fn() }));
vi.mock("../../lib/assignment-notifications", () => ({ dispatchWeeklyAssignmentEmails: vi.fn() }));

import { startReportScheduler } from "../../lib/report-scheduler";
import { getReportConfig } from "../../lib/reports";
import { syncAllThreats } from "../../lib/threat-intelligence/worker";
import { syncThreatActorsIfStale } from "../../lib/threat-intelligence/actors";
import { dispatchWeeklyAssignmentEmails } from "../../lib/assignment-notifications";

/** Run one tick of the 60s scheduler loop. The clock advances with it, so
 *  tests set the system time one minute before the minute under test. */
async function tick() {
  await vi.advanceTimersByTimeAsync(60_000);
}

beforeEach(() => {
  // resetAllMocks (not clearAllMocks) so a rejected implementation set by one
  // test cannot leak into the next.
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});

  // Default: feed was synced moments ago, so the startup sync is skipped and
  // each test can assert on the interval behaviour in isolation.
  mockPrisma.threatFeedMetadata.findUnique.mockResolvedValue({ lastSyncedAt: new Date() });
  mockPrisma.reportConfig.findFirst.mockResolvedValue(null);
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  vi.mocked(getReportConfig).mockResolvedValue(null as never);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("startReportScheduler — threat feeds are independent of reporting", () => {
  // Regression guard for v2.16.0: both threat syncs used to sit *after* the
  // `if (!config || !config.enabled) return` guard, so an installation that
  // never configured scheduled email reports silently received no threat
  // intelligence at all.
  it("runs the hourly delta sync when no report config exists", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:44:00Z"));
    startReportScheduler();
    await tick();

    expect(syncAllThreats).toHaveBeenCalledWith(3);
  });

  it("runs the hourly delta sync when reporting is explicitly disabled", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:44:00Z"));
    vi.mocked(getReportConfig).mockResolvedValue({ enabled: false } as never);

    startReportScheduler();
    await tick();

    expect(syncAllThreats).toHaveBeenCalledWith(3);
  });

  it("syncs threat actors on every tick regardless of reporting state", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:10:00Z"));
    startReportScheduler();

    // Once eagerly at boot...
    expect(syncThreatActorsIfStale).toHaveBeenCalledTimes(1);
    await tick();
    // ...and again on the interval, with no report config in play.
    expect(syncThreatActorsIfStale).toHaveBeenCalledTimes(2);
  });

  it("only runs the delta sync on the :45 minute", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:20:00Z"));
    startReportScheduler();
    await tick();

    expect(syncAllThreats).not.toHaveBeenCalled();
  });
});

describe("startReportScheduler — startup sync throttle", () => {
  it("skips the startup sync when the feed was refreshed recently", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    mockPrisma.threatFeedMetadata.findUnique.mockResolvedValue({
      lastSyncedAt: new Date("2026-08-13T09:00:00Z"),
    });

    startReportScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(syncAllThreats).not.toHaveBeenCalled();
  });

  it("runs a full startup sync when the feed is stale", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    mockPrisma.threatFeedMetadata.findUnique.mockResolvedValue({
      lastSyncedAt: new Date("2026-08-12T10:00:00Z"),
    });

    startReportScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(syncAllThreats).toHaveBeenCalledWith();
  });

  it("runs a full startup sync when the feed has never synced", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    mockPrisma.threatFeedMetadata.findUnique.mockResolvedValue(null);

    startReportScheduler();
    await vi.advanceTimersByTimeAsync(0);

    expect(syncAllThreats).toHaveBeenCalledWith();
  });
});

describe("startReportScheduler — fault isolation", () => {
  it("a failing startup sync does not prevent the scheduler starting", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:00:00Z"));
    mockPrisma.threatFeedMetadata.findUnique.mockRejectedValue(new Error("db down"));

    expect(() => startReportScheduler()).not.toThrow();
    await tick();

    expect(syncThreatActorsIfStale).toHaveBeenCalled();
  });

  it("a failing threat sync does not stop the reporting branch of the same tick", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:44:00Z"));
    vi.mocked(syncAllThreats).mockRejectedValue(new Error("feed unreachable"));

    startReportScheduler();
    await tick();

    // The reporting branch sits in its own try block, so it still evaluates.
    expect(getReportConfig).toHaveBeenCalled();
  });

  it("a failing actor sync is swallowed so the loop survives", async () => {
    vi.setSystemTime(new Date("2026-08-13T10:10:00Z"));
    vi.mocked(syncThreatActorsIfStale).mockRejectedValue(new Error("github unreachable"));

    startReportScheduler();
    await tick();
    await tick();

    expect(syncThreatActorsIfStale).toHaveBeenCalledTimes(3);
  });
});

describe("startReportScheduler — weekly assignment digest", () => {
  it("does not send outside the Monday 08:00 UTC window", async () => {
    // Tuesday.
    vi.setSystemTime(new Date("2026-08-11T09:00:00Z"));
    vi.mocked(getReportConfig).mockResolvedValue({
      enabled: true,
      dayOfWeek: 1,
      hour: 23,
      minute: 59,
      timezone: "UTC",
      recipients: "a@example.com",
      lastSentAt: new Date("2026-08-11T08:00:00Z"),
    } as never);

    startReportScheduler();
    await tick();

    expect(dispatchWeeklyAssignmentEmails).not.toHaveBeenCalled();
  });

  it("sends once inside the window and not again while a recent send exists", async () => {
    // Monday 08:00 UTC.
    vi.setSystemTime(new Date("2026-08-10T08:00:00Z"));
    vi.mocked(getReportConfig).mockResolvedValue({
      enabled: true,
      dayOfWeek: 1,
      hour: 23,
      minute: 59,
      timezone: "UTC",
      recipients: "a@example.com",
      lastSentAt: new Date("2026-08-10T08:00:00Z"),
    } as never);

    startReportScheduler();
    await tick();
    expect(dispatchWeeklyAssignmentEmails).toHaveBeenCalledTimes(1);

    // A recent per-user timestamp now exists, so the next tick must be a no-op.
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u1" });
    await tick();
    expect(dispatchWeeklyAssignmentEmails).toHaveBeenCalledTimes(1);
  });
});
