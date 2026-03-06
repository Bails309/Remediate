"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/cn";
import { Shield, Upload, LayoutGrid, Bug, Settings, Inbox, Mail, PieChart } from "lucide-react";
import type { Session } from "next-auth";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";

const baseNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/uploads", label: "Uploads", icon: Upload },
  { href: "/vulnerabilities", label: "Vulnerabilities", icon: Bug },
  { href: "/sites", label: "Sites", icon: Shield },
];

export function Sidebar({ session }: { session?: Session | null }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nav = session?.user?.role === "Admin"
    ? [
      ...baseNav,
      { href: "/admin/oidc", label: "Admin", icon: Settings },
      { href: "/admin/import", label: "Import Settings", icon: Settings },
      { href: "/admin/dead-letter", label: "Dead Letters", icon: Inbox },
      { href: "/admin/reports", label: "Reports", icon: Mail },
    ]
    : baseNav;

  const logoSrc = mounted && theme === "light" ? "/logo-light.jpg" : "/logo-dark.jpg";

  return (
    <aside className="glass glass-edge hidden h-full w-64 flex-col gap-8 rounded-[32px] p-6 lg:flex">
      <div className="flex flex-col items-center gap-4 pt-4 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-[24px] bg-white/5 p-1 ring-1 ring-white/10 transition-all hover:scale-105 hover:bg-white/10">
          <div className="h-full w-full overflow-hidden rounded-[20px]">
            {mounted ? (
              <Image
                src={logoSrc}
                alt="Logo"
                width={72}
                height={72}
                className="h-full w-full object-cover"
                priority
                unoptimized
              />
            ) : (
              <div className="h-full w-full bg-[color:var(--color-accent)] animate-pulse" />
            )}
          </div>
          <div className="absolute inset-0 -z-10 rounded-[24px] blur-xl bg-[color:var(--color-accent)] opacity-10" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[color:var(--color-accent-2)]">Remediate</p>
          <p className="mt-1 text-xl font-bold tracking-tight">Nessus Triage</p>
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
