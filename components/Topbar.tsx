"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { usePathname } from "next/navigation";

export function Topbar() {
  const pathname = usePathname();
  const isTools = pathname?.startsWith("/tools");

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[color:var(--color-accent-2)] mb-0.5">
          {isTools ? "CyberDefend" : "Vulnerability"}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white uppercase">
          {isTools ? "Security Command" : "Remediation Command Centre"}
        </h1>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
      </div>
    </header>
  );
}
