"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileText, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/components/cn";

interface ExportDropdownProps {
  onExport: (format: "csv" | "json" | "pdf") => Promise<void> | void;
  loading?: boolean;
  label?: string;
  size?: "default" | "sm";
  variant?: "primary" | "outline" | "ghost";
  align?: "left" | "right";
  className?: string;
  title?: string;
}

export function ExportDropdown({
  onExport,
  loading = false,
  label = "Export",
  size = "default",
  variant = "outline",
  align = "right",
  className,
  title,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleSelect = async (format: "csv" | "json" | "pdf") => {
    setOpen(false);
    await onExport(format);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !loading && setOpen((prev) => !prev)}
        disabled={loading}
        title={title}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center justify-center rounded-full transition gap-2 font-semibold select-none",
          size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variant === "outline" &&
            "border border-slate-300 dark:border-white/10 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-sm",
          variant === "primary" &&
            "bg-gradient-to-br from-cyan-600/20 to-cyan-700/20 border border-cyan-500/30 text-cyan-700 dark:from-[#00C8FF]/15 dark:to-[#00C8FF]/5 dark:border-[#00C8FF]/30 dark:text-[#00C8FF] hover:from-cyan-600/30 hover:to-cyan-700/30 shadow-[0_4px_12px_rgba(0,180,255,0.1)]",
          variant === "ghost" &&
            "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
          className
        )}
      >
        {loading ? (
          <Loader2 className={cn("animate-spin", size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
        ) : (
          <Download className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4")} />
        )}
        <span>{label}</span>
        <ChevronDown
          className={cn(
            "transition-transform duration-200 opacity-60",
            size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-2 w-56 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Export Format
          </div>

          <button
            type="button"
            onClick={() => handleSelect("csv")}
            className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-200"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                CSV Document
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Excel, Sheets & external teams
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("pdf")}
            className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-200"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                PDF Report
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Formatted executive & vendor report
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSelect("json")}
            className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-200"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-400">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                JSON Data
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Structured for APIs & automations
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
