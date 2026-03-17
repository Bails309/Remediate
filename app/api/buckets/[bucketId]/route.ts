import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const updateSchema = z.object({
  name: z.string().min(2),
  importPattern: z.string().optional().nullable(),
  importAliases: z.array(z.string()).optional(),
  autoImportEnabled: z.boolean().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ bucketId: string }> }) {
  const { bucketId } = await params;
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const payload = updateSchema.parse(await request.json());
  const bucket = await prisma.site.update({
    where: { id: bucketId },
    data: payload,
  });
  return NextResponse.json(bucket);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ bucketId: string }> }) {
  const { bucketId } = await params;
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();

  try {
    await prisma.site.delete({ where: { id: bucketId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete bucket", error);
    return NextResponse.json({ error: "Failed to delete bucket" }, { status: 500 });
  }
}
