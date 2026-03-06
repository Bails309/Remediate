import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/rbac";
import { enforceRateLimit } from "@/lib/rate-limit";
import { Risk, VulnerabilityStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const rate = await enforceRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await requireUser();
  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const risk = searchParams.get("risk") ?? undefined;
  const query = searchParams.get("q") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "25");

  const where = {
    ...(siteId ? { siteId } : {}),
    ...(status ? { status: status as VulnerabilityStatus } : {}),
    ...(risk ? { risk: risk as Risk } : {}),
    ...(assigneeId
      ? {
        assigneeId: assigneeId === "unassigned" ? null : assigneeId,
      }
      : {}),
    ...(query
      ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as any } },
          { host: { contains: query, mode: "insensitive" as any } },
          { pluginId: { contains: query, mode: "insensitive" as any } },
          { cve: { contains: query, mode: "insensitive" as any } },
        ],
      }
      : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.vulnerability.count({ where }),
    prisma.vulnerability.findMany({
      where,
      include: { site: true, assignee: true },
      orderBy: [{ risk: "asc" }, { lastSeenAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({ total, items, page, pageSize });
}
