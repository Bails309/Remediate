import { prisma } from "@/lib/prisma";
import { Risk, VulnerabilityStatus } from "@prisma/client";

export async function getWeeklyCriticalHighSummary() {
  const rows = await prisma.vulnerability.groupBy({
    by: ["risk", "siteId"],
    where: {
      status: { notIn: [VulnerabilityStatus.Remediated, VulnerabilityStatus.Sunset] },
      risk: { in: [Risk.Critical, Risk.High] },
    },
    _count: { _all: true },
  });

  const sites = await prisma.site.findMany({ select: { id: true, name: true } });
  const siteMap = new Map(sites.map((site) => [site.id, site.name]));

  const summary = rows.map((row) => ({
    siteId: row.siteId,
    siteName: siteMap.get(row.siteId) ?? row.siteId,
    risk: row.risk,
    count: row._count._all,
  }));

  const totals = summary.reduce(
    (acc, item) => {
      if (item.risk === Risk.Critical) acc.critical += item.count;
      if (item.risk === Risk.High) acc.high += item.count;
      return acc;
    },
    { critical: 0, high: 0 }
  );

  return { summary, totals };
}
