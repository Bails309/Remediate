import type { InputHTMLAttributes } from "react";
import { cn } from "@/components/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-[color:var(--color-border)] bg-transparent px-4 text-sm outline-none transition focus:border-[color:var(--color-accent)]",
        className
      )}
      {...props}
    />
  );
}
