import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/rbac", () => {
  const guard = vi.fn();
  return { requireAdmin: guard, requireSiteAdmin: guard };
});
vi.mock("../../lib/reports", () => ({
  getReportConfig: vi.fn(),
}));
vi.mock("../../lib/email", () => ({
  sendReportEmail: vi.fn(),
  renderEmailLayout: vi.fn().mockReturnValue("<html>test</html>"),
}));

import { getReportConfig } from "../../lib/reports";
import { sendReportEmail } from "../../lib/email";

beforeEach(() => vi.clearAllMocks());

describe("/api/reports/test POST", () => {
  it("returns 400 when report config not configured", async () => {
    vi.mocked(getReportConfig).mockResolvedValue(null as any);

    const { POST } = await import("../../app/api/reports/test/route");
    const res = await POST();
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not configured");
  });

  it("sends test email successfully", async () => {
    const config = {
      enabled: true,
      recipients: "admin@example.com",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpFrom: "reports@example.com",
    };
    vi.mocked(getReportConfig).mockResolvedValue(config as any);
    vi.mocked(sendReportEmail).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/reports/test/route");
    const res = await POST();
    expect(res.status).toBe(200);
    expect(sendReportEmail).toHaveBeenCalledWith(
      config,
      "Remediate SMTP Test",
      expect.any(String),
      expect.any(String),
    );
  });
});
