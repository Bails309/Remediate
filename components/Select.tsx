import type { SelectHTMLAttributes } from "react";
import { cn } from "@/components/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 text-sm text-[color:var(--color-foreground)] outline-none",
        className
      )}
      {...props}
    />
  );
}
