"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/cn";
import { Button } from "@/components/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, onClose, title, children, footer }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-300 animate-in fade-in">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 p-8 shadow-2xl transition-all duration-300 animate-in zoom-in-95",
          "bg-white/95 backdrop-blur-xl dark:bg-slate-900/95 text-slate-900 dark:text-white"
        )}
      >
        <h3 className="text-xl font-bold tracking-tight italic mb-4">{title}</h3>
        <div className="mb-6">{children}</div>
        <div className="flex justify-end gap-3">
          {footer || (
            <>
              <Button variant="ghost" onClick={onClose} className="text-slate-600 dark:text-slate-400">
                Cancel
              </Button>
              <Button onClick={onClose}>Confirm</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
