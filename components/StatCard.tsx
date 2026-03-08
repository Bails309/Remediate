import { cn } from "@/components/cn";

type Props = {
  label: string;
  value: number;
  tone?: "critical" | "high" | "medium" | "low" | "neutral";
};

export function StatCard({ label, value, tone = "neutral" }: Props) {
  const toneClass = "border-slate-200 dark:border-gray-700";
  let valueClass = "text-slate-900 dark:text-white";

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
        "glass glass-edge rounded-[28px] p-6 transition-all hover:scale-[1.02] hover:shadow-md",
        toneClass
      )}
    >
      <p className="text-xs uppercase font-semibold tracking-[0.2em] text-slate-500">{label}</p>
      <p className={cn("mt-4 text-4xl font-bold tracking-tight", valueClass)}>{value}</p>
    </div>
  );
}
