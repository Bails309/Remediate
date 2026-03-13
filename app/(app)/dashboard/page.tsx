import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { StatCard } from "@/components/StatCard";
import { BucketFilter } from "@/components/BucketFilter";
import { Badge } from "@/components/Badge";
import { ClientDate } from "@/components/ClientDate";
import { auth } from "@/auth";
import { ThreatSummaryCard } from "@/components/ThreatSummaryCard";
import { Activity, Upload } from "lucide-react";
import { cn } from "@/components/cn";

export const metadata: Metadata = {
  title: "Dashboard",
};

const riskOrder = ["Critical", "High", "Medium", "Low"] as const;

export const dynamic = "force-dynamic";


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bucketId?: string }>;
}) {
  const params = await searchParams;
  const bucketId = params.bucketId;

  // Get counts of logical issues (unique groups) per risk
  const conditions: string[] = [`status = 'Open'`];
  const values: (string | number)[] = [];
  if (bucketId) {
    conditions.push(`"siteId" = $1::uuid`);
    values.push(bucketId);
  }
  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const [buckets, riskGroups, latestUploads] = await Promise.all([
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
    })
  ]);

  const counts = new Map(riskGroups.map((g: { risk: string; count: number }) => [g.risk, g.count]));

  return (
    <div className="space-y-10">
      {/* Header & Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Remediation Command Centre</h1>
          <p className="text-sm opacity-60 mt-1">Holistic view of your operational security posture.</p>
        </div>
        <div className="glass glass-edge px-4 py-2 rounded-2xl flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Filter</span>
          <BucketFilter buckets={buckets} selected={bucketId ?? ""} />
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {riskOrder.map((risk) => (
          <StatCard
            key={risk}
            label={risk}
            value={(counts.get(risk) as number) ?? 0}
            tone={risk.toLowerCase() as "critical" | "high" | "medium" | "low" | "neutral"}
          />
        ))}
      </div>

      {/* Secondary Row: Activity & Intelligence */}
      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-6">
          <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] opacity-40 mb-6 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Bucket Activity
            </h3>
            <div className="space-y-3">
              {latestUploads.length === 0 && <p className="text-xs opacity-50 italic">No activity yet recorded.</p>}
              {latestUploads.map((upload: any) => (
                <div key={upload.id} className="group relative flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 transition-all hover:bg-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-inset",
                      upload.status === "Completed" ? "bg-green-500/10 text-green-500 ring-green-500/20" : 
                      upload.status === "Failed" ? "bg-red-500/10 text-red-500 ring-red-500/20" : "bg-blue-500/10 text-blue-500 ring-blue-500/20"
                    )}>
                      <Upload size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs tracking-tight truncate">{upload.site.name}</p>
                      <ClientDate
                        date={upload.uploadDate}
                        className="block text-[9px] opacity-40 uppercase tracking-widest mt-0.5"
                      />
                    </div>
                  </div>
                  <Badge tone={upload.status === "Failed" ? "critical" : upload.status === "Completed" ? "low" : "medium"} 
                    className="text-[8px] py-0 px-1.5 h-4 border-none opacity-80 uppercase font-black tracking-tighter">
                    {upload.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] opacity-40 mb-4">Operational Tips</h3>
            <ul className="space-y-3 text-xs opacity-60">
              <li className="flex gap-2">
                <span className="text-blue-400 select-none items-center">•</span>
                <span>Assign owners early to reduce dwell time.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400 select-none">•</span>
                <span>Review &quot;No Fix&quot; weekly for vendor updates.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col min-h-[600px]">
          <ThreatSummaryCard />
        </div>
      </div>
    </div>
  );
}
