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
  const uploads = await prisma.uploadHistory.findMany({
    include: { site: true, uploader: true },
    orderBy: { uploadDate: "desc" },
    take: 50,
  });

  return NextResponse.json(uploads);
}
