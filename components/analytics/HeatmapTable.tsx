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
    idProp?: string;
};

function getCellColor(risk: "Critical" | "High" | "Medium" | "Low" | "Total", count: number) {
    if (risk === "Total") return count > 0 ? "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
    if (count === 0) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
    if (risk === "Critical") return "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400";
    if (risk === "High") return "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400";
    if (risk === "Medium") return "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400";
    if (risk === "Low") return "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400";
    return "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-300";
}

export function HeatmapTable({ title, data, showTotal = false, idProp }: Props) {
    return (
        <div className="glass glass-edge rounded-[24px] overflow-hidden">
            {title && (
                <div className="p-5 border-b border-[color:var(--color-border)]">
                    <h3 className="font-semibold text-lg">{title}</h3>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead id={idProp}>
                        <tr className="bg-[color:var(--color-muted)]/50">
                            <th className="p-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                            <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Critical</th>
                            <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">High</th>
                            <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Medium</th>
                            <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Low</th>
                            {showTotal && <th className="p-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                        {data.map((row) => (
                            <tr key={row.id}>
                                <td className="p-4 text-left font-medium border-r border-[color:var(--color-border)]">
                                    {row.name}
                                </td>
                                <td className="p-4">
                                    <span className={cn("inline-flex items-center justify-center px-2 py-1 text-xs font-bold rounded-full", getCellColor("Critical", row.Critical))}>
                                        {row.Critical}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <span className={cn("inline-flex items-center justify-center px-2 py-1 text-xs font-bold rounded-full", getCellColor("High", row.High))}>
                                        {row.High}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <span className={cn("inline-flex items-center justify-center px-2 py-1 text-xs font-bold rounded-full", getCellColor("Medium", row.Medium))}>
                                        {row.Medium}
                                    </span>
                                </td>
                                <td className="p-4 border-r border-[color:var(--color-border)]">
                                    <span className={cn("inline-flex items-center justify-center px-2 py-1 text-xs font-bold rounded-full", getCellColor("Low", row.Low))}>
                                        {row.Low}
                                    </span>
                                </td>
                                {showTotal && (
                                    <td className="p-4">
                                        <span className={cn("inline-flex items-center justify-center px-2 py-1 text-xs font-bold rounded-full", getCellColor("Total", row.Total ?? 0))}>
                                            {row.Total}
                                        </span>
                                    </td>
                                )}
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
