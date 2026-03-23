import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));

    const feed = await prisma.threatVulnerability.findMany({
      orderBy: {
        modifiedAt: "desc",
      },
      take: limit,
    });

    return NextResponse.json(feed);
  } catch (error) {
    console.error("[THREAT_FEED_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
