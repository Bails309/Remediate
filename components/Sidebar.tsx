"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/cn";
import { Shield, Activity, Upload, Users, Settings, LogOut, ChevronRight, LayoutGrid, LayoutDashboard, PieChart, Bug, Wrench, PanelLeftClose, Pin, ScrollText, Lock, Database, Mail, Sparkles, Inbox, FileText, Boxes, Cloud, Zap, Package, Crosshair, UsersRound } from "lucide-react";
import { FeedbackButton } from "@/components/FeedbackButton";
import type { Session } from "next-auth";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { signOut } from "next-auth/react";

export const insightsNavItems = [
  { href: "/dashboard", label: "Command Centre", icon: LayoutGrid, group: "Overview", title: "Remediation command centre summary" },
  { href: "/analytics", label: "Analytics", icon: PieChart, group: "Overview", title: "Trends, breakdowns and reporting analytics" },
  { href: "/dashboards", label: "My Dashboards", icon: LayoutDashboard, group: "Overview", title: "Build and publish your own dashboards" },
];

export const baseNav = [
  { href: "/vulnerabilities", label: "Vulnerabilities", icon: Bug },
];

export const adminNavItems = [
  { href: "/admin/oidc", label: "Authentication", icon: Lock, group: "Configuration", title: "Manage Keycloak OIDC parameters" },
  { href: "/admin/storage", label: "Storage", icon: Database, group: "Configuration", title: "Configure Azure file share and blob storage" },
  { href: "/admin/import", label: "Scanner Import", icon: Settings, group: "Configuration", title: "Configure scanner import behaviour" },
  { href: "/admin/reports", label: "Reporting", icon: Mail, group: "Configuration", title: "Configure scheduled reports and email delivery" },
  { href: "/admin/ai", label: "AI Insights", icon: Sparkles, group: "Configuration", title: "Configure the AI insights provider" },
  { href: "/admin/users", label: "Users", icon: Users, group: "Access Management", title: "Manage application users and roles" },
  { href: "/admin/groups", label: "Groups", icon: UsersRound, group: "Access Management", title: "Manage groups/departments and their members" },
  { href: "/admin/audit-log", label: "Logs", icon: ScrollText, group: "Monitoring", title: "Review the site audit log of security-relevant actions" },
  { href: "/admin/operations", label: "System Status", icon: Activity, group: "Monitoring", title: "Inspect infrastructure health" },
];

// `access` decides who sees the entry: workspace admins vs toolkit users.
export const inventoryNavItems = [
  { href: "/buckets", label: "Buckets", icon: Shield, group: "Assets", access: "workspace", title: "Manage tracked buckets and their settings" },
  { href: "/uploads/nessus", label: "Nessus CSV", icon: Upload, group: "Manual Uploads", access: "workspace", title: "Upload Nessus scan exports" },
  { href: "/uploads/pentest", label: "Pentest PDF", icon: FileText, group: "Manual Uploads", access: "workspace", title: "Upload penetration test reports for parsing" },
  { href: "/uploads/acr", label: "ACR CSV", icon: Boxes, group: "Manual Uploads", access: "workspace", title: "Upload Azure Container Registry vulnerability exports" },
  { href: "/uploads/dead-letter", label: "Dead Letter Queue", icon: Inbox, group: "Processing", access: "workspace", title: "Requeue or purge failed scan imports" },
  { href: "/tools", label: "Tools", icon: Wrench, group: "Security Tools", access: "toolkit", title: "Run curated scans from the isolated toolkit" },
];

export const automationNavItems = [
  { href: "/automation/nessus", label: "Nessus File Share", icon: Cloud, group: "Uploads", title: "Poll an Azure file share for Nessus CSV scans and map them to buckets" },
  { href: "/automation/acr", label: "ACR Blob Ingest", icon: Boxes, group: "Uploads", title: "Pull ACR vulnerability CSV exports from a blob container" },
];

export const toolsNavItems = [
  { href: "/threat-intelligence", label: "Threat Feed", icon: Activity, group: "Threat Intelligence", title: "Live CVE feed from NVD, OSV and CISA KEV" },
  { href: "/threat-intelligence/actors", label: "Threat Actors", icon: Crosshair, group: "Threat Intelligence", title: "Adversary groups tracked by MITRE ATT&CK" },
];

const railItemClass = "relative flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2.5 text-center text-[10px] font-semibold leading-tight tracking-tight transition-all group";
const railInactiveClass = "text-[color:var(--color-foreground)] opacity-55 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100";
const railActiveClass = "bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)] opacity-100 ring-1 ring-[color:var(--color-accent)]/25";

export function Sidebar({ session }: { session?: Session | null }) {
  const pathname = usePathname();
  const { resolvedTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const roles = session?.user?.roles || [];
  const isSiteAdmin = roles.includes("site_admin");
  const isWebAdmin = isSiteAdmin || roles.includes("web_app_admin");
  const isToolkitUser = roles.includes("site_admin") || roles.includes("toolkit_admin") || roles.includes("toolkit_user");
  const isAuditor = roles.includes("web_app_auditor")
    && !roles.includes("site_admin")
    && !roles.includes("web_app_admin")
    && !roles.includes("web_app_user");
  const showIntelligence = isToolkitUser || isAuditor || isWebAdmin;

  const visibleInventoryNavItems = inventoryNavItems.filter((item) =>
    item.access === "toolkit" ? isToolkitUser : isWebAdmin
  );

  const secondarySections = [
    ...(showIntelligence
      ? [{ id: "intelligence", label: "Intelligence", icon: Activity, items: toolsNavItems }]
      : []),
    ...(visibleInventoryNavItems.length > 0
      ? [{ id: "inventory", label: "Inventory", icon: Package, items: visibleInventoryNavItems }]
      : []),
    ...(isWebAdmin
      ? [{ id: "automation", label: "Automation", icon: Zap, items: automationNavItems }]
      : []),
    ...(isSiteAdmin
      ? [{ id: "admin", label: "Settings", icon: Settings, items: adminNavItems }]
      : []),
  ];

  const insightsSection = { id: "insights", label: "Insights", icon: LayoutGrid, items: insightsNavItems };
  const flyoutSections = [insightsSection, ...secondarySections];

  const [pinnedSection, setPinnedSection] = useState<string | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const openSection = pinnedSection ?? hoveredSection;
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openOnHover = (id: string) => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    setHoveredSection(id);
  };
  // Grace period so the cursor can cross the gap between rail and flyout
  const closeOnHoverEnd = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    hoverCloseTimer.current = setTimeout(() => setHoveredSection(null), 180);
  };
  const closeFlyout = () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
    setHoveredSection(null);
    setPinnedSection(null);
  };

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => () => {
    if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
  }, []);

  // Collapse the flyout on navigation (during render to avoid cascading renders)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setHoveredSection(null);
  }

  useEffect(() => {
    if (!openSection) return;
    function onPointerDown(event: MouseEvent) {
      if (pinnedSection) return;
      if (!containerRef.current?.contains(event.target as Node)) closeFlyout();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeFlyout();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openSection, pinnedSection]);

  const logoSrc = mounted && (resolvedTheme ?? theme) === "light" ? "/logo-light.jpg" : "/logo-dark.jpg";

  const renderRailLink = (item: { href: string; label: string; icon: typeof LayoutGrid; title?: string }) => {
    const active = pathname === item.href;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.title || item.label}
        aria-current={active ? "page" : undefined}
        className={cn(railItemClass, active ? railActiveClass : railInactiveClass)}
      >
        <Icon size={20} className={cn("transition-transform group-hover:scale-110", active && "scale-110")} />
        <span className="break-words">{item.label}</span>
      </Link>
    );
  };

  const renderSectionButton = (section: { id: string; label: string; icon: typeof LayoutGrid; items: { href: string }[] }) => {
    const isOpen = openSection === section.id;
    const childActive = section.items.some((item) => pathname === item.href);
    const SectionIcon = section.icon;
    return (
      <button
        key={section.id}
        onClick={() => {
          if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
          setPinnedSection((pinned) => (pinned === section.id ? null : section.id));
        }}
        onMouseEnter={() => openOnHover(section.id)}
        onMouseLeave={closeOnHoverEnd}
        onFocus={() => openOnHover(section.id)}
        aria-expanded={isOpen}
        aria-controls={`${section.id}-nav-group`}
        aria-haspopup="true"
        title={section.label}
        className={cn(railItemClass, isOpen || childActive ? railActiveClass : railInactiveClass)}
      >
        <SectionIcon size={20} className="transition-transform group-hover:scale-110" />
        <span className="break-words">{section.label}</span>
        <ChevronRight size={10} className={cn("absolute right-1 top-1/2 -translate-y-1/2 opacity-50 transition-transform", isOpen && "rotate-180")} />
      </button>
    );
  };

  return (
    <aside id="tour-sidebar" className="sticky top-0 z-50 hidden h-screen w-[88px] lg:block">
      <div ref={containerRef} className="relative h-full">
        <div className="glass glass-edge flex h-full w-[88px] flex-col items-center gap-3 rounded-r-[24px] px-2 py-5">
          <Link href="/dashboard" title="Remediate" className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 p-1 ring-1 ring-white/10 transition-all hover:scale-105 hover:bg-white/10">
            <div className="h-full w-full overflow-hidden rounded-xl">
              {mounted ? (
                <Image
                  src={logoSrc}
                  alt="Logo"
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                  priority
                  unoptimized
                />
              ) : (
                <div className="h-full w-full bg-[color:var(--color-accent)] animate-pulse" />
              )}
            </div>
            <div className="absolute inset-0 -z-10 rounded-2xl blur-xl bg-[color:var(--color-accent)] opacity-10" />
          </Link>

          <nav aria-label="Main Navigation" className="flex w-full flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden no-scrollbar">
            {renderSectionButton(insightsSection)}
            {baseNav.map(renderRailLink)}

            {secondarySections.length > 0 && (
              <>
                <div className="mx-auto my-2 h-px w-8 bg-[color:var(--color-foreground)] opacity-10" />
                {secondarySections.map(renderSectionButton)}
              </>
            )}
          </nav>

          <div className="flex w-full shrink-0 flex-col items-center gap-1 border-t border-white/5 pt-3">
            {session?.user && (
              <div
                title={session.user.name || "User"}
                className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--color-accent)]/20 text-xs font-bold text-[color:var(--color-accent)]"
              >
                {session.user.name?.charAt(0) || "U"}
                <span className="sr-only">{session.user.name}</span>
                <span className="sr-only">{(session.user.roles || []).slice(0, 2).join(" · ")}</span>
              </div>
            )}
            <div className="w-full [&>button]:flex-col [&>button]:gap-1.5 [&>button]:rounded-2xl [&>button]:px-1 [&>button]:py-2.5 [&>button]:text-center [&>button]:text-[10px] [&>button]:font-semibold [&>button]:leading-tight">
              <FeedbackButton />
            </div>
            <button
              onClick={async () => {
                await fetch("/api/auth/revoke", { method: "POST" }).catch(() => {});
                signOut({ callbackUrl: "/login" });
              }}
              className={cn(railItemClass, "text-red-500 opacity-80 hover:bg-red-500/10 hover:opacity-100")}
            >
              <LogOut size={20} className="transition-transform group-hover:-translate-x-0.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {flyoutSections.map((section) => {
          if (openSection !== section.id) return null;
          const isPinned = pinnedSection === section.id;
          return (
            <div
              key={section.id}
              id={`${section.id}-nav-group`}
              onMouseEnter={() => openOnHover(section.id)}
              onMouseLeave={closeOnHoverEnd}
              className="absolute left-full top-0 z-50 ml-3 h-full w-72 rounded-[24px] bg-[var(--background)] shadow-2xl"
            >
              <div className="glass glass-edge flex h-full w-full flex-col gap-3 rounded-[24px] p-5 fade-up">
                <div className="flex items-center justify-between gap-2 px-1">
                  <p className="text-lg font-semibold tracking-tight">{section.label}</p>
                  <button
                    onClick={() => {
                      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
                      if (isPinned) closeFlyout();
                      else setPinnedSection(section.id);
                    }}
                    aria-label={isPinned ? `Close ${section.label} menu` : `Keep ${section.label} menu open`}
                    title={isPinned ? `Close ${section.label} menu` : `Keep ${section.label} menu open`}
                    className={cn(
                      "rounded-lg p-1 transition-all hover:bg-black/5 dark:hover:bg-white/5",
                      isPinned ? "text-[color:var(--color-accent)] opacity-100" : "opacity-50 hover:opacity-100"
                    )}
                  >
                    {isPinned ? <PanelLeftClose size={16} /> : <Pin size={16} />}
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-y-auto pr-1 custom-scrollbar">
                  {section.items.map((item, index) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    const startsGroup = item.group !== section.items[index - 1]?.group;
                    return (
                      <div key={item.href}>
                        {startsGroup && (
                          <p className={cn(
                            "px-3 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-40",
                            index > 0 && "pt-4"
                          )}>
                            {item.group}
                          </p>
                        )}
                        <Link
                          href={item.href}
                          title={item.title}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all group",
                            active
                              ? "bg-[color:var(--color-accent)]/12 text-[color:var(--color-accent)]"
                              : "text-[color:var(--color-foreground)] opacity-80 hover:bg-black/5 dark:hover:bg-white/5 hover:opacity-100"
                          )}
                        >
                          <Icon size={18} className="shrink-0 transition-transform group-hover:scale-110" />
                          {item.label}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
