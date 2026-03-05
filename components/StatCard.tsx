import { cn } from "@/components/cn";

type Props = {
  label: string;
  value: number;
  tone?: "critical" | "high" | "medium" | "low" | "neutral";
};

export function StatCard({ label, value, tone = "neutral" }: Props) {
  const toneClass =
    tone === "critical"
      ? "border-[#ff8b77]"
      : tone === "high"
        ? "border-[#ffb067]"
        : tone === "medium"
          ? "border-[#ffe38a]"
          : tone === "low"
            ? "border-[#7be9d9]"
            : "border-[color:var(--color-border)]";

  return (
    <div className={cn("glass rounded-[26px] border p-6", toneClass)}>
      <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-accent-2)]">{label}</p>
      <p className="mt-4 text-4xl font-semibold">{value}</p>
    </div>
  );
}
