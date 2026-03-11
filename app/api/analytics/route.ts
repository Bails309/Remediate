import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? undefined;

  const groups = await prisma.vulnerability.groupBy({
    by: ["risk"],
    where: {
      ...(siteId ? { siteId } : {}),
      status: "Open",
    },
    _count: { _all: true },
  });

  return NextResponse.json({ groups });
}
