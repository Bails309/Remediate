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
  const body = await request.json();

  // Allow frontend to send a convenient `transport` value that maps to port/TLS
  // behavior. Supported values: 'smtp' (25, no TLS), 'starttls' (587, STARTTLS),
  // 'smtps' (465, implicit TLS), 'custom' (leave as-is).
  if (body.transport) {
    if (body.transport === "smtps") {
      body.smtpPort = 465;
      body.smtpSecure = true;
    } else if (body.transport === "starttls") {
      body.smtpPort = 587;
      body.smtpSecure = false;
    } else if (body.transport === "smtp") {
      body.smtpPort = 25;
      body.smtpSecure = false;
    }
    // if 'custom', expect smtpPort and smtpSecure to be provided by the client
  }

  const payload = reportSchema.parse(body);
  const timezone = payload.timezone || "UTC";

  await upsertReportConfig({
    ...payload,
    timezone: timezone,
  });
  return NextResponse.json({ ok: true });
}
