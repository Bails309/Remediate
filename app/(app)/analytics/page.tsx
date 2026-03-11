import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { BucketFilter } from "@/components/BucketFilter";
import { TrendChart } from "@/components/analytics/TrendChart";
import { HeatmapTable } from "@/components/analytics/HeatmapTable";
import { StatusDonutChart } from "@/components/analytics/StatusDonutChart";
import { BarChart } from "@/components/analytics/BarChart";

export const metadata: Metadata = {
    title: "Analytics",
};

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ bucketId?: string }>;
}) {
    const params = await searchParams;
    const bucketId = params.bucketId;
    const nowVal = new Date().getTime();

    const buckets = await prisma.site.findMany({ orderBy: { name: "asc" } });

    // Define common where conditions for raw SQL
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    if (bucketId) {
        conditions.push(`"siteId" = $1::uuid`);
        values.push(bucketId);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Trend Data (Logical Issue Counts)
    const currentRiskGroups = await prisma.$queryRawUnsafe<{ risk: string; count: number }[]>(`
        SELECT risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") risk
            FROM "Vulnerability"
            ${whereClause ? whereClause + " AND status = 'Open'" : "WHERE status = 'Open'"}
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY risk
    `, ...values);

    const riskMap = new Map(currentRiskGroups.map(g => [g.risk, g.count]));

    const trendData = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        trendData.push({
            date: d.getTime(),
            Critical: riskMap.get('Critical') || 0,
            High: riskMap.get('High') || 0,
            Medium: riskMap.get('Medium') || 0,
            Low: riskMap.get('Low') || 0,
        });
    }

    // 2. Unassigned Tasks (Logical)
    const unassignedRisks = await prisma.$queryRawUnsafe<{ risk: string; count: number }[]>(`
        SELECT risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") risk
            FROM "Vulnerability"
            ${whereClause ? whereClause + " AND status = 'Open' AND \"assigneeId\" IS NULL" : "WHERE status = 'Open' AND \"assigneeId\" IS NULL"}
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY risk
    `, ...values);

    const unassignedMap = new Map(unassignedRisks.map(g => [g.risk, g.count]));
    const unassignedData = [{
        id: 'unassigned',
        name: 'Unassigned',
        Critical: unassignedMap.get('Critical') || 0,
        High: unassignedMap.get('High') || 0,
        Medium: unassignedMap.get('Medium') || 0,
        Low: unassignedMap.get('Low') || 0,
        Total: (unassignedMap.get('Critical') || 0) + (unassignedMap.get('High') || 0) + (unassignedMap.get('Medium') || 0) + (unassignedMap.get('Low') || 0)
    }];

    // 3. Vulnerabilities By Bucket (Logical)
    const bucketsDataRaw = await prisma.$queryRawUnsafe<{ siteId: string; risk: string; count: number }[]>(`
        SELECT "siteId"::text as "siteId", risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") "siteId", risk
            FROM "Vulnerability"
            WHERE status = 'Open'
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY "siteId", risk
    `);

    interface RiskCounts {
        Critical: number;
        High: number;
        Medium: number;
        Low: number;
        [key: string]: number;
    }

    const bucketsMap = new Map<string, RiskCounts>();
    bucketsDataRaw.forEach(row => {
        if (!bucketsMap.has(row.siteId)) {
            bucketsMap.set(row.siteId, { Critical: 0, High: 0, Medium: 0, Low: 0 });
        }
        const counts = bucketsMap.get(row.siteId);
        if (counts) {
            counts[row.risk] = row.count;
        }
    });

    const bucketsData = buckets.map(site => {
        const counts = bucketsMap.get(site.id) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        return {
            id: site.id,
            name: site.name,
            ...counts,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        };
    }).filter(s => s.Total > 0 && (!bucketId || s.id === bucketId));

    // 4. Tasks By Tech (Logical)
    const techDataRaw = await prisma.$queryRawUnsafe<{ assigneeId: string; risk: string; count: number }[]>(`
        SELECT "assigneeId"::text as "assigneeId", risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") "assigneeId", risk
            FROM "Vulnerability"
            ${whereClause ? whereClause + " AND status = 'Open' AND \"assigneeId\" IS NOT NULL" : "WHERE status = 'Open' AND \"assigneeId\" IS NOT NULL"}
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY "assigneeId", risk
    `, ...values);

    const techCountsMap = new Map<string, RiskCounts>();
    techDataRaw.forEach(row => {
        if (!techCountsMap.has(row.assigneeId)) {
            techCountsMap.set(row.assigneeId, { Critical: 0, High: 0, Medium: 0, Low: 0 });
        }
        const counts = techCountsMap.get(row.assigneeId);
        if (counts) {
            counts[row.risk] = row.count;
        }
    });

    const users = await prisma.user.findMany();
    const techData = users.map(user => {
        const counts = techCountsMap.get(user.id) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        return {
            id: user.id,
            name: user.name,
            ...counts,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        };
    }).filter(t => t.Total > 0);

    const techDataTop = techData
        .slice()
        .sort((a, b) => b.Total - a.Total)
        .slice(0, 6);

    // 5. Remediation Status Overview (Logical)
    const statusRiskGroups = await prisma.$queryRawUnsafe<{ status: string; count: number }[]>(`
        SELECT status::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") status
            FROM "Vulnerability"
            ${whereClause}
            ORDER BY name, host, port, "pluginId"
        ) as groups
        GROUP BY status
    `, ...values);

    const statusColors: Record<string, string> = {
        Open: "#ef4444",         // Red
        Remediated: "#22c55e",   // Green
        FalsePositive: "#eab308", // Yellow
        NoFixAvailable: "#8b5cf6" // Purple
    };

    const statusData = statusRiskGroups.map(g => ({
        name: g.status,
        value: g.count,
        color: statusColors[g.status] || "#3b82f6"
    }));

    // 6. Top 6 Most Vulnerable Hosts (Logical)
    const hostRiskGroups = await prisma.$queryRawUnsafe<{ host: string; risk: string; count: number }[]>(`
        SELECT host::text, risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") host, risk
            FROM "Vulnerability"
            ${whereClause ? whereClause + " AND status = 'Open'" : "WHERE status = 'Open'"}
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY host, risk
    `, ...values);

    const hostAggregates = new Map<string, { Critical: number, High: number, Medium: number, Low: number }>();
    hostRiskGroups.forEach(h => {
        const current = hostAggregates.get(h.host) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        current[h.risk as keyof typeof current] += h.count;
        hostAggregates.set(h.host, current);
    });

    const topHostsData = Array.from(hostAggregates.entries())
        .map(([host, counts]) => ({
            id: host,
            name: host,
            ...counts,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        }))
        .sort((a, b) => b.Total - a.Total)
        .slice(0, 6);

    // 7. Top 6 Most Common Vulnerabilities (Logical)
    const commonVulnGroups = await prisma.$queryRawUnsafe<{ name: string; risk: string; count: number }[]>(`
        SELECT name::text, risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") name, risk
            FROM "Vulnerability"
            ${whereClause ? whereClause + " AND status = 'Open'" : "WHERE status = 'Open'"}
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY name, risk
    `, ...values);

    const commonAggregates = new Map<string, { Critical: number, High: number, Medium: number, Low: number }>();
    commonVulnGroups.forEach(v => {
        const current = commonAggregates.get(v.name) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        current[v.risk as keyof typeof current] += v.count;
        commonAggregates.set(v.name, current);
    });

    const commonVulnData = Array.from(commonAggregates.entries())
        .map(([name, counts]) => ({
            id: name,
            name: name,
            ...counts,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        }))
        .sort((a, b) => b.Total - a.Total)
        .slice(0, 6);

    // 8. Aging SLA Data (Logical)
    const agingGroups = await prisma.$queryRawUnsafe<{ createdAt: Date; risk: string }[]>(`
        SELECT "createdAt", risk::text FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") "createdAt", risk
            FROM "Vulnerability"
            ${whereClause ? whereClause + " AND status = 'Open'" : "WHERE status = 'Open'"}
            ORDER BY name, host, port, "pluginId", "createdAt" ASC
        ) as groups
    `, ...values);

    const agingCounts = { "0-30 Days": 0, "31-60 Days": 0, "61-90 Days": 0, "91+ Days": 0 };
    agingGroups.forEach(v => {
        const days = Math.floor((nowVal - new Date(v.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (days <= 30) agingCounts["0-30 Days"]++;
        else if (days <= 60) agingCounts["31-60 Days"]++;
        else if (days <= 90) agingCounts["61-90 Days"]++;
        else agingCounts["91+ Days"]++;
    });

    const agingData = Object.entries(agingCounts).map(([name, value]) => ({
        name,
        value,
        fill: name === "91+ Days" ? "#ef4444" : name === "61-90 Days" ? "#f97316" : name === "31-60 Days" ? "#eab308" : "#22c55e"
    }));

    // 9. Average Dwell Time by Risk (Logical)
    const dwellAggregates = {
        Critical: { totalDays: 0, count: 0 },
        High: { totalDays: 0, count: 0 },
        Medium: { totalDays: 0, count: 0 },
        Low: { totalDays: 0, count: 0 },
    };

    agingGroups.forEach(v => {
        const daysOpen = (nowVal - new Date(v.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const agg = dwellAggregates[v.risk as keyof typeof dwellAggregates];
        if (agg) {
            agg.totalDays += daysOpen;
            agg.count += 1;
        }
    });

    const dwellTimeData = [
        { name: 'Critical', value: dwellAggregates.Critical.count > 0 ? Math.round(dwellAggregates.Critical.totalDays / dwellAggregates.Critical.count) : 0, fill: "var(--color-critical, #ef4444)" },
        { name: 'High', value: dwellAggregates.High.count > 0 ? Math.round(dwellAggregates.High.totalDays / dwellAggregates.High.count) : 0, fill: "var(--color-high, #f97316)" },
        { name: 'Medium', value: dwellAggregates.Medium.count > 0 ? Math.round(dwellAggregates.Medium.totalDays / dwellAggregates.Medium.count) : 0, fill: "var(--color-medium, #eab308)" },
        { name: 'Low', value: dwellAggregates.Low.count > 0 ? Math.round(dwellAggregates.Low.totalDays / dwellAggregates.Low.count) : 0, fill: "var(--color-low, #3b82f6)" },
    ];

    return (
        <div className="space-y-8">
            <div className="glass glass-edge rounded-[32px] p-6 lg:p-8">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold">Analytics Overview</h2>
                        <p className="text-sm opacity-70">Visualizing vulnerability metrics across buckets.</p>
                    </div>
                    <BucketFilter buckets={buckets} selected={bucketId ?? ""} />
                </div>

                <div className="mt-8 overflow-hidden rounded-[24px] border border-[color:var(--color-border)] bg-[color:var(--color-card)]/50 pt-6">
                    <h3 className="px-6 pb-4 text-lg font-semibold">Vulnerability Levels Over Time</h3>
                    <TrendChart data={trendData} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Top 6 Most Vulnerable Hosts</h3>
                        <HeatmapTable title="" data={topHostsData} showTotal={true} />
                    </div>
                </div>
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Average Dwell Time by Risk (Days)</h3>
                        <BarChart data={dwellTimeData} />
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8 lg:col-span-2">
                    <h3 className="mb-6 font-semibold text-lg">Unassigned Task Count by Severity</h3>
                    <HeatmapTable title="" data={unassignedData} showTotal={true} />
                </div>
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                    <h3 className="mb-6 font-semibold text-lg">Remediation Status</h3>
                    <StatusDonutChart data={statusData} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                    <h3 className="mb-6 font-semibold text-lg">Top 6 Most Common Vulnerabilities</h3>
                    <HeatmapTable title="" data={commonVulnData} showTotal={true} />
                </div>
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                    <h3 className="mb-6 font-semibold text-lg">Vulnerability Aging (SLA)</h3>
                    <BarChart data={agingData} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Current Vulnerability Count by Bucket</h3>
                        <HeatmapTable title="" data={bucketsData} />
                    </div>
                </div>
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Task Count Assigned Per Tech</h3>
                        <HeatmapTable title="" data={techDataTop} />
                    </div>
                </div>
            </div>
        </div>
    );
}
