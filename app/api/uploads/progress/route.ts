import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getProgressKey(uploadId: string) {
  return `upload:progress:${uploadId}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const uploadId = searchParams.get("uploadId");

  if (!uploadId) {
    return NextResponse.json({ progress: null }, { status: 400 });
  }

  const payload = await redis.get(getProgressKey(uploadId));
  if (!payload) {
    return NextResponse.json({ progress: null });
  }

  try {
    const progress = JSON.parse(payload) as { step?: string; progress?: number };
    return NextResponse.json({ progress });
  } catch (error) {
    console.error("Failed to parse progress payload", error);
    return NextResponse.json({ progress: null }, { status: 200 });
  }
}
