import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const updateSchema = z.object({
  name: z.string().min(2),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const payload = updateSchema.parse(await request.json());
  const site = await prisma.site.update({
    where: { id: siteId },
    data: payload,
  });
  return NextResponse.json(site);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();

  try {
    await prisma.$transaction([
      prisma.vulnerability.deleteMany({ where: { siteId } }),
      prisma.uploadHistory.deleteMany({ where: { siteId } }),
      prisma.site.delete({ where: { id: siteId } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete site", error);
    return NextResponse.json({ error: "Failed to delete site" }, { status: 500 });
  }
}
