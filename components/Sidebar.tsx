"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/cn";
import { Shield, Activity, Upload, Users, Settings, LogOut, ChevronRight, LayoutGrid, PieChart, Bug, Wrench, Briefcase, ChevronDown, UsersRound } from "lucide-react";
import { FeedbackButton } from "@/components/FeedbackButton";
import type { Session } from "next-auth";
import { useTheme } from "next-themes";
import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";

export const baseNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/analytics", label: "Analytics", icon: PieChart },
  { href: "/vulnerabilities", label: "Vulnerabilities", icon: Bug },
];

export const adminNavItems = [
  { href: "/uploads", label: "Uploads", icon: Upload, title: "Manage Nessus CSV and pentest PDF uploads" },
  { href: "/buckets", label: "Buckets", icon: Shield, title: "Manage tracked buckets and their settings" },
  { href: "/admin/settings", label: "Settings", icon: Settings, title: "Configure Auth, Storage, Imports and Reporting" },
  { href: "/admin/operations", label: "System Status", icon: Activity, title: "Inspect infrastructure health and dead-letter queues" },
  { href: "/admin/users", label: "Users", icon: Users, title: "Manage application users and roles" },
  { href: "/admin/groups", label: "Groups", icon: UsersRound, title: "Manage groups/departments and their members" },
];

export const toolsNavItems = [
  { href: "/threat-intelligence", label: "Intelligence", icon: Activity },
  { href: "/tools", label: "Tools", icon: Wrench },
];

export function Sidebar({ session }: { session?: Session | null }) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const roles = session?.user?.roles || [];
  const isWebAdmin = roles.includes("site_admin") || roles.includes("web_app_admin");
  const isToolkitUser = roles.includes("site_admin") || roles.includes("toolkit_admin") || roles.includes("toolkit_user");
  const isAuditor = roles.includes("web_app_auditor")
    && !roles.includes("site_admin")
    && !roles.includes("web_app_admin")
    && !roles.includes("web_app_user");
  const visibleToolsNavItems = isToolkitUser
    ? toolsNavItems
    : isAuditor
      ? toolsNavItems.filter((item) => item.href === "/threat-intelligence")
      : [];

  const isAdminChildActive = useMemo(() =>
    adminNavItems.some(item => pathname === item.href),
    [pathname]);

  const [isAdminExpanded, setIsAdminExpanded] = useState(isAdminChildActive);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Sync expansion state if pathname changes to an admin child (during render to avoid cascading renders)
  const [prevAdminChildActive, setPrevAdminChildActive] = useState(isAdminChildActive);
  if (isAdminChildActive !== prevAdminChildActive) {
    setPrevAdminChildActive(isAdminChildActive);
    if (isAdminChildActive) {
      setIsAdminExpanded(true);
    }
  }

  const logoSrc = mounted && theme === "light" ? "/logo-light.jpg" : "/logo-dark.jpg";

  return (
    <aside id="tour-sidebar" className="glass glass-edge sticky top-6 hidden h-[calc(100vh-3rem)] w-64 flex-col gap-8 rounded-[32px] p-6 lg:flex">
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
          <p className="mt-1 text-xl font-bold tracking-tight">
            {pathname.startsWith("/tools") ? "CyberDefend" : "Vulnerability Intelligence"}
          </p>
        </div>
      </div>

      <nav aria-label="Main Navigation" className="flex flex-1 flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
        {/* Workspace Group */}
        <div className="space-y-2">
          <p className="px-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-foreground)] opacity-30 flex items-center gap-2">
            <Briefcase size={10} />
            Workspace
          </p>
          <div className="flex flex-col gap-1">
            {baseNav.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium transition-all group",
                    active
                      ? "glass glass-edge shadow-[0_8px_16px_rgba(0,0,0,0.1)] text-[color:var(--color-accent)]"
                      : "text-[color:var(--color-foreground)] opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                  )}
                >
                  <Icon size={18} className={cn("transition-transform group-hover:scale-110", active && "scale-110")} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {visibleToolsNavItems.length > 0 && (
          <div className="space-y-2">
            <p className="px-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-foreground)] opacity-30 flex items-center gap-2">
              <Wrench size={10} />
              Security Tools
            </p>
            <div className="flex flex-col gap-1">
              {visibleToolsNavItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium transition-all group",
                      active
                        ? "glass glass-edge shadow-[0_8px_16px_rgba(0,0,0,0.1)] text-[color:var(--color-accent)]"
                        : "text-[color:var(--color-foreground)] opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                    )}
                  >
                    <Icon size={18} className={cn("transition-transform group-hover:scale-110", active && "scale-110")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Administration Group */}
        {isWebAdmin && (
          <div className="space-y-2">
            <button
              onClick={() => setIsAdminExpanded(!isAdminExpanded)}
              aria-expanded={isAdminExpanded}
              aria-controls="admin-nav-group"
              className="w-full px-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--color-foreground)] opacity-30 hover:opacity-100 transition-opacity flex items-center justify-between group"
            >
              <span className="flex items-center gap-2">
                <Wrench size={10} />
                Administration
              </span>
              {isAdminExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            <div
              id="admin-nav-group"
              className={cn(
                "flex flex-col gap-1 overflow-hidden transition-all duration-300",
                isAdminExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
              )}>
              {adminNavItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.title}
                    className={cn(
                      "flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium transition-all group ml-1",
                      active
                        ? "glass glass-edge shadow-[0_8px_16px_rgba(0,0,0,0.1)] text-[color:var(--color-accent)]"
                        : "text-[color:var(--color-foreground)] opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                    )}
                  >
                    <Icon size={18} className={cn("transition-transform group-hover:scale-110", active && "scale-110")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="mt-auto space-y-4 pt-4 border-t border-white/5">
        {session?.user && (
          <div className="flex items-center gap-3 px-2">
            <div className="h-8 w-8 rounded-full bg-[color:var(--color-accent)]/20 flex items-center justify-center text-xs font-bold text-[color:var(--color-accent)]">
              {session.user.name?.charAt(0) || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.user.name}</p>
              <p className="truncate text-[10px] opacity-60 uppercase tracking-tighter">
                {(session.user.roles || []).slice(0, 2).join(" · ")}
              </p>
            </div>
          </div>
        )}
        <FeedbackButton />
        <button
          onClick={async () => {
            await fetch("/api/auth/revoke", { method: "POST" }).catch(() => {});
            signOut({ callbackUrl: "/login" });
          }}
          className="flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium text-red-500 transition-all hover:bg-red-500/10 group"
        >
          <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
