import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPrisma = {
  user: { findMany: vi.fn(), update: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/reports", () => ({
  getReportConfig: vi.fn(),
}));
vi.mock("../../lib/email", () => ({
  sendEmail: vi.fn(),
  renderEmailLayout: vi.fn().mockReturnValue("<html>test</html>"),
}));
vi.mock("../../lib/assignment-email", () => ({
  renderWeeklyAssignmentEmail: vi.fn().mockReturnValue("<html>assignment</html>"),
}));

import { getReportConfig } from "../../lib/reports";
import { sendEmail } from "../../lib/email";

beforeEach(() => vi.clearAllMocks());

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

describe("dispatchWeeklyAssignmentEmails", () => {
  it("skips when report config is disabled", async () => {
    vi.mocked(getReportConfig).mockResolvedValue(null as any);

    const { dispatchWeeklyAssignmentEmails } = await import("../../lib/assignment-notifications");
    await dispatchWeeklyAssignmentEmails();
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("skips when config not enabled", async () => {
    vi.mocked(getReportConfig).mockResolvedValue({ enabled: false } as any);

    const { dispatchWeeklyAssignmentEmails } = await import("../../lib/assignment-notifications");
    await dispatchWeeklyAssignmentEmails();
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("sends emails to users with active assignments", async () => {
    process.env.NEXTAUTH_URL = "https://remediate.local";
    vi.mocked(getReportConfig).mockResolvedValue({
      enabled: true,
      smtpHost: "smtp.test",
      smtpPort: 587,
      smtpSecure: false,
      smtpFrom: "test@test.com",
      recipients: "admin@test.com",
    } as any);
    vi.mocked(sendEmail).mockResolvedValue(undefined as any);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        vulnerabilities: [
          { id: "v1", name: "SQLi", risk: "Critical", host: "10.0.0.1", port: "443", status: "Open" },
        ],
      },
    ]);
    mockPrisma.user.update.mockResolvedValue({});

    const { dispatchWeeklyAssignmentEmails } = await import("../../lib/assignment-notifications");
    await dispatchWeeklyAssignmentEmails();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.anything(),
      "alice@example.com",
      expect.stringContaining("Weekly Assignment Summary"),
      expect.any(String),
      expect.any(String),
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } })
    );
  });

  it("skips users without email", async () => {
    process.env.NEXTAUTH_URL = "https://remediate.local";
    vi.mocked(getReportConfig).mockResolvedValue({ enabled: true } as any);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        name: "No Email",
        email: null,
        vulnerabilities: [{ id: "v1", name: "Test", risk: "High", host: "h", port: "0", status: "Open" }],
      },
    ]);

    const { dispatchWeeklyAssignmentEmails } = await import("../../lib/assignment-notifications");
    await dispatchWeeklyAssignmentEmails();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips when NEXTAUTH_URL not set", async () => {
    delete process.env.NEXTAUTH_URL;
    vi.mocked(getReportConfig).mockResolvedValue({ enabled: true } as any);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: "u1",
        name: "Alice",
        email: "alice@example.com",
        vulnerabilities: [{ id: "v1", name: "Test", risk: "High", host: "h", port: "0", status: "Open" }],
      },
    ]);

    const { dispatchWeeklyAssignmentEmails } = await import("../../lib/assignment-notifications");
    await dispatchWeeklyAssignmentEmails();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
