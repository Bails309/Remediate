import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const bulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  status: z.enum(["Open", "Remediated", "FalsePositive", "NoFixAvailable"]).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const payload = bulkSchema.parse(await request.json());

  const updateData: Record<string, unknown> = {};
  if (payload.status) {
    updateData.status = payload.status;
  }
  if (payload.assigneeId !== undefined) {
    updateData.assigneeId = payload.assigneeId;
  }

  await prisma.$transaction(async (tx) => {
    await tx.vulnerability.updateMany({
      where: { id: { in: payload.ids } },
      data: updateData,
    });

    // If assigneeId was changed to a user (not null/unassigned), log notifications
    if (payload.assigneeId) {
      const notifications = payload.ids.map((id: string) => ({
        userId: payload.assigneeId as string,
        vulnerabilityId: id,
      }));
      await tx.assignmentNotification.createMany({
        data: notifications,
      });
    }
  });

  return NextResponse.json({ ok: true });
}
