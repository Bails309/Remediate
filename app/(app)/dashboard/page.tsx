import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/StatCard";
import { SiteFilter } from "@/components/SiteFilter";
import { Badge } from "@/components/Badge";
import { ClientDate } from "@/components/ClientDate";

const riskOrder = ["Critical", "High", "Medium", "Low"] as const;

export const dynamic = "force-dynamic";


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const params = await searchParams;
  const siteId = params.siteId;

  // Get counts of logical issues (unique groups) per risk
  const conditions: string[] = [`status != 'Remediated'`];
  const values: any[] = [];
  if (siteId) {
    conditions.push(`"siteId" = $1::uuid`);
    values.push(siteId);
  }
  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const [sites, riskGroups, latest] = await Promise.all([
    prisma.site.findMany({ orderBy: { name: "asc" } }),
    prisma.$queryRawUnsafe<{ risk: string; count: number }[]>(`
      SELECT risk::text, count(*)::int as count FROM (
        SELECT DISTINCT ON (name, host, port, "pluginId") risk
        FROM "Vulnerability"
        ${whereClause}
        ORDER BY name, host, port, "pluginId", risk ASC
      ) as groups
      GROUP BY risk
    `, ...values),
    prisma.uploadHistory.findMany({
      include: { site: true },
      orderBy: { uploadDate: "desc" },
      take: 5,
    }),
  ]);

  const counts = new Map(riskGroups.map((g) => [g.risk, g.count]));

  return (
    <div className="space-y-8">
      <div className="glass glass-edge rounded-[32px] p-6 lg:p-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Risk Overview</h2>
            <p className="text-sm opacity-70">Active issues across your selected site.</p>
          </div>
          <SiteFilter sites={sites} selected={siteId ?? ""} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {riskOrder.map((risk) => (
            <StatCard
              key={risk}
              label={risk}
              value={counts.get(risk) ?? 0}
              tone={risk.toLowerCase() as "critical" | "high" | "medium" | "low" | "neutral"}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
          <h3 className="text-lg font-semibold">Recent Uploads</h3>
          <div className="mt-6 space-y-4">
            {latest.length === 0 && <p className="text-sm opacity-60">No uploads yet.</p>}
            {latest.map((upload) => (
              <div key={upload.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{upload.site.name}</p>
                  <ClientDate
                    date={upload.uploadDate}
                    className="block text-xs opacity-60"
                  />
                </div>
                <Badge tone={upload.status === "Failed" ? "critical" : upload.status === "Completed" ? "low" : "medium"}>
                  {upload.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
          <h3 className="text-lg font-semibold">Operational Tips</h3>
          <ul className="mt-4 space-y-3 text-sm opacity-70">
            <li>Upload one site at a time to preserve lifecycle accuracy.</li>
            <li>Assign owners early to reduce dwell time.</li>
            <li>Review "No Fix" weekly for vendor updates.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
