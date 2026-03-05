import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getReportConfig } from "@/lib/reports";
import { sendReportEmail } from "@/lib/email";

export async function POST() {
  await requireAdmin();
  const config = await getReportConfig();
  if (!config) {
    return NextResponse.json({ error: "Report settings not configured" }, { status: 400 });
  }

  const subject = "Remediate SMTP Test";
  const text = "This is a test email from Remediate.";
  const html = "<p>This is a test email from Remediate.</p>";

  await sendReportEmail(config, subject, html, text);
  return NextResponse.json({ ok: true });
}
