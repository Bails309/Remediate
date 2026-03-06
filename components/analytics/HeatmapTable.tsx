"use client";

import { cn } from "@/components/cn";

type TableData = {
    id: string;
    name: string;
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
    Total?: number;
};

type Props = {
    title: string;
    data: TableData[];
    showTotal?: boolean;
};

function getCellColor(risk: "Critical" | "High" | "Medium" | "Low" | "Total", count: number) {
    if (risk === "Total") return count > 0 ? "bg-red-500/20 text-red-700 dark:text-red-400" : "bg-green-500/20 text-green-700 dark:text-green-400";

    if (count === 0) return "bg-green-500/20 text-green-700 dark:text-green-400";
    if (risk === "Critical") return "bg-red-600/30 text-red-800 dark:text-red-300";
    if (risk === "High") {
        if (count > 20) return "bg-red-500/30 text-red-800 dark:text-red-300";
        return "bg-yellow-500/30 text-yellow-800 dark:text-yellow-300";
    }
    if (risk === "Medium") {
        if (count > 50) return "bg-red-500/30 text-red-800 dark:text-red-300";
        if (count > 10) return "bg-sky-500/30 text-sky-800 dark:text-sky-300";
        return "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300";
    }
    if (risk === "Low") {
        if (count > 20) return "bg-yellow-500/30 text-yellow-800 dark:text-yellow-300";
        return "bg-green-500/20 text-green-700 dark:text-green-400";
    }
    return "bg-[color:var(--color-muted)]";
}

export function HeatmapTable({ title, data, showTotal = false }: Props) {
    return (
        <div className="glass glass-edge rounded-[24px] overflow-hidden">
            {title && (
                <div className="p-5 border-b border-[color:var(--color-border)]">
                    <h3 className="font-semibold text-lg">{title}</h3>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead>
                        <tr className="bg-[color:var(--color-muted)]/50">
                            <th className="p-4 text-left font-semibold text-[color:var(--color-foreground)] opacity-70">Name</th>
                            <th className="p-4 font-semibold text-[color:var(--color-foreground)] opacity-70">Critical</th>
                            <th className="p-4 font-semibold text-[color:var(--color-foreground)] opacity-70">High</th>
                            <th className="p-4 font-semibold text-[color:var(--color-foreground)] opacity-70">Medium</th>
                            <th className="p-4 font-semibold text-[color:var(--color-foreground)] opacity-70">Low</th>
                            {showTotal && <th className="p-4 font-semibold text-[color:var(--color-foreground)] opacity-70">Total</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                        {data.map((row) => (
                            <tr key={row.id}>
                                <td className="p-4 text-left font-medium bg-blue-500/10 border-r border-[color:var(--color-border)]">
                                    {row.name}
                                </td>
                                <td className={cn("p-4 font-semibold", getCellColor("Critical", row.Critical))}>{row.Critical}</td>
                                <td className={cn("p-4 font-semibold", getCellColor("High", row.High))}>{row.High}</td>
                                <td className={cn("p-4 font-semibold", getCellColor("Medium", row.Medium))}>{row.Medium}</td>
                                <td className={cn("p-4 font-semibold border-r border-[color:var(--color-border)]", getCellColor("Low", row.Low))}>{row.Low}</td>
                                {showTotal && <td className={cn("p-4 font-bold", getCellColor("Total", row.Total ?? 0))}>{row.Total}</td>}
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={showTotal ? 6 : 5} className="p-8 text-center opacity-60">
                                    No data to display.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
