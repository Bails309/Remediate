"use client";

import { useState, useRef, useEffect, useMemo, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/cn";

export type SelectOption = {
  label: ReactNode;
  value: string;
  disabled?: boolean;
};

// We build a custom Props type that emulates standard select props closely enough
// while enabling our custom options list.
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  options?: SelectOption[];
  value?: string;
  placeholder?: string;
  direction?: "up" | "down";
  onChange?: (value: string) => void;
};

export function Select({
  className,
  options = [],
  value,
  onChange,
  disabled,
  placeholder = "Select...",
  direction = "down",
  title,
  ...props
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = useMemo(() => {
    const searchVal = value !== undefined ? String(value).trim() : undefined;
    const defaultVal = props.defaultValue !== undefined ? String(props.defaultValue).trim() : undefined;

    const target = searchVal !== undefined ? searchVal : defaultVal;
    if (target === undefined) return null;

    // Try exact match first
    let found = options.find(opt => String(opt.value).trim() === target);

    // Fallback to case-insensitive match
    if (!found) {
      found = options.find(opt =>
        String(opt.value).trim().toLowerCase() === target.toLowerCase()
      );
    }

    return found;
  }, [options, value, props.defaultValue]);

  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Hidden native select for form accessibility if needed */}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className="sr-only"
        {...props}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        ))}
      </select>

      <button
        type="button"
        disabled={disabled}
        title={title}
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-2xl px-5 text-sm outline-none transition-all duration-300",
          "bg-white/50 border border-slate-200 text-slate-900",
          "dark:bg-white/5 dark:border-white/10 dark:text-gray-100 dark:shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
          "focus:border-emerald-500/40 focus:ring-4 focus:ring-emerald-500/10",
          disabled && "opacity-50 cursor-not-allowed",
          isOpen && "border-emerald-500/40 ring-4 ring-emerald-500/10 shadow-lg",
          className
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((s) => !s);
        }}
      >
        <span className="truncate font-medium">{displayLabel}</span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 dark:text-slate-500 transition-all duration-300", isOpen && "rotate-180 text-emerald-500")} />
      </button>

      <div
        style={{ display: isOpen ? undefined : "none" }}
        className={cn(
          "absolute z-[100] w-full min-w-max overflow-hidden rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-xl text-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200",
          "dark:border-white/10 dark:bg-[#0A0F1C]/95 dark:text-gray-100",
          direction === "up" ? "bottom-full mb-3 origin-bottom" : "top-full mt-3 origin-top"
        )}
      >
        <ul className="max-h-64 overflow-y-auto overscroll-contain p-1.5 custom-scrollbar">
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                disabled={opt.disabled}
                className={cn(
                  "w-full px-4 py-3 text-left text-sm transition-all duration-200 rounded-xl flex items-center justify-between",
                  opt.disabled
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 group",
                  value === opt.value
                    ? "bg-slate-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                    : "text-slate-600 dark:text-slate-400"
                )}
                onClick={() => {
                  if (!opt.disabled) {
                    onChange?.(opt.value);
                    setIsOpen(false);
                  }
                }}
              >
                {opt.label}
                {value === opt.value && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                )}
              </button>
            </li>
          ))}
          {options.length === 0 && (
            <li className="px-5 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">No options available</li>
          )}
        </ul>
      </div>
    </div>
  );
}
