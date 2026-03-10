"use client";

import { useState, useRef } from "react";
import { Info } from "lucide-react";

type Props = {
  text: string;
  className?: string;
};

export function InfoTooltip({ text, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  return (
    <div className={"inline-block " + (className ?? "")} ref={ref}>
      <button
        type="button"
        aria-label={text}
        onMouseEnter={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/5 text-[10px] text-slate-500 hover:bg-white/10"
      >
        <Info className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute z-50 mt-2 w-64 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {text}
        </div>
      )}
    </div>
  );
}
