"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function SideSheet({ open, onClose, title, children }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-[color:var(--color-card)] p-6 shadow-2xl",
          "border-l border-[color:var(--color-border)]"
        )}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="text-sm opacity-60 hover:opacity-100" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mt-6 space-y-4 text-sm">{children}</div>
      </div>
    </div>
  );
}
