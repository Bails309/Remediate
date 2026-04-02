"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/cn";
import { Menu, X, LogOut, Briefcase, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { baseNav, adminNavItems, toolsNavItems } from "./Sidebar";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";

export function MobileNav({ session }: { session?: Session | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const roles = session?.user?.roles || [];
  const isWebAdmin = roles.includes("site_admin") || roles.includes("web_app_admin");
  const isToolkitUser = roles.includes("site_admin") || roles.includes("toolkit_admin") || roles.includes("toolkit_user");

  const [isAdminExpanded, setIsAdminExpanded] = useState(false);

  // Close menu when pathname changes - removed to avoid setState in effect

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        aria-label="Open Menu"
      >
        <Menu size={24} />
      </button>

      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[80%] max-w-sm bg-slate-50 dark:bg-slate-900 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden h-full flex flex-col p-6",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[color:var(--color-accent)] flex items-center justify-center text-white font-bold text-xs ring-4 ring-[color:var(--color-accent)]/10">
              R
            </div>
            <span className="font-bold tracking-tight text-lg">Remediate</span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 -mr-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Close Menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Mobile Navigation" className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          {/* Workspace Group */}
          <div className="space-y-2">
            <p className="px-4 text-[10px] font-bold uppercase tracking-widest opacity-30 flex items-center gap-2">
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
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                      active
                        ? "bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]/20 shadow-sm"
                        : "opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {isToolkitUser && (
            <div className="space-y-2">
              <p className="px-4 text-[10px] font-bold uppercase tracking-widest opacity-30 flex items-center gap-2">
                <Wrench size={10} />
                Security Tools
              </p>
              <div className="flex flex-col gap-1">
                {toolsNavItems.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                        active
                          ? "bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]/20 shadow-sm"
                          : "opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                      )}
                    >
                      <Icon size={18} />
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
                className="w-full px-4 text-[10px] font-bold uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Wrench size={10} />
                  Administration
                </span>
                {isAdminExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {isAdminExpanded && (
                <div className="flex flex-col gap-1 pl-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  {adminNavItems.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                          active
                            ? "bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]/20 shadow-sm"
                            : "opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                        )}
                      >
                        <Icon size={18} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-black/5 dark:border-white/5">
          {session?.user && (
            <div className="flex items-center gap-3 px-2 mb-4">
              <div className="h-10 w-10 rounded-full bg-[color:var(--color-accent)]/20 flex items-center justify-center text-sm font-bold text-[color:var(--color-accent)] ring-1 ring-[color:var(--color-accent)]/30">
                {session.user.name?.charAt(0) || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{session.user.name}</p>
                <p className="truncate text-[10px] opacity-60 uppercase tracking-tighter">
                  {(session.user.roles || []).slice(0, 2).join(" · ")}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={async () => {
              await fetch("/api/auth/revoke", { method: "POST" }).catch(() => {});
              signOut({ callbackUrl: "/login" });
            }}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
