import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const bucketSchema = z.object({
  name: z.string().min(2),
});

export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(sites);
}

export async function POST(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireAdmin();
  const raw = await request.json().catch(() => ({}));
  const name = typeof raw.name === "string" ? raw.name.trim() : raw.name;
  const parsed = bucketSchema.safeParse({ name });
  if (!parsed.success) {
    const message = parsed.error?.issues?.map((i) => i.message).join(", ") || "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const bucket = await prisma.site.create({ data: parsed.data });
  return NextResponse.json(bucket, { status: 201 });
}
