"use client";

import { useState, useRef, useEffect, useMemo, ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
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
  /** When true, shows a search input at the top of the dropdown to filter options by label. */
  searchable?: boolean;
  /** Placeholder for the search input. */
  searchPlaceholder?: string;
};

export function Select({
  className,
  options = [],
  value,
  onChange,
  disabled,
  placeholder = "Select...",
  direction = "down",
  searchable = false,
  searchPlaceholder = "Search\u2026",
  title,
  ...props
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus the search input whenever the dropdown opens.
  useEffect(() => {
    if (!isOpen || !searchable) return;
    const id = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen, searchable]);

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

  const visibleOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((opt) => {
      // Only filter on string labels; non-string labels (ReactNode) are always shown.
      if (typeof opt.label === "string") {
        return opt.label.toLowerCase().includes(q);
      }
      return String(opt.value).toLowerCase().includes(q);
    });
  }, [options, query, searchable]);

  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Hidden native select for form accessibility if needed */}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className="sr-only"
        {...({ placeholder } as unknown as Record<string, unknown>)}
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
          if (!disabled) {
            setIsOpen((s) => {
              const next = !s;
              // Reset the search query when opening so each open starts fresh.
              if (next && searchable) setQuery("");
              return next;
            });
          }
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
        {searchable && (
          <div className="relative border-b border-slate-200 p-2 dark:border-white/10">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl bg-slate-50 px-9 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500/30 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {query && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        <ul className="max-h-64 overflow-y-auto overscroll-contain p-1.5 custom-scrollbar">
          {visibleOptions.map((opt) => (
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
          {visibleOptions.length === 0 && (
            <li className="px-5 py-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
              {searchable && query ? `No matches for \u201c${query}\u201d` : "No options available"}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
