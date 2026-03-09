import { cn } from "@/components/cn";

type Props = {
  children: React.ReactNode;
  tone?: "critical" | "high" | "medium" | "low" | "neutral";
  className?: string;
  onClick?: () => void;
};

export function Badge({ children, tone = "neutral", className, onClick }: Props) {
  const toneClass =
    tone === "critical"
      ? "bg-[#3a0f0f] text-[#ffb4a4]"
      : tone === "high"
        ? "bg-[#3a240f] text-[#ffc07a]"
        : tone === "medium"
          ? "bg-[#2d2c16] text-[#ffe89b]"
          : tone === "low"
            ? "bg-[#0f2a24] text-[#8ff4e4]"
            : "bg-[color:var(--color-muted)] text-[color:var(--color-foreground)]";

  return (
    <span
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        onClick && "cursor-pointer transition-opacity hover:opacity-80 active:opacity-70",
        toneClass,
        className
      )}
    >
      {children}
    </span>
  );
}
