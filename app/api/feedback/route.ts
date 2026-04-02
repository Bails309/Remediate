import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit-log";

const feedbackSchema = z.object({
  type: z.enum(["bug", "feature", "general"]),
  message: z.string().min(5).max(5000),
  page: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(req, session.user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid feedback", details: parsed.error.flatten() }, { status: 400 });
  }

  await writeAuditLog({
    userId: session.user.id,
    userEmail: session.user.email,
    action: "feedback.submit",
    entityType: "Feedback",
    newValue: parsed.data,
  });

  return NextResponse.json({ success: true });
}

// GET — Admin-only: retrieve feedback from audit log
export async function GET(req: NextRequest) {
  const session = await auth();
  const roles = (session?.user?.roles as string[]) || [];
  if (!roles.includes("site_admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await enforceRateLimit(req);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const feedback = await prisma.auditLog.findMany({
    where: { action: "feedback.submit" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      userEmail: true,
      newValue: true,
      createdAt: true,
    },
  });

  return NextResponse.json(feedback);
}
