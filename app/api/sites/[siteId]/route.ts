import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const updateSchema = z.object({
  name: z.string().min(2),
});

export async function PUT(request: NextRequest, context: { params: { siteId: string } }) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const payload = updateSchema.parse(await request.json());
  const site = await prisma.site.update({
    where: { id: context.params.siteId },
    data: payload,
  });
  return NextResponse.json(site);
}

export async function DELETE(request: NextRequest, context: { params: { siteId: string } }) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  await prisma.site.delete({ where: { id: context.params.siteId } });
  return NextResponse.json({ ok: true });
}
