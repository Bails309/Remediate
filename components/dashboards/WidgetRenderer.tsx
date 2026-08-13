"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AnimatedNumber } from "@/components/AnimatedNumber";

export type WidgetData = {
  total: number;
  rows: { label: string; value: number }[];
  truncated: boolean;
};

const PALETTE = ["#00C8FF", "#22D3EE", "#818CF8", "#F472B6", "#FBBF24", "#34D399", "#F87171", "#A78BFA"];

const RISK_COLOURS: Record<string, string> = {
  Critical: "#F43F5E",
  High: "#FB923C",
  Medium: "#FBBF24",
  Low: "#34D399",
  None: "#94A3B8",
};

function colourFor(label: string, index: number) {
  return RISK_COLOURS[label] ?? PALETTE[index % PALETTE.length];
}

const axisProps = {
  stroke: "var(--color-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
  opacity: 0.5,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    fontSize: "12px",
  },
} as const;

export function WidgetRenderer({ viz, data, error }: { viz: string; data: WidgetData | null; error?: string | null }) {
  if (error) {
    return <p className="flex h-full items-center justify-center px-3 text-center text-xs text-rose-400">{error}</p>;
  }

  if (!data) {
    return <p className="flex h-full items-center justify-center text-xs opacity-50">Loading…</p>;
  }

  if (viz === "stat") {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <AnimatedNumber value={data.total} className="text-5xl font-bold tracking-tight" />
      </div>
    );
  }

  if (data.rows.length === 0) {
    return <p className="flex h-full items-center justify-center text-xs opacity-50">No data</p>;
  }

  if (viz === "table") {
    return (
      <div className="h-full overflow-auto pr-1 custom-scrollbar">
        <table className="w-full text-left text-xs">
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.label} className="border-b border-white/5 last:border-0">
                <td className="py-1.5 pr-2">{row.label}</td>
                <td className="py-1.5 text-right font-bold">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const chartData = data.rows.map((row) => ({ name: row.label, value: row.value }));

  if (viz === "donut") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={colourFor(entry.name, index)} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (viz === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-foreground)" opacity={0.08} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Line type="monotone" dataKey="value" stroke="#00C8FF" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" {...axisProps} interval={0} angle={chartData.length > 4 ? -20 : 0} height={40} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={entry.name} fill={colourFor(entry.name, index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
