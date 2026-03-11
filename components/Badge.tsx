import { cn } from "@/components/cn";

type Props = {
  children: React.ReactNode;
  tone?: "critical" | "high" | "medium" | "low" | "neutral";
  className?: string;
  onClick?: () => void;
  title?: string;
};

export function Badge({ children, tone = "neutral", className, onClick, title }: Props) {
  const toneClass =
    tone === "critical"
      ? "bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400 dark:bg-red-500/20 dark:border-red-500/40 dark:shadow-[0_0_12px_rgba(255,51,51,0.3)]"
      : tone === "high"
        ? "bg-orange-500/10 border-orange-500/50 text-orange-600 dark:text-orange-400 dark:bg-orange-500/20 dark:border-orange-500/40 dark:shadow-[0_0_12px_rgba(234,88,12,0.3)]"
        : tone === "medium"
          ? "bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400 dark:bg-amber-500/20 dark:border-amber-500/40 dark:shadow-[0_0_12px_rgba(245,158,11,0.2)]"
          : tone === "low"
            ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:shadow-[0_0_12px_rgba(16,185,129,0.2)]"
            : "bg-slate-100 border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-400";

  return (
    <span
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-all",
        onClick && "cursor-pointer hover:opacity-80 active:opacity-70",
        toneClass,
        className
      )}
    >
      {children}
    </span>
  );
}
