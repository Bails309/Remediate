import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { BucketFilter } from "@/components/BucketFilter";
import { TrendChart } from "@/components/analytics/TrendChart";
import { TrendRangeFilter } from "@/components/analytics/TrendRangeFilter";
import { HeatmapTable } from "@/components/analytics/HeatmapTable";
import { StatusDonutChart } from "@/components/analytics/StatusDonutChart";
import { BarChart } from "@/components/analytics/BarChart";
import { InfoTooltip } from "@/components/InfoTooltip";

export const metadata: Metadata = {
    title: "Analytics",
};

export const dynamic = "force-dynamic";

interface TrendDataPoint {
    date: number;
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
    [key: string]: number;
}

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ bucketId?: string; bucketIds?: string; range?: string }>;
}) {
    const params = await searchParams;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bucketIds = (params.bucketIds ? params.bucketIds.split(",") : params.bucketId ? [params.bucketId] : [])
        .map((s) => s.trim())
        .filter((s) => UUID_RE.test(s));
    const range = params.range || "7d";
    const nowVal = new Date().getTime();

    const buckets = await prisma.site.findMany({ orderBy: { name: "asc" } });

    // Define common where conditions for raw SQL
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    if (bucketIds.length > 0) {
        const placeholders = bucketIds.map((_, i) => `$${i + 1}::uuid`).join(", ");
        conditions.push(`"siteId" IN (${placeholders})`);
        values.push(...bucketIds);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Trend Data (Historical Reconstruction)
    const intervalMap: Record<string, string> = {
        "7d": "7 days",
        "30d": "30 days",
        "3m": "3 months",
        "6m": "6 months",
        "12m": "12 months"
    };
    const interval = intervalMap[range] || "7 days";

    const trendValues: (string | number)[] = [interval];
    let trendWhere = "";
    if (bucketIds.length > 0) {
        // $1 is the interval param; bucket placeholders start at $2.
        const placeholders = bucketIds.map((_, i) => `$${i + 2}::uuid`).join(", ");
        trendWhere = `AND "siteId" IN (${placeholders})`;
        trendValues.push(...bucketIds);
    }

    interface TrendGroupRow { day: Date; risk: string; count: number }
    const trendGroups = (await prisma.$queryRawUnsafe(`
        WITH dates AS (
            SELECT (generate_series(
                (CURRENT_DATE - $1::interval), 
                CURRENT_DATE, 
                '1 day'::interval
            ))::date AS day
        ),
        active_vulns AS (
            SELECT risk, "createdAt", NULL::timestamp as "archivedAt", "siteId"
            FROM "Vulnerability"
            WHERE status IN ('Open', 'InProgress', 'InProgressWithCR')
            AND status != 'Sunset'
            UNION ALL
            SELECT risk, "createdAt", "archivedAt", "siteId"
            FROM "VulnerabilityHistory"
        )
        SELECT 
            d.day, 
            v.risk::text, 
            count(v.risk)::int as count
        FROM dates d
        LEFT JOIN active_vulns v ON v."createdAt"::date <= d.day 
            AND (v."archivedAt" IS NULL OR v."archivedAt"::date > d.day)
            ${trendWhere}
        GROUP BY d.day, v.risk
        ORDER BY d.day ASC;
    `, ...trendValues)) as TrendGroupRow[];

    const trendMap = new Map<number, TrendDataPoint>();
    trendGroups.forEach((row: TrendGroupRow) => {
        const time = new Date(row.day).getTime();
        if (!trendMap.has(time)) {
            trendMap.set(time, { date: time, Critical: 0, High: 0, Medium: 0, Low: 0 });
        }
        const point = trendMap.get(time);
        if (point && row.risk) {
            point[row.risk as keyof RiskCounts] = row.count;
        }
    });

    const trendData = Array.from(trendMap.values()).sort((a, b) => a.date - b.date);

    // 2. Unassigned Tasks (Logical)
    interface RiskCountRow { risk: string; count: number }
    const unassignedRisks = (await prisma.$queryRawUnsafe(`
        SELECT risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") risk
            FROM "Vulnerability"
            ${whereClause}
            ${whereClause ? "AND" : "WHERE"} status IN ('Open', 'InProgress', 'InProgressWithCR') AND status != 'Sunset' AND "assigneeId" IS NULL
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY risk
    `, ...values)) as RiskCountRow[];

    const unassignedMap = new Map<string, number>(unassignedRisks.map((g: RiskCountRow) => [g.risk, g.count]));
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
    interface BucketRiskRow { siteId: string; risk: string; count: number }
    const bucketsDataRaw = (await prisma.$queryRawUnsafe(`
        SELECT "siteId"::text as "siteId", risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") "siteId", risk
            FROM "Vulnerability"
            WHERE status IN ('Open', 'InProgress', 'InProgressWithCR') AND status != 'Sunset'
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY "siteId", risk
    `)) as BucketRiskRow[];

    interface RiskCounts {
        Critical: number;
        High: number;
        Medium: number;
        Low: number;
        [key: string]: number;
    }

    const bucketsMap = new Map<string, RiskCounts>();
    bucketsDataRaw.forEach((row: BucketRiskRow) => {
        if (!bucketsMap.has(row.siteId)) {
            bucketsMap.set(row.siteId, { Critical: 0, High: 0, Medium: 0, Low: 0 });
        }
        const counts = bucketsMap.get(row.siteId);
        if (counts) {
            counts[row.risk] = row.count;
        }
    });

    interface BucketDataEntry {
        id: string;
        name: string;
        Critical: number;
        High: number;
        Medium: number;
        Low: number;
        Total: number;
    }

    const bucketsData: BucketDataEntry[] = buckets.map((site: { id: string; name: string }) => {
        const counts = bucketsMap.get(site.id) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        return {
            id: site.id,
            name: site.name,
            Critical: counts.Critical,
            High: counts.High,
            Medium: counts.Medium,
            Low: counts.Low,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        };
    }).filter((s: BucketDataEntry) => s.Total > 0 && (bucketIds.length === 0 || bucketIds.includes(s.id)));

    // 4. Tasks By Tech (Logical)
    const users = await prisma.user.findMany();
    interface TechRiskRow { assigneeId: string; risk: string; count: number }
    const techDataRaw = (await prisma.$queryRawUnsafe(`
        SELECT "assigneeId"::text as "assigneeId", risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") "assigneeId", risk
            FROM "Vulnerability"
            ${whereClause}
            ${whereClause ? "AND" : "WHERE"} status IN ('Open', 'InProgress', 'InProgressWithCR') AND status != 'Sunset' AND "assigneeId" IS NOT NULL
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY "assigneeId", risk
    `, ...values)) as TechRiskRow[];

    const techCountsMap = new Map<string, RiskCounts>();
    techDataRaw.forEach((row: TechRiskRow) => {
        if (!techCountsMap.has(row.assigneeId)) {
            techCountsMap.set(row.assigneeId, { Critical: 0, High: 0, Medium: 0, Low: 0 });
        }
        const counts = techCountsMap.get(row.assigneeId);
        if (counts) {
            counts[row.risk] = row.count;
        }
    });

    interface TechDataEntry {
        id: string;
        name: string;
        Critical: number;
        High: number;
        Medium: number;
        Low: number;
        Total: number;
        [key: string]: number | string;
    }

    const techData: TechDataEntry[] = users.map((user: { id: string; name: string | null }) => {
        const counts = techCountsMap.get(user.id) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        return {
            id: user.id,
            name: user.name ?? "Unknown",
            Critical: counts.Critical,
            High: counts.High,
            Medium: counts.Medium,
            Low: counts.Low,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        };
    }).filter((t: TechDataEntry) => t.Total > 0);

    const techDataTop = techData
        .slice()
        .sort((a: { Total: number }, b: { Total: number }) => b.Total - a.Total)
        .slice(0, 6);

    // 5. Remediation Status Overview (Logical)
    interface StatusRiskRow { status: string; count: number }
    const statusRiskGroups = (await prisma.$queryRawUnsafe(`
        WITH all_vulns AS (
            SELECT status, name, host, port, "pluginId", "siteId"
            FROM "Vulnerability"
            WHERE status != 'Sunset'
            UNION ALL
            SELECT status, name, host, port, "pluginId", "siteId"
            FROM "VulnerabilityHistory"
            WHERE "archivedAt" >= NOW() - INTERVAL '7 days'
        )
        SELECT status::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") status
            FROM all_vulns
            ${whereClause}
            ORDER BY name, host, port, "pluginId", status
        ) as groups
        GROUP BY status
    `, ...values)) as StatusRiskRow[];

    const statusColors: Record<string, string> = {
        Open: "#ef4444",         // Red
        InProgress: "#3b82f6",   // Blue
        InProgressWithCR: "#6366f1", // Indigo
        Remediated: "#22c55e",   // Green
        FalsePositive: "#eab308", // Yellow
        NoFixAvailable: "#8b5cf6" // Purple
    };

    const statusData = statusRiskGroups.map((g: { status: string; count: number }) => ({
        name: g.status,
        value: g.count,
        color: statusColors[g.status] || "#3b82f6"
    }));

    // 6. Top 6 Most Vulnerable Hosts (Logical)
    interface HostRiskRow { host: string; risk: string; count: number }
    const hostRiskGroups = (await prisma.$queryRawUnsafe(`
        SELECT host::text, risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") host, risk
            FROM "Vulnerability"
            ${whereClause}
            ${whereClause ? "AND" : "WHERE"} status IN ('Open', 'InProgress', 'InProgressWithCR') AND status != 'Sunset'
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY host, risk
    `, ...values)) as HostRiskRow[];

    const hostAggregates = new Map<string, { Critical: number, High: number, Medium: number, Low: number }>();
    hostRiskGroups.forEach((h: HostRiskRow) => {
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
    interface CommonVulnRow { name: string; risk: string; count: number }
    const commonVulnGroups = (await prisma.$queryRawUnsafe(`
        SELECT name::text, risk::text, count(*)::int as count FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") name, risk
            FROM "Vulnerability"
            ${whereClause}
            ${whereClause ? "AND" : "WHERE"} status IN ('Open', 'InProgress', 'InProgressWithCR') AND status != 'Sunset'
            ORDER BY name, host, port, "pluginId", risk ASC
        ) as groups
        GROUP BY name, risk
    `, ...values)) as CommonVulnRow[];

    const commonAggregates = new Map<string, { Critical: number, High: number, Medium: number, Low: number }>();
    commonVulnGroups.forEach((v: CommonVulnRow) => {
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
    interface AgingRow { createdAt: Date; risk: string }
    const agingGroups = (await prisma.$queryRawUnsafe(`
        SELECT "createdAt", risk::text FROM (
            SELECT DISTINCT ON (name, host, port, "pluginId") "createdAt", risk
            FROM "Vulnerability"
            ${whereClause}
            ${whereClause ? "AND" : "WHERE"} status IN ('Open', 'InProgress', 'InProgressWithCR') AND status != 'Sunset'
            ORDER BY name, host, port, "pluginId", "createdAt" ASC
        ) as groups
    `, ...values)) as AgingRow[];

    const agingCounts = { "0-30 Days": 0, "31-60 Days": 0, "61-90 Days": 0, "91+ Days": 0 };
    agingGroups.forEach((v: { createdAt: Date; risk: string }) => {
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

    agingGroups.forEach((v: { createdAt: Date; risk: string }) => {
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

    // 10. Sunset Items Analytics
    interface SunsetRow { name: string; host: string; risk: string; createdAt: Date; lastSeenAt: Date }
    const sunsetItems = (await prisma.$queryRawUnsafe(`
        SELECT name::text, host::text, risk::text, "createdAt", "lastSeenAt"
        FROM "Vulnerability"
        ${whereClause}
        ${whereClause ? "AND" : "WHERE"} status = 'Sunset'
        ORDER BY "createdAt" ASC
    `, ...values)) as SunsetRow[];

    const sunsetAgingBuckets = { "0-30 Days": 0, "31-60 Days": 0, "61-90 Days": 0, "91+ Days": 0 };
    sunsetItems.forEach((v: SunsetRow) => {
        const days = Math.floor((nowVal - new Date(v.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        if (days <= 30) sunsetAgingBuckets["0-30 Days"]++;
        else if (days <= 60) sunsetAgingBuckets["31-60 Days"]++;
        else if (days <= 90) sunsetAgingBuckets["61-90 Days"]++;
        else sunsetAgingBuckets["91+ Days"]++;
    });

    const sunsetAgingData = Object.entries(sunsetAgingBuckets).map(([name, value]) => ({
        name,
        value,
        fill: name === "91+ Days" ? "#ea580c" : name === "61-90 Days" ? "#f97316" : name === "31-60 Days" ? "#fb923c" : "#fdba74"
    }));

    const sunsetByRisk = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    sunsetItems.forEach((v: SunsetRow) => {
        const key = v.risk as keyof typeof sunsetByRisk;
        if (key in sunsetByRisk) sunsetByRisk[key]++;
    });

    const sunsetRiskData = [
        { name: "Critical", value: sunsetByRisk.Critical, color: "#ef4444" },
        { name: "High", value: sunsetByRisk.High, color: "#f97316" },
        { name: "Medium", value: sunsetByRisk.Medium, color: "#eab308" },
        { name: "Low", value: sunsetByRisk.Low, color: "#3b82f6" },
    ].filter(d => d.value > 0);

    const sunsetTotal = sunsetItems.length;

    return (
        <div className="space-y-8">
            <div id="tour-analytics-overview" className="glass glass-edge rounded-[32px] p-6 lg:p-8">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-semibold">Analytics Overview</h2>
                        <p className="text-sm opacity-70">Visualizing vulnerability metrics across buckets.</p>
                    </div>
                    <BucketFilter buckets={buckets} selected={bucketIds} />
                </div>

                <div id="tour-analytics-trend" className="mt-8 overflow-hidden rounded-[24px] border border-[color:var(--color-border)] bg-[color:var(--color-card)]/50 pt-6">
                    <div className="flex items-center justify-between px-6 pb-4">
                        <h3 className="text-lg font-semibold">Vulnerability Levels Over Time</h3>
                        <TrendRangeFilter selected={range} />
                    </div>
                    <TrendChart data={trendData} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                    <div id="tour-analytics-hosts" className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Top 6 Most Vulnerable Hosts</h3>
                        <HeatmapTable title="" data={topHostsData} showTotal={true} />
                    </div>
                </div>
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <div className="mb-6 flex items-center gap-2">
                            <h3 className="font-semibold text-lg leading-none">Average Dwell Time by Risk (Days)</h3>
                            <InfoTooltip text="Average Dwell Time is the typical number of days it takes to fix a vulnerability once it's discovered. Lower numbers mean we're finding and fixing issues faster." />
                        </div>
                        <BarChart data={dwellTimeData} unit="Days" />
                    </div>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8 lg:col-span-2">
                    <h3 className="mb-6 font-semibold text-lg">Unassigned Task Count by Severity</h3>
                    <HeatmapTable title="" data={unassignedData} showTotal={true} />
                </div>
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                    <div className="mb-6 flex items-center gap-2">
                        <h3 className="font-semibold text-lg leading-none">Remediation Status</h3>
                        <InfoTooltip text="This chart shows the current status of all open vulnerabilities, plus any vulnerabilities archived in the past 7 days to provide recent remediation context." />
                    </div>
                    <StatusDonutChart data={statusData} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                    <h3 className="mb-6 font-semibold text-lg">Top 6 Most Common Vulnerabilities</h3>
                    <HeatmapTable title="" data={commonVulnData} showTotal={true} />
                </div>
                <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                    <div className="mb-6 flex items-center gap-2">
                        <h3 className="font-semibold text-lg leading-none">Vulnerability Aging (SLA)</h3>
                        <InfoTooltip text="Vulnerability Aging shows how long our currently open issues have been active. Ideally, we want most issues in the 0-30 days bucket, as older issues represent longer periods of risk exposure." />
                    </div>
                    <BarChart data={agingData} unit="Vulnerabilities" />
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

            {sunsetTotal > 0 ? (
                <div className="glass glass-edge rounded-[32px] p-6 lg:p-8 border-l-4 border-l-orange-400">
                    <div className="mb-8">
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-semibold">Sunset Items</h2>
                            <span className="inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-500/10 px-3 py-1 text-sm font-bold text-orange-700 dark:text-orange-400">{sunsetTotal} total</span>
                        </div>
                        <p className="text-sm opacity-70 mt-1">Vulnerabilities in the Sunset stage are excluded from all other analytics. This section tracks how long items have been in Sunset.</p>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                            <div className="mb-6 flex items-center gap-2">
                                <h3 className="font-semibold text-lg leading-none">Sunset Aging</h3>
                                <InfoTooltip text="How long vulnerabilities have been in the Sunset status, measured from their original creation date." />
                            </div>
                            <BarChart data={sunsetAgingData} unit="Vulnerabilities" />
                        </div>
                        <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                            <div className="mb-6 flex items-center gap-2">
                                <h3 className="font-semibold text-lg leading-none">Sunset by Severity</h3>
                                <InfoTooltip text="Breakdown of Sunset items by their risk severity level." />
                            </div>
                            <StatusDonutChart data={sunsetRiskData} />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass glass-edge rounded-[32px] p-6 lg:p-8 border-l-4 border-l-orange-400">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-semibold">Sunset Items</h2>
                        <span className="inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-500/10 px-3 py-1 text-sm font-bold text-orange-700 dark:text-orange-400">0 total</span>
                    </div>
                    <p className="text-sm opacity-70 mt-2">No vulnerabilities are currently in the Sunset stage. Move items to Sunset status from the vulnerabilities page to track them here.</p>
                </div>
            )}
        </div>
    );
}
