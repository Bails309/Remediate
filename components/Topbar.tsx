"use client";

import { ThemeToggle } from "@/components/ThemeToggle";
import { usePathname } from "next/navigation";
import { MobileNav } from "./MobileNav";
import type { Session } from "next-auth";

export function Topbar({ session }: { session?: Session | null }) {
  const pathname = usePathname();
  const isTools = pathname?.startsWith("/tools");

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <MobileNav session={session} />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[color:var(--color-accent-2)] mb-0.5">
            {isTools ? "CyberDefend" : "Vulnerability"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white uppercase">
            {isTools ? "Security Command" : "Remediation Command Centre"}
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
      </div>
    </header>
  );
}
