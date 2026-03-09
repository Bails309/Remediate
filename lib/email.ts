import nodemailer from "nodemailer";
import type { ReportSettings } from "@/lib/reports";

export async function sendEmail(
  settings: ReportSettings,
  to: string,
  subject: string,
  html: string,
  text: string
) {
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth:
      settings.smtpUser && settings.smtpPass
        ? { user: settings.smtpUser, pass: settings.smtpPass }
        : undefined,
  });

  await transporter.sendMail({
    from: settings.smtpFrom,
    to,
    subject,
    text,
    html,
  });
}

export async function sendReportEmail(
  settings: ReportSettings,
  subject: string,
  html: string,
  text: string
) {
  return sendEmail(settings, settings.recipients, subject, html, text);
}
