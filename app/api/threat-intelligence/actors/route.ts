import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireAdmin } from "@/lib/rbac";
import { syncThreatActors, ATTACK_FEED_ID } from "@/lib/threat-intelligence/actors";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("q") || "").trim();
    const tactic = searchParams.get("tactic") || undefined;
    const sector = searchParams.get("sector") || undefined;
    const region = searchParams.get("region") || undefined;
    const actorType = searchParams.get("type") || undefined;
    // parseInt yields NaN for junk, which would reach Prisma as `take: NaN`.
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Number.isNaN(requestedLimit) ? 100 : Math.min(200, Math.max(1, requestedLimit));

    const where = {
      ...(query
        ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { aliases: { has: query } },
            { externalId: { contains: query, mode: "insensitive" as const } },
          ],
        }
        : {}),
      ...(tactic ? { tactics: { has: tactic } } : {}),
      ...(sector ? { targetSectors: { has: sector } } : {}),
      ...(region ? { targetRegions: { has: region } } : {}),
      ...(actorType ? { actorType } : {}),
    };

    const [actors, total, metadata] = await Promise.all([
      prisma.threatActor.findMany({ where, orderBy: { name: "asc" }, take: limit }),
      prisma.threatActor.count({ where }),
      prisma.threatFeedMetadata.findUnique({ where: { id: ATTACK_FEED_ID } }),
    ]);

    return NextResponse.json({ actors, total, lastSyncedAt: metadata?.lastSyncedAt ?? null });
  } catch (error) {
    console.error("[THREAT_ACTORS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

// Manual refresh; the worker also syncs on a weekly schedule.
export async function POST(request: NextRequest) {
  await requireAdmin();

  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const result = await syncThreatActors();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[THREAT_ACTORS_SYNC]", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 502 });
  }
}
