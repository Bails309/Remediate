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

/**
 * Renders a standardized "Ultra Modern" email layout for all system communications.
 */
export function renderEmailLayout(params: {
  title: string;
  preheader?: string;
  contentHtml: string;
}) {
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${params.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${params.preheader ? `<div style="display: none; max-height: 0px; overflow: hidden;">${params.preheader}</div>` : ""}
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 20px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02); overflow: hidden; border: 1px solid rgba(0,0,0,0.05);">
                    <!-- Header with Branding -->
                    <tr>
                        <td align="center" style="padding: 48px 40px 32px 40px;">
                            <div style="letter-spacing: 0.15em; font-size: 14px; font-weight: 900; color: #0f172a; text-transform: uppercase;">REMEDIATE</div>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 0 48px 48px 48px;">
                            ${params.contentHtml}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td align="center" style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #f1f5f9;">
                            <p style="margin: 0; color: #94a3b8; font-size: 12px; font-weight: 500;">
                                Securely powered by Remediate &copy; ${currentYear}
                            </p>
                        </td>
                    </tr>
                </table>
                
                <!-- Secondary Footer -->
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px;">
                    <tr>
                        <td align="center" style="padding: 24px 40px 0 40px;">
                            <p style="margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.6;">
                                This is a system-generated message from your security platform. 
                                Secure finding orchestration and reporting.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
}
