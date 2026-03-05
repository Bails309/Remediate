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

export async function getReportConfig(): Promise<(ReportSettings & { lastSentAt?: string | null }) | null> {
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
    smtpPass: config.smtpPassEnc ? decrypt(config.smtpPassEnc) : undefined,
    smtpSecure: decrypt(config.smtpSecureEnc) === "true",
    smtpFrom: decrypt(config.smtpFromEnc),
    lastSentAt: config.lastSentAt?.toISOString() ?? null,
  };
}

export async function upsertReportConfig(input: ReportSettings) {
  const data = {
    enabled: input.enabled,
    recipients: input.recipients.split(",").map((item) => item.trim()).filter(Boolean).join(","),
    dayOfWeek: input.dayOfWeek,
    hour: input.hour,
    minute: input.minute,
    timezone: input.timezone,
    smtpHostEnc: encrypt(input.smtpHost),
    smtpPortEnc: encrypt(String(input.smtpPort)),
    smtpUserEnc: input.smtpUser ? encrypt(input.smtpUser) : null,
    smtpPassEnc: input.smtpPass ? encrypt(input.smtpPass) : null,
    smtpSecureEnc: encrypt(String(input.smtpSecure)),
    smtpFromEnc: encrypt(input.smtpFrom),
  } satisfies Partial<ReportConfig>;

  const existing = await prisma.reportConfig.findFirst();
  if (!existing) {
    return prisma.reportConfig.create({ data });
  }
  return prisma.reportConfig.update({ where: { id: existing.id }, data });
}
