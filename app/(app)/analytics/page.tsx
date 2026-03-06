import { prisma } from "@/lib/prisma";
import { SiteFilter } from "@/components/SiteFilter";
import { TrendChart } from "@/components/analytics/TrendChart";
import { HeatmapTable } from "@/components/analytics/HeatmapTable";
import { StatusDonutChart } from "@/components/analytics/StatusDonutChart";
import { BarChart } from "@/components/analytics/BarChart";

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<{ siteId?: string }>;
}) {
    const params = await searchParams;
    const siteId = params.siteId;

    const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });

    // 1. Trend Data (Mocked over 7 days based on current totals per Option A)
    const currentRiskCounts = await prisma.vulnerability.groupBy({
        by: ["risk"],
        where: {
            ...(siteId ? { siteId } : {}),
            status: "Open"
        },
        _count: { _all: true },
    });

    const riskMap = new Map(currentRiskCounts.map(g => [g.risk, g._count._all]));

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

    // 2. Unassigned Tasks
    const unassignedGroups = await prisma.vulnerability.groupBy({
        by: ["risk"],
        where: {
            ...(siteId ? { siteId } : {}),
            status: "Open",
            assigneeId: null,
        },
        _count: { _all: true },
    });
    const unassignedMap = new Map(unassignedGroups.map(g => [g.risk, g._count._all]));
    const unassignedData = [{
        id: 'unassigned',
        name: 'Unassigned',
        Critical: unassignedMap.get('Critical') || 0,
        High: unassignedMap.get('High') || 0,
        Medium: unassignedMap.get('Medium') || 0,
        Low: unassignedMap.get('Low') || 0,
        Total: (unassignedMap.get('Critical') || 0) + (unassignedMap.get('High') || 0) + (unassignedMap.get('Medium') || 0) + (unassignedMap.get('Low') || 0)
    }];

    // 3. Vulnerabilities By Site
    const sitesDataRaw = await prisma.site.findMany({
        include: {
            vulnerabilities: {
                where: {
                    status: "Open"
                },
                select: { risk: true }
            }
        }
    });

    const sitesData = sitesDataRaw.map(site => {
        const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        site.vulnerabilities.forEach(v => {
            if (counts[v.risk as keyof typeof counts] !== undefined) counts[v.risk as keyof typeof counts]++;
        });
        return {
            id: site.id,
            name: site.name,
            ...counts,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        };
    }).filter(s => s.Total > 0 && (!siteId || s.id === siteId));

    // 4. Tasks By Tech
    const techDataRaw = await prisma.user.findMany({
        include: {
            vulnerabilities: {
                where: {
                    ...(siteId ? { siteId } : {}),
                    status: "Open"
                },
                select: { risk: true }
            }
        }
    });

    const techData = techDataRaw.map(tech => {
        const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        tech.vulnerabilities.forEach(v => {
            if (counts[v.risk as keyof typeof counts] !== undefined) counts[v.risk as keyof typeof counts]++;
        });
        return {
            id: tech.id,
            name: tech.name,
            ...counts,
            Total: counts.Critical + counts.High + counts.Medium + counts.Low
        };
    }).filter(t => t.Total > 0);

    // 5. Remediation Status Overview
    const statusCounts = await prisma.vulnerability.groupBy({
        by: ["status"],
        where: {
            ...(siteId ? { siteId } : {}),
        },
        _count: { _all: true },
    });

    const statusColors: Record<string, string> = {
        Open: "#ef4444",         // Red
        Remediated: "#22c55e",   // Green
        FalsePositive: "#eab308", // Yellow
        NoFixAvailable: "#8b5cf6" // Purple
    };

    const statusData = statusCounts.map(g => ({
        name: g.status,
        value: g._count._all,
        color: statusColors[g.status] || "#3b82f6"
    }));

    // 6. Top 5 Most Vulnerable Hosts
    const hostsRaw = await prisma.vulnerability.groupBy({
        by: ["host", "risk"],
        where: {
            ...(siteId ? { siteId } : {}),
            status: "Open"
        },
        _count: { _all: true },
    });

    // Aggregate risks by host
    const hostAggregates = new Map<string, { Critical: number, High: number, Medium: number, Low: number }>();
    hostsRaw.forEach(h => {
        if (!h.host) return;
        const current = hostAggregates.get(h.host) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        current[h.risk as keyof typeof current] += h._count._all;
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
        .slice(0, 5);

    // 7. Top 5 Most Common Vulnerabilities
    const commonRaw = await prisma.vulnerability.groupBy({
        by: ["name", "risk"],
        where: {
            ...(siteId ? { siteId } : {}),
            status: "Open"
        },
        _count: { _all: true },
    });

    // Aggregate risks by vulnerability name
    const commonAggregates = new Map<string, { Critical: number, High: number, Medium: number, Low: number }>();
    commonRaw.forEach(v => {
        if (!v.name) return;
        const current = commonAggregates.get(v.name) || { Critical: 0, High: 0, Medium: 0, Low: 0 };
        current[v.risk as keyof typeof current] += v._count._all;
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
        .slice(0, 5);

    // 8. Average Dwell Time by Risk (Days)
    const openVulns = await prisma.vulnerability.findMany({
        where: {
            ...(siteId ? { siteId } : {}),
            status: "Open"
        },
        select: {
            risk: true,
            createdAt: true
        }
    });

    const now = Date.now();
    const dwellAggregates = {
        Critical: { totalDays: 0, count: 0 },
        High: { totalDays: 0, count: 0 },
        Medium: { totalDays: 0, count: 0 },
        Low: { totalDays: 0, count: 0 },
    };

    openVulns.forEach(v => {
        if (v.risk === 'None') return;
        const daysOpen = (now - v.createdAt.getTime()) / (1000 * 60 * 60 * 24);
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
                        <p className="text-sm opacity-70">Visualizing vulnerability metrics across sites.</p>
                    </div>
                    <SiteFilter sites={sites} selected={siteId ?? ""} />
                </div>

                <div className="mt-8 overflow-hidden rounded-[24px] border border-[color:var(--color-border)] bg-[color:var(--color-card)]/50 pt-6">
                    <h3 className="px-6 pb-4 text-lg font-semibold">Vulnerability Levels Over Time</h3>
                    <TrendChart data={trendData} />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Top 5 Most Vulnerable Hosts</h3>
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

            <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                <h3 className="mb-6 font-semibold text-lg">Top 5 Most Common Vulnerabilities</h3>
                <HeatmapTable title="" data={commonVulnData} showTotal={true} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Current Vulnerability Count by Site</h3>
                        <HeatmapTable title="" data={sitesData} />
                    </div>
                </div>
                <div className="space-y-6">
                    <div className="glass glass-edge rounded-[28px] p-6 lg:p-8">
                        <h3 className="mb-6 font-semibold text-lg">Task Count Assigned Per Tech</h3>
                        <HeatmapTable title="" data={techData} />
                    </div>
                </div>
            </div>
        </div>
    );
}
