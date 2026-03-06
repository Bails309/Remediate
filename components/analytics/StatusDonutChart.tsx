"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

type StatusData = {
    name: string;
    value: number;
    color: string;
};

export function StatusDonutChart({ data }: { data: StatusData[] }) {
    if (data.length === 0) {
        return (
            <div className="flex h-[250px] items-center justify-center text-sm opacity-60">
                No data to display.
            </div>
        );
    }

    return (
        <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--color-card)",
                            borderColor: "var(--color-border)",
                            borderRadius: "16px",
                            backdropFilter: "blur(24px)",
                            color: "var(--color-foreground)"
                        }}
                        itemStyle={{ color: "var(--color-foreground)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, opacity: 0.8 }} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
