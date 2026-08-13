import { cn } from "@/components/cn";
import { ShieldCheck, TrendingDown, TrendingUp, Minus } from "lucide-react";

export type SecurityScoreProps = {
  score: number;
  /** Points gained/lost from findings discovered in the last 30 days. */
  delta: number;
  openWeighted: number;
  /** Weighted risk discovered per week, oldest first. */
  weeklyDiscovered: { label: string; value: number }[];
};

const RADIUS = 84;
const STROKE = 14;
// Semicircle: the arc spans 180° from left to right above the centre.
const ARC_LENGTH = Math.PI * RADIUS;

function toneFor(score: number) {
  if (score >= 80) return { stroke: "stroke-emerald-500", text: "text-emerald-500", chip: "bg-emerald-500/10 text-emerald-500" };
  if (score >= 50) return { stroke: "stroke-amber-500", text: "text-amber-500", chip: "bg-amber-500/10 text-amber-500" };
  return { stroke: "stroke-rose-500", text: "text-rose-500", chip: "bg-rose-500/10 text-rose-500" };
}

export function SecurityScoreCard({ score, delta, openWeighted, weeklyDiscovered }: SecurityScoreProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tone = toneFor(clamped);
  const dash = (clamped / 100) * ARC_LENGTH;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  const peak = Math.max(1, ...weeklyDiscovered.map((point) => point.value));
  const step = weeklyDiscovered.length > 1 ? 100 / (weeklyDiscovered.length - 1) : 100;
  const points = weeklyDiscovered.map((point, index) => `${index * step},${40 - (point.value / peak) * 34}`).join(" ");
  const area = `0,40 ${points} 100,40`;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden glass glass-edge card-glow spotlight rounded-[28px] p-6 lg:p-8">
      <span aria-hidden className="scanline-sweep" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight">Security Score</h3>
            <p className="text-xs opacity-50">Severity-weighted remediation posture</p>
          </div>
          <ShieldCheck className={cn("h-5 w-5 shrink-0", tone.text)} />
        </div>

        <div className="mt-4 flex justify-center">
          <svg viewBox="0 0 200 116" className="w-full max-w-[240px]" role="img" aria-label={`Security score ${clamped} out of 100`}>
            <path
              d={`M ${100 - RADIUS} 100 A ${RADIUS} ${RADIUS} 0 0 1 ${100 + RADIUS} 100`}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              className="stroke-[color:var(--color-foreground)] opacity-10"
            />
            {dash > 0 && (
              <path
                d={`M ${100 - RADIUS} 100 A ${RADIUS} ${RADIUS} 0 0 1 ${100 + RADIUS} 100`}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${ARC_LENGTH}`}
                className={cn(tone.stroke, "transition-[stroke-dasharray] duration-700")}
              />
            )}
            <text x="100" y="88" textAnchor="middle" className={cn("fill-current text-[44px] font-bold tracking-tight", tone.text)}>
              {clamped}
              <tspan className="text-[18px] opacity-60">%</tspan>
            </text>
          </svg>
        </div>

        <div className="mt-1 flex justify-center">
          <span
            className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold", tone.chip)}
            title="Points attributable to findings discovered in the last 30 days"
          >
            <DeltaIcon className="h-3 w-3" />
            {delta > 0 ? "+" : ""}{delta} pts · 30d
          </span>
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-widest opacity-40">
            <span>Risk discovered</span>
            <span>{openWeighted} open risk weight</span>
          </div>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 h-16 w-full" aria-hidden>
            <polygon points={area} className={cn("fill-current opacity-10", tone.text)} />
            <polyline points={points} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className={cn(tone.stroke)} />
          </svg>
          <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest opacity-40">
            <span>{weeklyDiscovered[0]?.label}</span>
            <span>{weeklyDiscovered[weeklyDiscovered.length - 1]?.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
