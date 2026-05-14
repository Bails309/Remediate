import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock chain must be declared before importing the dispatcher. The dispatcher pulls
// in `@/lib/prisma`, `@/lib/email`, `@/lib/reports`, and the email-template renderer,
// each of which we stub so we can drive subscription/threat scenarios in isolation.
vi.mock("@/lib/prisma", () => ({
    prisma: {
        threatVulnerability: { findMany: vi.fn() },
        threatSubscription: { update: vi.fn() },
    },
}));
vi.mock("@/lib/reports", () => ({ getReportConfig: vi.fn() }));
vi.mock("../../lib/email", () => ({
    sendEmail: vi.fn(),
    renderEmailLayout: vi.fn().mockReturnValue("<html>layout</html>"),
}));
vi.mock("../../lib/threat-intelligence/email-template", () => ({
    renderThreatEmail: vi.fn().mockReturnValue("<html>digest</html>"),
}));

import { dispatchDailyThreatDigest } from "@/lib/threat-intelligence/dispatcher";
import { prisma } from "@/lib/prisma";
import { getReportConfig } from "@/lib/reports";
import { sendEmail } from "../../lib/email";
import { renderThreatEmail } from "../../lib/threat-intelligence/email-template";

const mockPrisma = prisma as unknown as {
    threatVulnerability: { findMany: ReturnType<typeof vi.fn> };
    threatSubscription: { update: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
});

const baseUser = (overrides: Record<string, unknown> = {}) => ({
    email: "user@example.com",
    threatSubscription: {
        id: "sub-1",
        isSubscribed: true,
        minRisk: "Low",
        cisaKevOnly: false,
        ...overrides,
    },
});

describe("dispatchDailyThreatDigest — subscription gating", () => {
    it("skips users with no subscription record", async () => {
        await dispatchDailyThreatDigest({ email: "x@example.com", threatSubscription: null });
        expect(mockPrisma.threatVulnerability.findMany).not.toHaveBeenCalled();
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it("skips users whose subscription is disabled", async () => {
        await dispatchDailyThreatDigest({
            email: "x@example.com",
            threatSubscription: { id: "sub-1", isSubscribed: false, minRisk: "Low", cisaKevOnly: false },
        });
        expect(mockPrisma.threatVulnerability.findMany).not.toHaveBeenCalled();
    });

    it("skips dispatch when no new threats match the user's preferences", async () => {
        mockPrisma.threatVulnerability.findMany.mockResolvedValue([]);
        await dispatchDailyThreatDigest(baseUser());
        expect(sendEmail).not.toHaveBeenCalled();
        expect(mockPrisma.threatSubscription.update).not.toHaveBeenCalled();
    });

    it("skips dispatch when no SMTP config is available", async () => {
        mockPrisma.threatVulnerability.findMany.mockResolvedValue([
            { osvId: "OSV-1", cveId: null, summary: "s", cvssScore: 5.0, cisaKevStatus: false },
        ]);
        vi.mocked(getReportConfig).mockResolvedValue(null as never);
        await dispatchDailyThreatDigest(baseUser());
        expect(sendEmail).not.toHaveBeenCalled();
        expect(mockPrisma.threatSubscription.update).not.toHaveBeenCalled();
    });

    it("never throws when prisma queries fail (caught internally)", async () => {
        mockPrisma.threatVulnerability.findMany.mockRejectedValue(new Error("DB down"));
        await expect(dispatchDailyThreatDigest(baseUser())).resolves.toBeUndefined();
        expect(sendEmail).not.toHaveBeenCalled();
    });
});

describe("dispatchDailyThreatDigest — risk filter passed to prisma", () => {
    beforeEach(() => {
        mockPrisma.threatVulnerability.findMany.mockResolvedValue([]);
    });

    it("Critical minRisk requires cvssScore >= 9.0", async () => {
        await dispatchDailyThreatDigest(baseUser({ minRisk: "Critical" }));
        const args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        expect(args.where.cvssScore).toEqual({ gte: 9.0 });
    });

    it("High minRisk requires cvssScore >= 7.0", async () => {
        await dispatchDailyThreatDigest(baseUser({ minRisk: "High" }));
        const args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        expect(args.where.cvssScore).toEqual({ gte: 7.0 });
    });

    it("Medium minRisk requires cvssScore >= 4.0", async () => {
        await dispatchDailyThreatDigest(baseUser({ minRisk: "Medium" }));
        const args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        expect(args.where.cvssScore).toEqual({ gte: 4.0 });
    });

    it("Low minRisk applies no cvssScore filter", async () => {
        await dispatchDailyThreatDigest(baseUser({ minRisk: "Low" }));
        const args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        expect(args.where.cvssScore).toBeUndefined();
    });

    it("cisaKevOnly=true forces cisaKevStatus filter; false leaves it open", async () => {
        await dispatchDailyThreatDigest(baseUser({ cisaKevOnly: true }));
        let args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        expect(args.where.cisaKevStatus).toBe(true);

        mockPrisma.threatVulnerability.findMany.mockClear();
        await dispatchDailyThreatDigest(baseUser({ cisaKevOnly: false }));
        args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        expect(args.where.cisaKevStatus).toBeUndefined();
    });

    it("queries threats from the last 24 hours window", async () => {
        const before = Date.now();
        await dispatchDailyThreatDigest(baseUser());
        const args = mockPrisma.threatVulnerability.findMany.mock.calls[0][0];
        const gte = (args.where.syncedAt.gte as Date).getTime();
        expect(before - gte).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
        expect(before - gte).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 100);
    });
});

describe("dispatchDailyThreatDigest — bucket assignment", () => {
    it("routes threats into cisaKev / criticalHigh / standard buckets correctly", async () => {
        mockPrisma.threatVulnerability.findMany.mockResolvedValue([
            { osvId: "CVE-K", cveId: "CVE-K", summary: "kev1", cvssScore: 8.0, cisaKevStatus: true },
            { osvId: "CVE-H1", cveId: "CVE-H1", summary: "high1", cvssScore: 9.5, cisaKevStatus: false },
            { osvId: "CVE-H2", cveId: "CVE-H2", summary: "high2", cvssScore: 7.0, cisaKevStatus: false },
            { osvId: "CVE-S1", cveId: "CVE-S1", summary: "std1", cvssScore: 5.0, cisaKevStatus: false },
            { osvId: "CVE-S2", cveId: "CVE-S2", summary: "std2", cvssScore: null, cisaKevStatus: false },
        ]);
        vi.mocked(getReportConfig).mockResolvedValue({ enabled: true } as never);
        vi.mocked(sendEmail).mockResolvedValue(undefined as never);

        await dispatchDailyThreatDigest(baseUser());

        expect(renderThreatEmail).toHaveBeenCalledOnce();
        const grouped = vi.mocked(renderThreatEmail).mock.calls[0][0];
        expect(grouped.cisaKev.map((t) => t.osvId)).toEqual(["CVE-K"]);
        expect(grouped.criticalHigh.map((t) => t.osvId).sort()).toEqual(["CVE-H1", "CVE-H2"]);
        expect(grouped.standard.map((t) => t.osvId).sort()).toEqual(["CVE-S1", "CVE-S2"]);
    });
});

describe("dispatchDailyThreatDigest — successful send", () => {
    it("sends email, includes total count in subject, and updates lastSentAt", async () => {
        mockPrisma.threatVulnerability.findMany.mockResolvedValue([
            { osvId: "CVE-1", cveId: "CVE-1", summary: "s1", cvssScore: 9.8, cisaKevStatus: true },
            { osvId: "CVE-2", cveId: null, summary: "s2", cvssScore: 5.0, cisaKevStatus: false },
        ]);
        vi.mocked(getReportConfig).mockResolvedValue({ enabled: true } as never);
        vi.mocked(sendEmail).mockResolvedValue(undefined as never);

        await dispatchDailyThreatDigest(baseUser());

        expect(sendEmail).toHaveBeenCalledOnce();
        const [, recipient, subject, html] = vi.mocked(sendEmail).mock.calls[0];
        expect(recipient).toBe("user@example.com");
        expect(subject).toBe("Daily Threat Intelligence: 2 Found");
        expect(html).toBe("<html>digest</html>");

        expect(mockPrisma.threatSubscription.update).toHaveBeenCalledWith({
            where: { id: "sub-1" },
            data: { lastSentAt: expect.any(Date) },
        });
    });
});
