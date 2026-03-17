"use client";

import { useEffect, useRef } from "react";
import Shepherd from "shepherd.js";
import type { Tour } from "shepherd.js";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, Shield, AlertTriangle, Activity, Database, Upload, Users, Settings, LogOut, Search, Map, ChevronLeft, ChevronRight, Menu, X, BarChart2, Zap, LayoutGrid, PieChart, Bug, Wrench, Briefcase, ChevronDown } from "lucide-react";

interface Props {
  completedTours: string[];
}

// MODULE-LEVEL SINGLETON LOCK
// This persists as long as the page is alive, regardless of component remounts.
const TOUR_LOCKS: Record<string, number> = {};

export function ProductTour({ completedTours }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDebug = searchParams.get("debugTour") === "true";
  const tourRef = useRef<Tour | null>(null);
  const isMounted = useRef(false);
  const hasInitialized = useRef(false);
  const currentTourId = useRef<string>("");

  const completedToursStr = JSON.stringify(completedTours);

  useEffect(() => {
    const tourId = pathname === "/dashboard" ? "dashboard-tour" :
                   pathname === "/vulnerabilities" ? "vulnerabilities-tour" :
                   pathname === "/analytics" ? "analytics-tour" :
                   pathname === "/threat-intelligence" ? "threat-intelligence-tour" : "";

    console.error(`[ProductTour] Effect Triggered. Deps: [PATH: ${pathname}, DEBUG: ${isDebug}, COMPLETED: ${completedToursStr}]`);

    if (!tourId) return;

    const now = Date.now();
    
    // VERSIONED GLOBAL LOCK (Ensures only one initialization attempt EVER per tourId session)
    const lockKey = `__TOUR_V5_STABLE_${tourId}__`;
    if ((window as unknown as Record<string, boolean>)[lockKey]) {
      console.error("[ProductTour] Global Instance found. Skipping secondary init.");
      return;
    }

    const lastInit = TOUR_LOCKS[tourId] || 0;
    if (lastInit && (now - lastInit < 15000)) {
      console.error("[ProductTour] Throttle Lock active.");
      return;
    }

    // Set locks
    TOUR_LOCKS[tourId] = now;
    (window as unknown as Record<string, boolean>)[lockKey] = true;
    hasInitialized.current = true;
    currentTourId.current = tourId;

    // Definitively cleanup any stray instances
    if (tourRef.current) {
      console.error("[ProductTour] Cleanup prior instance.");
      try { tourRef.current.complete(); } catch(e) {}
      tourRef.current = null;
    }

    const stepsMap: Record<string, any[]> = {
      "/dashboard": [
        {
          id: "dashboard-1",
          title: "Dashboard Overview",
          classes: "remediate-shepherd-theme",
          text: "Welcome to Remediate! This is your security command centre.",
          attachTo: { element: "#tour-dashboard-title", on: "bottom-start" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-dashboard-title");
                if (el && el.getBoundingClientRect().width > 0) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [{ text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }],
        },
        {
          id: "dashboard-2",
          title: "Real-time Metrics",
          classes: "remediate-shepherd-theme",
          text: "Monitor your high-risk vulnerabilities and remediation progress here.",
          attachTo: { element: "#tour-dashboard-stats", on: "top" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                if (document.querySelector("#tour-dashboard-stats")) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }
          ],
        },
        {
          id: "dashboard-2-correlation",
          title: "Intelligence Correlation",
          classes: "remediate-shepherd-theme",
          text: "See how global threat intelligence intersects with your specific environmental findings.",
          attachTo: { element: "#tour-dashboard-correlation", on: "bottom" },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }
          ],
        },
        {
          id: "dashboard-2-live",
          title: "Live Intelligence",
          classes: "remediate-shepherd-theme",
          text: "Real-time feed of emerging vulnerabilities and global security advisories.",
          attachTo: { element: "#tour-live-intelligence", on: "left-end" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-live-intelligence");
                if (el) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }
          ],
        },
        {
          id: "dashboard-3",
          title: "Global Navigation",
          text: "Quickly access your tools, vulnerabilities, and analytics from the sidebar.",
          modalOverlayOpeningPadding: 20,
          attachTo: { element: "#tour-sidebar", on: "right" },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Finish", classes: "shepherd-button-primary", action: () => tourRef.current?.complete() }
          ],
        },
      ],
      "/vulnerabilities": [
        {
          id: "vuln-1",
          title: "Triage Center",
          classes: "remediate-shepherd-theme",
          text: "Filter and search across all discovered vulnerabilities.",
          attachTo: { element: "#tour-vuln-filters", on: "bottom" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-vuln-filters");
                if (el && el.getBoundingClientRect().width > 0) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [{ text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }],
        },
        {
          id: "vuln-2",
          title: "Vulnerability Queue",
          classes: "remediate-shepherd-theme",
          text: "Manage assignments and status directly from this table.",
          attachTo: { element: "#tour-vuln-table-header", on: "bottom" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-vuln-table-header");
                if (el) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }
          ],
        },
        {
          id: "vuln-3",
          title: "Intelligent Folding",
          classes: "remediate-shepherd-theme",
          text: "Consolidate duplicate findings or vulnerabilities with multiple CVEs into a single row to streamline your triage process.",
          attachTo: { element: "#tour-vuln-advanced", on: "bottom" },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Finish", classes: "shepherd-button-primary", action: () => tourRef.current?.complete() }
          ],
        },
      ],
      "/analytics": [
        {
          id: "analytics-1",
          title: "Security Analytics",
          classes: "remediate-shepherd-theme",
          text: "Get high-level insights into your security posture.",
          attachTo: { element: "#tour-analytics-overview", on: "bottom" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-analytics-overview");
                if (el && el.getBoundingClientRect().width > 0) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [{ text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }],
        },
        {
          id: "analytics-2",
          title: "Risk Trends",
          classes: "remediate-shepherd-theme",
          text: "Track vulnerability levels over time to measure improvement.",
          attachTo: { element: "#tour-analytics-trend", on: "top" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                if (document.querySelector("#tour-analytics-trend")) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }
          ],
        },
        {
          id: "analytics-3",
          title: "Host Comparison",
          classes: "remediate-shepherd-theme",
          text: "Identify your most vulnerable assets to prioritize remediation efforts.",
          attachTo: { element: "#tour-analytics-hosts", on: "bottom" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-analytics-hosts");
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(resolve, 800);
                }
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Finish", classes: "shepherd-button-primary", action: () => tourRef.current?.complete() }
          ],
        },
      ],
      "/threat-intelligence": [
        {
          id: "threat-1",
          title: "Intelligence Feed",
          classes: "remediate-shepherd-theme",
          text: "Real-time stream of global vulnerabilities from NVD, CISA, and OSV.dev.",
          attachTo: { element: "#tour-threat-feed", on: "right" },
          beforeShowPromise: function() {
            return new Promise<void>((resolve) => {
              const check = () => {
                const el = document.querySelector("#tour-threat-feed");
                if (el && el.getBoundingClientRect().width > 0) resolve();
                else setTimeout(check, 100);
              };
              check();
            });
          },
          buttons: [{ text: "Next", classes: "shepherd-button-primary", action: () => tourRef.current?.next() }],
        },
        {
          id: "threat-2",
          title: "Smart Digest",
          classes: "remediate-shepherd-theme",
          text: "Configure email alerts for high-risk vulnerabilities tailored to your interests.",
          attachTo: { element: "#tour-threat-subscription", on: "left" },
          buttons: [
            { text: "Back", classes: "shepherd-button-secondary", action: () => tourRef.current?.back() },
            { text: "Finish", classes: "shepherd-button-primary", action: () => tourRef.current?.complete() }
          ],
        },
      ],
    };

    const currentSteps = stepsMap[pathname];

    if (currentSteps && (isDebug || !completedTours.includes(tourId))) {
      console.error("[ProductTour] Initializing new tour instance for:", tourId);
      hasInitialized.current = true;
      
      const tour = new Shepherd.Tour({
        useModalOverlay: true,
        exitOnEsc: false,
        keyboardNavigation: false,
        defaultStepOptions: {
          classes: "remediate-shepherd-theme",
          scrollTo: { behavior: "smooth", block: "center" },
          cancelIcon: { enabled: true },
          modalOverlayOpeningPadding: 8,
          modalOverlayOpeningRadius: 16,
          canClickTarget: false,
          floatingUIOptions: { 
            strategy: 'fixed'
          }
        },
      });

      tourRef.current = tour;
      tour.addSteps(currentSteps);
      
      tour.on("complete", () => handleTourComplete(tourId));
      tour.on("cancel", () => handleTourComplete(tourId));

      const startTimeout = setTimeout(() => {
        if (isMounted.current && tourRef.current === tour && !tour.isActive()) {
          console.error("[ProductTour] Executing tour.start()");
          tour.start();
        }
      }, 500);

      return () => {
        clearTimeout(startTimeout);
      };
    }

    async function handleTourComplete(id: string) {
      if (id && !isDebug) {
        try {
          await fetch("/api/tours/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tourId: id }),
          });
        } catch (err) {
          console.error("Failed to mark tour as complete:", err);
        }
      }
    }
  }, [pathname, isDebug]);

  // Handle component lifecycle separately
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (tourRef.current && tourRef.current.isActive()) {
        tourRef.current.complete();
      }
    };
  }, []);

  return null;
}
