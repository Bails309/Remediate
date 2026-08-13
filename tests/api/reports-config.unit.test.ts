import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/rbac", () => {
  const guard = vi.fn();
  return { requireAdmin: guard, requireSiteAdmin: guard };
});
vi.mock("../../lib/reports", () => ({
  getReportConfig: vi.fn(),
  upsertReportConfig: vi.fn(),
}));

import { getReportConfig, upsertReportConfig } from "../../lib/reports";

beforeEach(() => vi.clearAllMocks());

describe("/api/reports/config GET", () => {
  it("returns the report config", async () => {
    const config = {
      enabled: true,
      recipients: "admin@example.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpFrom: "reports@example.com",
    };
    vi.mocked(getReportConfig).mockResolvedValue(config as any);

    const { GET } = await import("../../app/api/reports/config/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.enabled).toBe(true);
    expect(data.config.smtpHost).toBe("smtp.example.com");
  });
});

describe("/api/reports/config POST", () => {
  it("saves valid report config", async () => {
    vi.mocked(upsertReportConfig).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/reports/config/route");
    const body = {
      enabled: true,
      recipients: "admin@example.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpFrom: "reports@example.com",
    };
    const req = new Request("http://localhost/api/reports/config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertReportConfig).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPort: 465, smtpSecure: true })
    );
  });

  it("maps smtps transport to port 465", async () => {
    vi.mocked(upsertReportConfig).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/reports/config/route");
    const body = {
      enabled: true,
      recipients: "admin@example.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.example.com",
      smtpPort: 25,
      smtpSecure: false,
      smtpFrom: "reports@example.com",
      transport: "smtps",
    };
    const req = new Request("http://localhost/api/reports/config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertReportConfig).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPort: 465, smtpSecure: true })
    );
  });

  it("maps starttls transport to port 587", async () => {
    vi.mocked(upsertReportConfig).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/reports/config/route");
    const body = {
      enabled: true,
      recipients: "admin@example.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.example.com",
      smtpPort: 465,
      smtpSecure: true,
      smtpFrom: "reports@example.com",
      transport: "starttls",
    };
    const req = new Request("http://localhost/api/reports/config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertReportConfig).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPort: 587, smtpSecure: false })
    );
  });

  it("maps smtp transport to port 25", async () => {
    vi.mocked(upsertReportConfig).mockResolvedValue(undefined as any);

    const { POST } = await import("../../app/api/reports/config/route");
    const body = {
      enabled: true,
      recipients: "admin@example.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      smtpSecure: true,
      smtpFrom: "reports@example.com",
      transport: "smtp",
    };
    const req = new Request("http://localhost/api/reports/config", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertReportConfig).toHaveBeenCalledWith(
      expect.objectContaining({ smtpPort: 25, smtpSecure: false })
    );
  });

  it("rejects invalid Zod payload", async () => {
    const { POST } = await import("../../app/api/reports/config/route");
    const req = new Request("http://localhost/api/reports/config", {
      method: "POST",
      body: JSON.stringify({ enabled: "yes" }), // invalid
      headers: { "Content-Type": "application/json" },
    });
    // Zod.parse throws
    await expect(POST(req)).rejects.toThrow();
  });
});
