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
    tls: {
      // Allow overriding TLS verification in environments where the SMTP server
      // uses self-signed certs. Default is to verify.
      rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === "false" ? false : true,
    },
  });

  try {
    await transporter.sendMail({
      from: settings.smtpFrom,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    // Improve observability: include non-sensitive connection info to help
    // diagnose misconfiguration (auth required vs TLS mismatch) without
    // logging credentials.
    console.error(`Failed to send mail to ${to} via ${settings.smtpHost}:${settings.smtpPort} (secure=${settings.smtpSecure})`);
    console.error(err);
    throw err;
  }
}

export async function sendReportEmail(
  settings: ReportSettings,
  subject: string,
  html: string,
  text: string
) {
  return sendEmail(settings, settings.recipients, subject, html, text);
}
