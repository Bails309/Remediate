import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const { searchParams } = new URL(request.url);
  const rawSiteId = searchParams.get("siteId") ?? undefined;
  const siteId = rawSiteId ? z.string().uuid().safeParse(rawSiteId) : undefined;
  if (siteId && !siteId.success) {
    return NextResponse.json({ error: "Invalid siteId" }, { status: 400 });
  }

  const groups = await prisma.vulnerability.groupBy({
    by: ["risk"],
    where: {
      ...(siteId?.success ? { siteId: siteId.data } : {}),
      status: "Open",
    },
    _count: { _all: true },
  });

  return NextResponse.json({ groups });
}
