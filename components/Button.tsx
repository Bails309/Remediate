import React from "react";
import { cn } from "@/components/cn";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline";
  size?: "default" | "sm";
  loading?: boolean;
};

export function Button({ className, variant = "primary", size = "default", loading, children, title, ...props }: Props) {
  const isDisabled = Boolean(loading || props.disabled);
  const button = (
    <button
      aria-disabled={isDisabled}
      disabled={isDisabled}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition gap-2",
        size === "default" ? "px-4 py-2 text-sm font-semibold" : "px-3 py-1 text-xs font-medium",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-gradient-to-br from-cyan-600/20 to-cyan-700/20 border border-cyan-500/30 text-cyan-700 shadow-[0_4px_12px_rgba(0,180,255,0.1)] hover:from-cyan-600/30 hover:to-cyan-700/30 hover:shadow-[0_4px_20px_rgba(0,180,255,0.2)] active:scale-[0.98]",
        variant === "primary" && "dark:from-[#00C8FF]/15 dark:to-[#00C8FF]/5 dark:border-[#00C8FF]/30 dark:text-[#00C8FF] dark:shadow-[0_0_20px_rgba(0,200,255,0.1)] dark:hover:from-[#00C8FF]/25 dark:hover:to-[#00C8FF]/15 dark:hover:shadow-[0_0_30px_rgba(0,200,255,0.2)]",
        variant === "outline" &&
        "border border-slate-300 bg-transparent text-slate-700 rounded-md hover:bg-slate-50 transition-all",
        variant === "outline" && "dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800",
        variant === "ghost" && "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-muted)]",
        className
      )}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );

  // Many browsers do not show native tooltips for disabled buttons. If the
  // button is disabled but a title is provided, wrap it in a span that has
  // the title so the tooltip is visible on hover.
  if (isDisabled && title) {
    return (
      <span title={title} className="inline-block">
        {button}
      </span>
    );
  }

  return (
    // Pass title to the button when not disabled so native tooltip appears
    React.cloneElement(button, { title })
  );
}
