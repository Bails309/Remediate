"use client";

import { useState } from "react";
import { Activity, Inbox } from "lucide-react";
import { cn } from "@/components/cn";
import { HealthClient } from "@/app/(app)/admin/health/health-client";
import { DeadLetterClient } from "@/app/(app)/admin/dead-letter/dead-letter-client";

const TABS = [
  { id: "health", label: "System Health", icon: Activity, component: HealthClient },
  { id: "dead-letter", label: "Dead Letter Queue", icon: Inbox, component: DeadLetterClient },
];

export function OperationsHubClient() {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">System Status</h1>
        <p className="mt-2 text-lg opacity-60">Monitor infrastructure health and manage failed scan imports.</p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border/50 pb-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-accent text-white shadow-lg shadow-accent/25"
                  : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {TABS.map((tab) => (
          <div key={tab.id} className={cn(activeTab === tab.id ? "block" : "hidden")}>
            <tab.component />
          </div>
        ))}
      </div>
    </div>
  );
}
