import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

const siteSchema = z.object({
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

  await requireUser();
  const payload = siteSchema.parse(await request.json());
  const site = await prisma.site.create({ data: payload });
  return NextResponse.json(site, { status: 201 });
}
