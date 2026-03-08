import type { InputHTMLAttributes } from "react";
import { cn } from "@/components/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border px-4 text-sm outline-none transition",
        "bg-background border-border text-foreground placeholder:text-muted-foreground",
        "focus:border-accent focus:ring-2 focus:ring-accent/20",
        className
      )}
      {...props}
    />
  );
}
