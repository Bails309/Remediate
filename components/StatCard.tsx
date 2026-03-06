import { cn } from "@/components/cn";

type Props = {
  label: string;
  value: number;
  tone?: "critical" | "high" | "medium" | "low" | "neutral";
};

export function StatCard({ label, value, tone = "neutral" }: Props) {
  let toneClass = "border-[color:var(--color-border)]";

  if (tone !== "neutral") {
    if (value === 0) {
      toneClass = "!bg-green-500/15 !border-green-500/30 text-inherit";
    } else if (tone === "critical") {
      toneClass = "!bg-red-500/15 !border-red-500/30 text-inherit";
    } else if (tone === "high") {
      toneClass = "!bg-orange-600/15 !border-orange-600/30 text-inherit";
    } else if (tone === "medium") {
      toneClass = "!bg-yellow-500/15 !border-yellow-500/30 text-inherit";
    } else if (tone === "low") {
      toneClass = "!bg-blue-500/15 !border-blue-500/30 text-inherit";
    }
  }

  return (
    <div className={cn("glass glass-edge rounded-[24px] border p-6 transition-transform hover:scale-[1.02]", toneClass)}>
      <p className="text-xs uppercase font-semibold tracking-[0.2em] opacity-80">{label}</p>
      <p className="mt-4 text-5xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
