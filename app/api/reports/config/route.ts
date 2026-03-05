import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { getReportConfig, upsertReportConfig } from "@/lib/reports";

const reportSchema = z.object({
  enabled: z.boolean(),
  recipients: z.string().min(3),
  dayOfWeek: z.number().min(0).max(6),
  hour: z.number().min(0).max(23),
  minute: z.number().min(0).max(59),
  timezone: z.string().min(1),
  smtpHost: z.string().min(1),
  smtpPort: z.number().min(1).max(65535),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpSecure: z.boolean(),
  smtpFrom: z.string().min(3),
});

export async function GET() {
  await requireAdmin();
  const config = await getReportConfig();
  return NextResponse.json({ config });
}

export async function POST(request: Request) {
  await requireAdmin();
  const payload = reportSchema.parse(await request.json());
  const timezone = payload.timezone || "UTC";
  if (timezone.toUpperCase() !== "UTC") {
    return NextResponse.json({ error: "Only UTC timezone is supported." }, { status: 400 });
  }
  await upsertReportConfig({
    ...payload,
    timezone: timezone.toUpperCase(),
  });
  return NextResponse.json({ ok: true });
}
