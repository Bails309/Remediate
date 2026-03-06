"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/cn";
import { Shield, Upload, LayoutGrid, Bug, Settings, Inbox, Mail, PieChart } from "lucide-react";
import { useSession } from "next-auth/react";

const baseNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/uploads", label: "Uploads", icon: Upload },
  { href: "/vulnerabilities", label: "Vulnerabilities", icon: Bug },
  { href: "/sites", label: "Sites", icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const nav = session?.user?.role === "Admin"
    ? [
      ...baseNav,
      { href: "/admin/oidc", label: "Admin", icon: Settings },
      { href: "/admin/import", label: "Import Settings", icon: Settings },
      { href: "/admin/dead-letter", label: "Dead Letters", icon: Inbox },
      { href: "/admin/reports", label: "Reports", icon: Mail },
    ]
    : baseNav;

  return (
    <aside className="glass glass-edge hidden h-full w-64 flex-col gap-6 rounded-[32px] p-6 lg:flex">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--color-accent)] text-white font-semibold">
          R
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[color:var(--color-accent-2)]">Remediate</p>
          <p className="text-lg font-semibold">Nessus Triage</p>
        </div>
      </div>
      <nav className="flex flex-col gap-2">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-[20px] px-4 py-3.5 text-sm font-medium transition-all",
                active
                  ? "glass glass-edge shadow-[0_8px_16px_rgba(0,0,0,0.1)] text-[color:var(--color-accent)]"
                  : "text-[color:var(--color-foreground)] opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-2xl border border-[color:var(--color-border)] p-4 text-xs text-[color:var(--color-foreground)]">
        <p className="font-semibold">Environment</p>
        <p className="opacity-70">Secure triage workspace</p>
      </div>
    </aside>
  );
}
