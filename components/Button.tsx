import { cn } from "@/components/cn";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-[color:var(--color-accent)] text-white hover:opacity-90",
        variant === "outline" &&
          "border border-[color:var(--color-border)] text-[color:var(--color-foreground)] hover:bg-[color:var(--color-muted)]",
        variant === "ghost" && "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-muted)]",
        className
      )}
      {...props}
    />
  );
}
