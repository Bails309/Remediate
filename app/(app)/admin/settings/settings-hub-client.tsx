"use client";

import { useState } from "react";
import { Database, Settings, Mail, Lock, Sparkles } from "lucide-react";
import { cn } from "@/components/cn";
import { OidcClientForm } from "@/app/(app)/admin/oidc/oidc-client-form";
import { StorageSettingsClient } from "@/app/(app)/admin/storage/storage-settings-client";
import { ImportSettingsClient } from "@/app/(app)/admin/import/import-settings-client";
import { ReportSettingsClient } from "@/app/(app)/admin/reports/report-settings-client";
import { AiSettingsClient } from "@/app/(app)/admin/ai/ai-settings-client";

const TABS = [
  { id: "auth", label: "Authentication", icon: Lock, component: OidcClientForm },
  { id: "storage", label: "Storage", icon: Database, component: StorageSettingsClient },
  { id: "import", label: "Scanner Import", icon: Settings, component: ImportSettingsClient },
  { id: "reports", label: "Reporting", icon: Mail, component: ReportSettingsClient },
  { id: "ai", label: "AI Insights", icon: Sparkles, component: AiSettingsClient },
];

export function SettingsHubClient() {
  const [activeTab, setActiveTab] = useState(TABS[0].id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">Admin Settings</h1>
        <p className="mt-2 text-lg opacity-60">Global configuration for authentication, storage, and scanners.</p>
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
