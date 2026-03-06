"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

type TrendData = {
    date: number;
    Critical: number;
    High: number;
    Medium: number;
    Low: number;
};

export function TrendChart({ data }: { data: TrendData[] }) {
    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                    <XAxis
                        dataKey="date"
                        stroke="currentColor"
                        opacity={0.6}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(val) => {
                            if (!val) return "";
                            return new Date(val).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                            });
                        }}
                    />
                    <YAxis
                        stroke="currentColor"
                        opacity={0.6}
                        tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--color-card)",
                            borderColor: "var(--color-border)",
                            borderRadius: "16px",
                            backdropFilter: "blur(24px)",
                            color: "var(--color-foreground)"
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, opacity: 0.8 }} />
                    <Line
                        type="monotone"
                        dataKey="Critical"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="High"
                        stroke="#f97316"
                        strokeWidth={2}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="Medium"
                        stroke="#eab308"
                        strokeWidth={2}
                        dot={false}
                    />
                    <Line
                        type="monotone"
                        dataKey="Low"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
