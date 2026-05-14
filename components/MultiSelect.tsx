"use client";

import { useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/components/cn";

export type MultiSelectOption = {
  label: ReactNode;
  /** Plain-text label used for the trigger summary. Defaults to `label` if it is a string. */
  text?: string;
  value: string;
  disabled?: boolean;
};

type MultiSelectProps = {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Optional label shown in the trigger when nothing is selected (e.g. "All buckets"). */
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  direction?: "up" | "down";
  title?: string;
};

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  allLabel,
  disabled,
  className,
  direction = "down",
  title,
}: MultiSelectProps) {
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

  const selectedSet = useMemo(() => new Set(value), [value]);

  const summary = useMemo(() => {
    if (value.length === 0) return allLabel ?? placeholder;
    if (value.length === 1) {
      const opt = options.find((o) => o.value === value[0]);
      if (!opt) return `${value.length} selected`;
      return opt.text ?? (typeof opt.label === "string" ? opt.label : `${value.length} selected`);
    }
    return `${value.length} selected`;
  }, [value, options, allLabel, placeholder]);

  const toggle = (val: string) => {
    if (selectedSet.has(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const clearAll = () => onChange([]);

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-2xl px-5 text-sm outline-none transition-all duration-300",
          "bg-white/50 border border-slate-200 text-slate-900",
          "dark:bg-white/5 dark:border-white/10 dark:text-gray-100 dark:shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
          "focus:border-emerald-500/40 focus:ring-4 focus:ring-emerald-500/10",
          disabled && "opacity-50 cursor-not-allowed",
          isOpen && "border-emerald-500/40 ring-4 ring-emerald-500/10 shadow-lg",
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen((s) => !s);
        }}
      >
        <span className="truncate font-medium">{summary}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-slate-400 dark:text-slate-500 transition-all duration-300",
            isOpen && "rotate-180 text-emerald-500",
          )}
        />
      </button>

      <div
        style={{ display: isOpen ? undefined : "none" }}
        role="listbox"
        aria-multiselectable="true"
        className={cn(
          "absolute right-0 z-[100] w-full min-w-[14rem] max-w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white/90 backdrop-blur-xl text-slate-900 shadow-2xl animate-in fade-in zoom-in-95 duration-200",
          "dark:border-white/10 dark:bg-[#0A0F1C]/95 dark:text-gray-100",
          direction === "up" ? "bottom-full mb-3 origin-bottom" : "top-full mt-3 origin-top",
        )}
      >
        {(allLabel || value.length > 0) && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-white/10">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {value.length === 0 ? (allLabel ?? "All") : `${value.length} selected`}
            </span>
            {value.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        )}
        <ul className="max-h-64 overflow-y-auto overscroll-contain p-1.5 custom-scrollbar">
          {options.map((opt) => {
            const checked = selectedSet.has(opt.value);
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={opt.disabled}
                  className={cn(
                    "w-full px-4 py-3 text-left text-sm transition-all duration-200 rounded-xl flex items-center justify-between gap-3",
                    opt.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-slate-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 group",
                    checked
                      ? "bg-slate-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                      : "text-slate-600 dark:text-slate-400",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!opt.disabled) toggle(opt.value);
                  }}
                >
                  <span className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-slate-300 dark:border-white/20 bg-transparent",
                      )}
                      aria-hidden="true"
                    >
                      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-5 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
              No options available
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
