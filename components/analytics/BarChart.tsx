"use client";

import {
    Bar,
    BarChart as RechartsBarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    Cell
} from "recharts";

interface DataPoint {
    name: string;
    value: number;
    fill?: string;
}

interface BarChartProps {
    data: DataPoint[];
    unit?: string;
}

export function BarChart({ data, unit }: BarChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-[300px] items-center justify-center text-sm opacity-50">
                No data available
            </div>
        );
    }

    return (
        <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <XAxis
                        dataKey="name"
                        stroke="var(--color-foreground)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        opacity={0.5}
                    />
                    <YAxis
                        stroke="var(--color-foreground)"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        opacity={0.5}
                        tickFormatter={(value) => unit ? `${value}${unit.toLowerCase().startsWith('day') ? 'd' : ''}` : value}
                    />
                    <Tooltip
                        cursor={{ fill: "transparent" }}
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-3 shadow-xl backdrop-blur-xl">
                                        <p className="mb-1 font-medium">{payload[0].payload.name}</p>
                                        <p className="text-sm font-semibold" style={{ color: payload[0].payload.fill }}>
                                            {payload[0].value} {unit ?? ""}
                                        </p>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 6, 6]} barSize={40}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill || "var(--color-foreground)"} />
                        ))}
                    </Bar>
                </RechartsBarChart>
            </ResponsiveContainer>
        </div>
    );
}
