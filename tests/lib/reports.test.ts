import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  reportConfig: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
}));

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("../../lib/crypto", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));

import { getReportConfig, upsertReportConfig, SMTP_PASS_PLACEHOLDER } from "../../lib/reports";

beforeEach(() => vi.clearAllMocks());

describe("getReportConfig", () => {
  it("returns null when no config exists", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue(null);
    const result = await getReportConfig();
    expect(result).toBeNull();
  });

  it("returns masked password by default", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue({
      enabled: true,
      recipients: "a@b.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHostEnc: "enc:smtp.test",
      smtpPortEnc: "enc:465",
      smtpUserEnc: "enc:user",
      smtpPassEnc: "enc:secret",
      smtpSecureEnc: "enc:true",
      smtpFromEnc: "enc:noreply@test.com",
      lastSentAt: null,
    });

    const config = await getReportConfig();
    expect(config).not.toBeNull();
    expect(config!.smtpPass).toBe(SMTP_PASS_PLACEHOLDER);
    expect(config!.smtpHost).toBe("smtp.test");
    expect(config!.smtpPort).toBe(465);
    expect(config!.smtpSecure).toBe(true);
  });

  it("returns decrypted password when requested", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue({
      enabled: true,
      recipients: "a@b.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHostEnc: "enc:smtp.test",
      smtpPortEnc: "enc:465",
      smtpUserEnc: null,
      smtpPassEnc: "enc:secret",
      smtpSecureEnc: "enc:false",
      smtpFromEnc: "enc:noreply@test.com",
      lastSentAt: new Date("2024-01-01"),
    });

    const config = await getReportConfig(true);
    expect(config!.smtpPass).toBe("secret");
    expect(config!.smtpSecure).toBe(false);
    expect(config!.lastSentAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("returns undefined for optional fields when not set", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue({
      enabled: false,
      recipients: "a@b.com",
      dayOfWeek: 0,
      hour: 0,
      minute: 0,
      timezone: "UTC",
      smtpHostEnc: "enc:smtp.test",
      smtpPortEnc: "enc:25",
      smtpUserEnc: null,
      smtpPassEnc: null,
      smtpSecureEnc: "enc:false",
      smtpFromEnc: "enc:noreply@test.com",
      lastSentAt: null,
    });

    const config = await getReportConfig();
    expect(config!.smtpUser).toBeUndefined();
    expect(config!.smtpPass).toBeUndefined();
  });
});

describe("upsertReportConfig", () => {
  it("creates new config when none exists", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue(null);
    mockPrisma.reportConfig.create.mockResolvedValue({ id: "new" });

    await upsertReportConfig({
      enabled: true,
      recipients: "a@b.com, c@d.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.test",
      smtpPort: 465,
      smtpUser: "user",
      smtpPass: "pass",
      smtpSecure: true,
      smtpFrom: "noreply@test.com",
    });

    expect(mockPrisma.reportConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enabled: true,
        recipients: "a@b.com,c@d.com",
        smtpHostEnc: "enc:smtp.test",
        smtpPassEnc: "enc:pass",
      }),
    });
  });

  it("updates existing config", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue({ id: "existing" });
    mockPrisma.reportConfig.update.mockResolvedValue({ id: "existing" });

    await upsertReportConfig({
      enabled: true,
      recipients: "a@b.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.test",
      smtpPort: 465,
      smtpSecure: true,
      smtpFrom: "noreply@test.com",
    });

    expect(mockPrisma.reportConfig.update).toHaveBeenCalledWith({
      where: { id: "existing" },
      data: expect.objectContaining({ enabled: true }),
    });
  });

  it("does not update password when placeholder sent", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue({ id: "existing" });
    mockPrisma.reportConfig.update.mockResolvedValue({ id: "existing" });

    await upsertReportConfig({
      enabled: true,
      recipients: "a@b.com",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.test",
      smtpPort: 465,
      smtpPass: SMTP_PASS_PLACEHOLDER,
      smtpSecure: true,
      smtpFrom: "noreply@test.com",
    });

    expect(mockPrisma.reportConfig.update).toHaveBeenCalledWith({
      where: { id: "existing" },
      data: expect.not.objectContaining({ smtpPassEnc: expect.anything() }),
    });
  });

  it("trims and deduplicates recipients", async () => {
    mockPrisma.reportConfig.findFirst.mockResolvedValue(null);
    mockPrisma.reportConfig.create.mockResolvedValue({ id: "new" });

    await upsertReportConfig({
      enabled: true,
      recipients: " a@b.com , , c@d.com ",
      dayOfWeek: 1,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      smtpHost: "smtp.test",
      smtpPort: 587,
      smtpSecure: false,
      smtpFrom: "noreply@test.com",
    });

    expect(mockPrisma.reportConfig.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipients: "a@b.com,c@d.com" }),
    });
  });
});
