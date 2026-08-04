import { cn } from "@/components/cn";
import { AnimatedNumber } from "@/components/AnimatedNumber";

type Props = {
  label: string;
  value: number;
  tone?: "critical" | "high" | "medium" | "low" | "neutral";
  icon?: React.ElementType;
  iconColor?: string;
  iconBg?: string;
};

export function StatCard({ label, value, tone = "neutral", icon: Icon, iconColor, iconBg }: Props) {
  const toneClass = "border-slate-200 dark:border-gray-700";
  let valueClass = "text-slate-900 dark:text-white";
  const glowClass = `num-glow-${tone}`;

  if (tone !== "neutral") {
    if (tone === "critical") {
      valueClass = "text-[#E11D48]";
    } else if (tone === "high") {
      valueClass = "text-[#EA580C]";
    } else if (tone === "medium") {
      valueClass = "text-[#D97706]";
    } else if (tone === "low") {
      valueClass = "text-[#2563EB]";
    }
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden glass glass-edge hud card-glow spotlight rounded-[28px] p-6 transition-all hover:scale-[1.02]",
        toneClass
      )}
    >
      <span aria-hidden className="scanline-sweep" />
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase font-semibold tracking-[0.2em] text-slate-500">{label}</p>
          {Icon && (
            <div className={cn("p-2 rounded-xl ring-1 ring-inset", iconBg || "bg-slate-500/10", iconColor || "text-slate-500")}>
              <Icon size={16} />
            </div>
          )}
        </div>
        <AnimatedNumber
          value={value}
          className={cn("mt-4 block text-4xl font-bold tracking-tight tabular-nums", valueClass, glowClass)}
        />
      </div>
    </div>
  );
}
