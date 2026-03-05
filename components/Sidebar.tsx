"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/cn";
import { Shield, Upload, LayoutGrid, Bug, Settings, Inbox, Mail } from "lucide-react";
import { useSession } from "next-auth/react";

const baseNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
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
        { href: "/admin/dead-letter", label: "Dead Letters", icon: Inbox },
        { href: "/admin/reports", label: "Reports", icon: Mail },
      ]
    : baseNav;

  return (
    <aside className="glass grid-texture hidden h-full w-64 flex-col gap-6 rounded-[28px] p-6 lg:flex">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--color-accent)] text-white font-semibold">
          R
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-[color:var(--color-accent-2)]">Remediate</p>
          <p className="text-lg font-semibold">Nessus Triage</p>
        </div>
      </div>
      <nav className="flex flex-col gap-3">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                active
                  ? "bg-[color:var(--color-foreground)] text-[color:var(--color-background)]"
                  : "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-muted)]"
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
