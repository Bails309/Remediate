"use client";

import { useState, useRef, useEffect, ReactNode } from "react";
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
  onChange?: (value: string) => void;
};

export function Select({
  className,
  options = [],
  value,
  onChange,
  disabled,
  placeholder = "Select...",
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

  const selectedOption = options.find((opt) => opt.value === value) || options.find((opt) => opt.value === props.defaultValue);
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
        className={cn(
          "flex h-12 w-full items-center justify-between rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-5 text-sm text-[color:var(--color-foreground)] outline-none transition",
          "focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:color-mix(in srgb,var(--color-accent) 35%,transparent)]",
          disabled && "opacity-50 cursor-not-allowed",
          isOpen && "border-[color:var(--color-accent)] ring-2 ring-[color:color-mix(in srgb,var(--color-accent) 35%,transparent)]"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn("h-4 w-4 opacity-50 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="!absolute z-50 mt-2 w-full min-w-max overflow-hidden rounded-2xl glass-dropdown glass-edge max-h-60 overflow-y-auto">
          <ul className="py-1">
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  disabled={opt.disabled}
                  className={cn(
                    "w-full px-5 py-3 text-left text-sm transition-colors",
                    opt.disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:glass-dropdown-item-hover",
                    value === opt.value && "glass-dropdown-item-active text-[color:var(--color-foreground)]"
                  )}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange?.(opt.value);
                      setIsOpen(false);
                    }
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-5 py-3 text-sm opacity-50">No options</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
