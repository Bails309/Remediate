import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/rbac";
import { getReportConfig } from "@/lib/reports";
import { sendReportEmail, renderEmailLayout } from "@/lib/email";

export async function POST() {
  await requireSiteAdmin();
  const config = await getReportConfig(true);
  if (!config) {
    return NextResponse.json({ error: "Report settings not configured" }, { status: 400 });
  }

  const subject = "Remediate SMTP Test";
  const text = "This is a test email from Remediate. Your SMTP configuration is successful.";
  const html = renderEmailLayout({
    title: "SMTP Test Successful",
    preheader: "Your Remediate SMTP configuration is working correctly.",
    contentHtml: `
      <h1 style="color: #0f172a; font-size: 26px; font-weight: 800; margin: 0 0 16px 0; letter-spacing: -0.025em; line-height: 1.2;">SMTP Test Successful</h1>
      <p style="color: #475569; font-size: 16px; font-weight: 400; line-height: 1.6; margin: 0 0 32px 0;">
          This is a test email to confirm that your SMTP settings are correctly configured in the Remediate platform.
      </p>
      
      <div style="background-color: #f1f5f9; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0; margin-bottom: 32px;">
          <div style="color: #0f172a; font-size: 16px; font-weight: 600; margin-bottom: 8px;">Configuration Status</div>
          <div style="color: #10b981; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">● Active & Verified</div>
      </div>
      
      <p style="color: #64748b; font-size: 14px; line-height: 1.6;">
          You can now proceed to schedule weekly reports or invite collaborators.
      </p>
    `
  });

  await sendReportEmail(config, subject, html, text);
  return NextResponse.json({ ok: true });
}
