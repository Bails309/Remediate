import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock nodemailer — vi.hoisted to avoid "before initialization" error
const mockSendMail = vi.hoisted(() => vi.fn());
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: mockSendMail,
    }),
  },
}));

import { sendEmail, sendReportEmail, renderEmailLayout } from "../../lib/email";
import type { ReportSettings } from "../../lib/reports";

beforeEach(() => vi.clearAllMocks());

const settings: ReportSettings = {
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "user",
  smtpPass: "pass",
  smtpFrom: "noreply@example.com",
  recipients: "admin@example.com",
  enabled: true,
  dayOfWeek: 1,
  hour: 9,
  minute: 0,
  timezone: "UTC",
};

describe("sendEmail", () => {
  it("sends email via nodemailer", async () => {
    mockSendMail.mockResolvedValue({ messageId: "123" });
    await sendEmail(settings, "test@example.com", "Subject", "<p>HTML</p>", "Text");
    expect(mockSendMail).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "test@example.com",
      subject: "Subject",
      html: "<p>HTML</p>",
      text: "Text",
    });
  });

  it("throws on sendMail failure", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP error"));
    await expect(
      sendEmail(settings, "test@example.com", "Sub", "<p>X</p>", "X")
    ).rejects.toThrow("SMTP error");
  });
});

describe("sendReportEmail", () => {
  it("sends to recipients from settings", async () => {
    mockSendMail.mockResolvedValue({ messageId: "456" });
    await sendReportEmail(settings, "Weekly Report", "<p>Report</p>", "Report text");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@example.com",
        subject: "Weekly Report",
      })
    );
  });
});

describe("renderEmailLayout", () => {
  it("returns HTML containing the title", () => {
    const html = renderEmailLayout({
      title: "Test Title",
      contentHtml: "<p>Hello</p>",
    });
    expect(html).toContain("Test Title");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("REMEDIATE");
  });

  it("includes preheader when provided", () => {
    const html = renderEmailLayout({
      title: "Title",
      preheader: "Preview text",
      contentHtml: "<p>Body</p>",
    });
    expect(html).toContain("Preview text");
  });

  it("omits preheader when not provided", () => {
    const html = renderEmailLayout({
      title: "Title",
      contentHtml: "<p>Body</p>",
    });
    // Check that the hidden preheader div is not present
    expect(html).not.toContain("display: none; max-height: 0px");
  });

  it("includes current year in footer", () => {
    const html = renderEmailLayout({
      title: "Title",
      contentHtml: "<p>Body</p>",
    });
    const year = new Date().getFullYear().toString();
    expect(html).toContain(year);
  });
});
