import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import type { ReportConfig } from "@prisma/client";

export type ReportSettings = {
  enabled: boolean;
  recipients: string;
  dayOfWeek: number;
  hour: number;
  minute: number;
  timezone: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure: boolean;
  smtpFrom: string;
};

export const SMTP_PASS_PLACEHOLDER = "__SMTP_PASS_SET__";

export async function getReportConfig(decryptPassword = false): Promise<(ReportSettings & { lastSentAt?: string | null }) | null> {
  const config = await prisma.reportConfig.findFirst();
  if (!config) {
    return null;
  }
  return {
    enabled: config.enabled,
    recipients: config.recipients,
    dayOfWeek: config.dayOfWeek,
    hour: config.hour,
    minute: config.minute,
    timezone: config.timezone,
    smtpHost: decrypt(config.smtpHostEnc),
    smtpPort: Number(decrypt(config.smtpPortEnc)),
    smtpUser: config.smtpUserEnc ? decrypt(config.smtpUserEnc) : undefined,
    smtpPass: config.smtpPassEnc ? (decryptPassword ? decrypt(config.smtpPassEnc) : SMTP_PASS_PLACEHOLDER) : undefined,
    smtpSecure: decrypt(config.smtpSecureEnc) === "true",
    smtpFrom: decrypt(config.smtpFromEnc),
    lastSentAt: config.lastSentAt?.toISOString() ?? null,
  };
}

export async function upsertReportConfig(input: ReportSettings) {
  const data: any = {
    enabled: input.enabled,
    recipients: input.recipients.split(",").map((item) => item.trim()).filter(Boolean).join(","),
    dayOfWeek: input.dayOfWeek,
    hour: input.hour,
    minute: input.minute,
    timezone: input.timezone,
    smtpHostEnc: encrypt(input.smtpHost),
    smtpPortEnc: encrypt(String(input.smtpPort)),
    smtpUserEnc: input.smtpUser ? encrypt(input.smtpUser) : null,
    smtpSecureEnc: encrypt(String(input.smtpSecure)),
    smtpFromEnc: encrypt(input.smtpFrom),
  };

  // Only update sensitive fields if they are provided and not the placeholder
  if (input.smtpPass && input.smtpPass !== SMTP_PASS_PLACEHOLDER && input.smtpPass.trim() !== "") {
    data.smtpPassEnc = encrypt(input.smtpPass);
  }

  const existing = await prisma.reportConfig.findFirst();
  if (!existing) {
    return prisma.reportConfig.create({ data });
  }
  return prisma.reportConfig.update({ where: { id: existing.id }, data });
}
