"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/Input";
import { Settings, Cloud, Upload, Activity, CheckCircle2, AlertCircle, X, Save, Zap, Database } from "lucide-react";
import { InfoTooltip } from "@/components/InfoTooltip";
import { toast } from "@/lib/toast";
import { cn } from "@/components/cn";
import { LiveProgressDisplay } from "@/components/LiveProgressDisplay";

export type Site = { 
  id: string; 
  name: string;
  importPattern?: string | null;
  importAliases: string[];
  autoImportEnabled: boolean;
};

export type AzureConfig = {
  enabled: boolean;
  accountName: string | null;
  shareName: string | null;
  directoryPath: string | null;
  pollIntervalMinutes: number;
  deleteAfterImport: boolean;
  connectionStringEnc: string | null;
  accountKeyEnc: string | null;
  sasTokenEnc: string | null;
  lastPollAt: string | null;
  updatedAt: string;
};

export type Upload = {
  id: string;
  status: string;
  uploadDate: string;
  fileName?: string | null;
  rowCount?: number | null;
  site: Site;
};

export type Props = {
  initialSites: Site[];
  initialUploads: Upload[];
  initialAzureConfig: AzureConfig | null;
};

export function UploadsClient({ initialSites, initialUploads, initialAzureConfig }: Props) {
  const [sites, setSites] = useState(initialSites);
  const [activeTab, setActiveTab] = useState<"manual" | "automation">("manual");
  const [uploads, setUploads] = useState(initialUploads);
  
  // Azure Config Form
  const [azureConfig, setAzureConfig] = useState<AzureConfig>(initialAzureConfig ?? {
    enabled: false,
    accountName: "",
    shareName: "security-scans",
    directoryPath: "/",
    pollIntervalMinutes: 60,
    deleteAfterImport: true,
    connectionStringEnc: null,
    accountKeyEnc: null,
    sasTokenEnc: null,
    lastPollAt: null,
    updatedAt: new Date().toISOString(),
  });
  const [connectionString, setConnectionString] = useState(azureConfig.connectionStringEnc ? "****" : "");
  const [accountKey] = useState(azureConfig.accountKeyEnc ? "****" : "");
  const [sasToken] = useState(azureConfig.sasTokenEnc ? "****" : "");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Site matching state
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteImportPattern, setSiteImportPattern] = useState("");
  const [siteImportAliases, setSiteImportAliases] = useState<string[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [siteId, setSiteId] = useState("");
  const [uploadType, setUploadType] = useState<"CSV" | "PDF" | "ACR">("CSV");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ step: string; progress: number; error?: string } | null>(null);
  const [nextPollCountdown, setNextPollCountdown] = useState<string>("");
  const [isRunningPoll, setIsRunningPoll] = useState(false);

  useEffect(() => {
    if (!azureConfig.enabled || !azureConfig.lastPollAt) {
      setNextPollCountdown("");
      return;
    }

    const interval = setInterval(() => {
      const last = new Date(azureConfig.lastPollAt!).getTime();
      const next = last + azureConfig.pollIntervalMinutes * 60 * 1000;
      const now = new Date().getTime();
      const diff = next - now;

      if (diff <= 0) {
        setNextPollCountdown("Polling now...");
      } else {
        const mins = Math.floor(diff / 1000 / 60);
        const secs = Math.floor((diff / 1000) % 60);
        setNextPollCountdown(`${mins}m ${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [azureConfig.enabled, azureConfig.lastPollAt, azureConfig.pollIntervalMinutes]);

  const saveAzureConfig = async () => {
    setIsSavingConfig(true);
    try {
      const resp = await fetch("/api/admin/azure-file-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...azureConfig,
          connectionString,
          accountKey,
          sasToken,
        }),
      });
      if (!resp.ok) throw new Error("Failed to save config");
      toast.success("Configuration updated");
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error(String(err));
      }
    } finally {
      setIsSavingConfig(false);
    }
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    try {
      const resp = await fetch("/api/admin/azure-file-share/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...azureConfig,
          connectionString: connectionString === "****" ? null : connectionString,
          accountKey: accountKey === "****" ? null : accountKey,
          sasToken: sasToken === "****" ? null : sasToken,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Connection failed");
      toast.success(data.message || "Connection successful");
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error(String(err));
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const startEditingSite = (site: Site) => {
    if (editingSiteId === site.id) {
      setEditingSiteId(null);
      return;
    }
    setEditingSiteId(site.id);
    setSiteImportPattern(site.importPattern || "");
    setSiteImportAliases([...(site.importAliases || [])]);
    setNewAlias("");
  };
  const triggerManualPoll = async () => {
    setIsRunningPoll(true);
    try {
      const res = await fetch("/api/admin/azure-file-share/poll", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        toast.success("Manual poll completed successfully");
        // Refresh config to get new lastPollAt
        const configRes = await fetch("/api/admin/azure-file-share");
        const configData = await configRes.json();
        setAzureConfig(configData);
      } else {
        toast.error(data.error || "Failed to trigger poll");
      }
    } catch {
      toast.error("Failed to run automation");
    } finally {
      setIsRunningPoll(false);
    }
  };

  const saveSiteMatching = async () => {
    if (!editingSiteId) return;
    try {
      const site = sites.find(s => s.id === editingSiteId);
      if (!site) return;

      const finalAliases = [...siteImportAliases];
      if (newAlias.trim() && !finalAliases.includes(newAlias.trim())) {
        finalAliases.push(newAlias.trim());
      }

      const resp = await fetch(`/api/buckets/${editingSiteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: site.name,
          importPattern: siteImportPattern,
          importAliases: finalAliases,
          autoImportEnabled: site.autoImportEnabled
        }),
      });
      if (!resp.ok) throw new Error("Failed to update site matching");
      
      setSites(prev => prev.map(s => s.id === editingSiteId ? {
        ...s,
        importPattern: siteImportPattern,
        importAliases: finalAliases
      } : s));
      
      setEditingSiteId(null);
      setSiteImportAliases([]);
      setSiteImportPattern("");
      toast.success("Site mapping updated");
    } catch (err: unknown) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error(String(err));
      }
    }
  };

  const addAlias = () => {
    if (!newAlias.trim()) return;
    if (siteImportAliases.includes(newAlias.trim())) return;
    setSiteImportAliases([...siteImportAliases, newAlias.trim()]);
    setNewAlias("");
  };

  const removeAlias = (alias: string) => {
    setSiteImportAliases(siteImportAliases.filter(a => a !== alias));
  };

  const startUpload = async () => {
    if (!siteId || !file) {
      toast.error("Select a bucket and file");
      return;
    }

    // Validate extension matches the chosen pipeline up-front so users get an immediate error
    // instead of a 400 from the API.
    const lowerName = file.name.toLowerCase();
    if ((uploadType === "CSV" || uploadType === "ACR") && !lowerName.endsWith(".csv")) {
      toast.error("Selected file is not a .csv");
      return;
    }
    if (uploadType === "PDF" && !lowerName.endsWith(".pdf")) {
      toast.error("Selected file is not a .pdf");
      return;
    }

    setProgress({ step: "Uploading file", progress: 0 });

    const formData = new FormData();
    formData.append("siteId", siteId);
    formData.append("file", file);

    const endpoint =
      uploadType === "PDF"
        ? "/api/uploads/pentest"
        : uploadType === "ACR"
          ? "/api/uploads/acr"
          : "/api/uploads/nessus";
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json();
      toast.error(data.error ?? "Upload failed");
      return;
    }

    const { uploadId } = await response.json();
    toast.success("Upload started");

    setProgress({ step: "Queued", progress: 5 });

    let settled = false;
    let poller: ReturnType<typeof setInterval> | null = null;

    const refreshHistory = async () => {
      const history = await fetch("/api/uploads/history", { cache: "no-store" });
      if (history.ok) {
        const latest = (await history.json()) as unknown;
        if (Array.isArray(latest)) {
          setUploads(latest);
        }
      }
    };

    const finalize = (status: "Completed" | "Failed", errorMessage?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (poller) {
        clearInterval(poller);
      }
      if (status === "Completed") {
        toast.success("Upload completed");
      } else {
        // Surface the worker-reported failure reason (e.g. "PDF Processing API returned
        // 401 Unauthorized") instead of a generic "Upload failed". Full text also stays
        // visible in the Live Progress panel via the Failure reason banner below.
        toast.error(errorMessage ? `Upload failed: ${errorMessage}` : "Upload failed");
      }
      refreshHistory();
    };

    const pollProgress = async () => {
      const progressResponse = await fetch(`/api/uploads/progress?uploadId=${uploadId}`, { cache: "no-store" });
      if (!progressResponse.ok) {
        return;
      }
      const payload = (await progressResponse.json()) as { progress: { step: string; progress: number; error?: string } | null };
      if (!payload.progress) {
        return;
      }
      setProgress(payload.progress);
      if (payload.progress.step === "Completed" || payload.progress.step === "Failed") {
        finalize(payload.progress.step, payload.progress.error);
      }
    };

    poller = setInterval(pollProgress, 2000);

    // Ensure the events endpoint is available before opening EventSource to avoid
    // spurious 404s (dev server/state race). Probe with fetch and retry a few
    // times before falling back to opening the EventSource immediately.
    const waitForEventsEndpoint = async (id: string, attempts = 5, delayMs = 300) => {
      const url = `/api/uploads/events?uploadId=${id}`;
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(url, { method: "GET", cache: "no-store" });
          if (res.ok || res.status === 200 || res.status === 204) return true;
          // If it's 404, wait and retry
        } catch {
          // network error, wait and retry
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return false;
    };

    await waitForEventsEndpoint(uploadId, 6, 300);
    const eventSource = new EventSource(`/api/uploads/events?uploadId=${uploadId}`);
    eventSource.addEventListener("progress", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { step: string; progress: number; error?: string };
      setProgress(data);
      if (data.step === "Completed") {
        eventSource.close();
        finalize("Completed");
      }
      if (data.step === "Failed") {
        eventSource.close();
        finalize("Failed", data.error);
      }
    });
    eventSource.onerror = () => {
      eventSource.close();
      if (!settled) {
        toast.error("Upload progress connection lost");
      }
    };

    setTimeout(async () => {
      const history = await fetch("/api/uploads/history");
      if (history.ok) {
        const latest = (await history.json()) as unknown;
        if (Array.isArray(latest)) {
          setUploads(latest);
        }
      }
    }, 2500);
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Uploads</h2>
          <p className="text-sm opacity-70">Manage Nessus CSV scans, pentest PDF reports, and ACR image vulnerability exports.</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab("manual")}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === "manual" ? "bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <Upload className="h-4 w-4" />
            Manual
          </button>
          <button
            onClick={() => setActiveTab("automation")}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === "automation" ? "bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <Settings className="h-4 w-4" />
            Automation
          </button>
        </div>
      </div>

      {activeTab === "manual" ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="glass rounded-[28px] border border-[color:var(--color-border)] p-6">
            <div className="space-y-4">
              <Select
                value={siteId}
                onChange={setSiteId}
                placeholder="Select bucket"
                options={[
                  ...sites.map((site) => ({ label: site.name, value: site.id }))
                ]}
              />

              <div className="flex gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800/60 p-1" role="tablist" aria-label="Upload type">
                <button
                  type="button"
                  onClick={() => { setUploadType("CSV"); setFile(null); }}
                  className={cn(
                    "flex-1 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                    uploadType === "CSV" ? "bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  Nessus CSV
                </button>
                <button
                  type="button"
                  onClick={() => { setUploadType("PDF"); setFile(null); }}
                  className={cn(
                    "flex-1 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                    uploadType === "PDF" ? "bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  Pentest PDF
                </button>
                <button
                  type="button"
                  onClick={() => { setUploadType("ACR"); setFile(null); }}
                  className={cn(
                    "flex-1 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all",
                    uploadType === "ACR" ? "bg-white dark:bg-slate-700 shadow-md text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  ACR CSV
                </button>
              </div>

              <label
                className="flex h-32 cursor-pointer items-center justify-center rounded-[24px] border border-dashed border-[color:var(--color-border)] text-sm"
                title={
                  uploadType === "PDF"
                    ? "Accepts pentest report PDFs (.pdf). The file is forwarded to the configured PDF Processing API."
                    : uploadType === "ACR"
                      ? "Accepts Azure Container Registry vulnerability CSV exports (.csv). Findings are keyed by (cveId, registry/repo, packageName)."
                      : "Accepts Nessus CSV files (.csv). Large files may be rejected by server limits."
                }
              >
                <input
                  type="file"
                  accept={uploadType === "PDF" ? ".pdf,application/pdf" : ".csv"}
                  className="hidden"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                {file
                  ? file.name
                  : uploadType === "PDF"
                    ? "Drop or select PDF file"
                    : uploadType === "ACR"
                      ? "Drop or select ACR CSV file"
                      : "Drop or select CSV file"}
              </label>

              <Button onClick={startUpload} title="Begin upload and processing of the selected file for the chosen bucket">Start Upload</Button>
            </div>
          </div>

          <div className="rounded-[28px] border border-[color:var(--color-border)] p-6">
            <h3 className="text-lg font-semibold text-[color:var(--color-accent)]">Live Progress</h3>
            {progress ? (
              <LiveProgressDisplay progress={progress} />
            ) : (
              <div className="mt-4">
                <EmptyState
                  title="No upload in progress"
                  description="Start a CSV upload to see live progress here."
                  icon={<Activity className="h-8 w-8" />}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="glass rounded-[28px] border border-[color:var(--color-border)] p-8 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-bold leading-none">Azure File Share</h3>
                  {azureConfig.enabled ? (
                    <div className="flex items-center gap-3">
                      {azureConfig.lastPollAt ? (
                        <p className="text-[11px] text-blue-500/80 font-semibold flex items-center gap-1.5">
                          <Activity className="w-3 h-3 text-blue-400" />
                          Next poll in {nextPollCountdown || "calculating..."}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500/80 font-medium flex items-center gap-1.5">
                          <Activity className="w-3 h-3 opacity-30" />
                          Waiting for first poll...
                        </p>
                      )}
                      <div className="w-[1px] h-3 bg-blue-500/20" />
                      <button
                        onClick={triggerManualPoll}
                        disabled={isRunningPoll}
                        className="group flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-all active:scale-95"
                      >
                        <Zap className={cn("w-3 h-3 transition-transform group-hover:scale-110", isRunningPoll && "animate-pulse text-yellow-400")} />
                        Run now
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500/50 font-medium">Automation disabled</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={() => setAzureConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-offset-2 ring-2 ring-transparent",
                    azureConfig.enabled ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-700"
                  )}
                >
                  <span className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    azureConfig.enabled ? "translate-x-6" : "translate-x-1"
                  )} />
                </button>
                <span className="text-[9px] font-mono text-slate-400">
                  Last: {azureConfig.lastPollAt ? new Date(azureConfig.lastPollAt).toLocaleTimeString() : "Never"}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Account Name</label>
                <Input
                  value={azureConfig.accountName || ""}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAzureConfig({ ...azureConfig, accountName: e.target.value })}
                  placeholder="e.g. remediate-storage"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Connection String</label>
                <Input
                  type="password"
                  value={connectionString}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConnectionString(e.target.value)}
                  placeholder="DefaultEndpointsProtocol=..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Share Name</label>
                  <Input
                    value={azureConfig.shareName || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAzureConfig({ ...azureConfig, shareName: e.target.value })}
                    placeholder="security-scans"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Poll (Mins)</label>
                  <Input
                    type="number"
                    value={azureConfig.pollIntervalMinutes}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAzureConfig({ ...azureConfig, pollIntervalMinutes: parseInt(e.target.value) || 60 })}
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50">
                <input
                  type="checkbox"
                  id="deleteAfter"
                  checked={azureConfig.deleteAfterImport}
                  onChange={e => setAzureConfig({ ...azureConfig, deleteAfterImport: e.target.checked })}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <label htmlFor="deleteAfter" className="text-sm font-semibold opacity-70">
                  Delete CSV after successful import
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button 
                  variant="outline"
                  onClick={testConnection} 
                  loading={isTestingConnection}
                  className="w-full h-11"
                >
                  <Zap size={16} className="mr-2" />
                  Test Connection
                </Button>
                <Button 
                  onClick={saveAzureConfig} 
                  loading={isSavingConfig}
                  className="w-full h-11"
                >
                  <Save size={16} className="mr-2" />
                  Save Changes
                </Button>
              </div>
            </div>

            {/* Peer automation source: ACR blob container. Configured on its own
                admin page so this card stays a lightweight entry point rather
                than duplicating the whole credentials form here. */}
            <div className="mt-6 pt-6 border-t border-[color:var(--color-border)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Database className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">Azure Container Registry (Blob)</p>
                    <p className="mt-1 text-xs opacity-60">
                      Pull ACR vulnerability CSV exports from a separate blob container. Uses its own credentials.
                    </p>
                  </div>
                </div>
                <a
                  href="/admin/azure-blob-ingest"
                  className="shrink-0 rounded-xl border border-[color:var(--color-border)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Configure
                </a>
              </div>
            </div>
          </div>

          <div className="glass rounded-[28px] border border-[color:var(--color-border)] p-8">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Settings className="h-5 w-5 text-indigo-500" />
              Bucket Mappings
            </h3>
            
            <div className="grid gap-4">
              {sites.length === 0 ? (
                <EmptyState
                  title="No buckets found"
                  description="Create buckets in the Settings page to configure automated mappings."
                  icon={<Database className="h-8 w-8" />}
                />
              ) : (
                sites.map(site => (
                  <div key={site.id} className="relative group">
                    <div className={cn(
                      "p-4 rounded-[22px] border transition-all",
                      editingSiteId === site.id ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/20" : "border-[color:var(--color-border)] hover:border-slate-400 dark:hover:border-slate-600 bg-white dark:bg-slate-900/50"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-xs">
                            {site.name[0]}
                          </div>
                          <div>
                            <p className="font-bold">{site.name}</p>
                            {!site.autoImportEnabled && (
                              <span className="text-[9px] font-black text-rose-500 uppercase tracking-tighter bg-rose-500/10 px-1.5 py-0.5 rounded">Auto-Import Disabled</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={async () => {
                              const newStatus = !site.autoImportEnabled;
                              try {
                                await fetch(`/api/buckets/${site.id}`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ name: site.name, autoImportEnabled: newStatus })
                                });
                                setSites(prev => prev.map(s => s.id === site.id ? { ...s, autoImportEnabled: newStatus } : s));
                                toast.success(newStatus ? "Auto-import enabled" : "Auto-import disabled");
                              } catch {
                                toast.error("Failed to update status");
                              }
                            }}
                            className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ring-offset-2 ring-1 ring-transparent",
                              site.autoImportEnabled ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                            )}
                            title={site.autoImportEnabled ? "Disable automated mapping for this bucket" : "Enable automated mapping for this bucket"}
                          >
                            <span className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                              site.autoImportEnabled ? "translate-x-4.5" : "translate-x-1"
                            )} />
                          </button>
                          <button
                            onClick={() => startEditingSite(site)}
                            className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {editingSiteId === site.id ? "CANCEL" : "CONFIGURE"}
                          </button>
                        </div>
                      </div>

                      {editingSiteId === site.id ? (
                        <div className="mt-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="space-y-2">
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Regex Pattern</label>
                              <InfoTooltip text="A regular expression used to match CSV filenames. For example, 'azure.*\.csv' will match any file starting with 'azure' and ending in '.csv'." />
                            </div>
                            <Input
                              value={siteImportPattern}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSiteImportPattern(e.target.value)}
                              placeholder="e.g. azure.*\.csv"
                            />
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Aliases</label>
                              <InfoTooltip text="Aliases are alternative names used to match CSV files to this bucket (e.g., if the filename is 'mansfield.csv', adding 'mansfield' as an alias will map it to this 'Mansfield' bucket)." />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {siteImportAliases.map(alias => (
                                <span key={alias} className="flex items-center gap-1 px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-full text-xs font-bold border border-indigo-500/20">
                                  {alias}
                                  <button onClick={() => removeAlias(alias)}>
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                              <div className="flex items-center gap-2">
                                <input
                                  value={newAlias}
                                  onChange={e => setNewAlias(e.target.value)}
                                  className="bg-transparent border-b border-indigo-500/30 text-xs px-2 py-1 focus:outline-none focus:border-indigo-500 w-24"
                                  placeholder="Add alias..."
                                  onKeyDown={e => e.key === "Enter" && addAlias()}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <Button 
                              className="flex-1" 
                              size="sm"
                              onClick={saveSiteMatching}
                            >
                              <Save size={14} className="mr-2" />
                              Save Mapping
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setEditingSiteId(null)}
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1 flex gap-2">
                          {site.importPattern && (
                            <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">
                              /{site.importPattern}/
                            </span>
                          )}
                          {site.importAliases.length > 0 && (
                            <span className="text-[10px] text-indigo-500 font-bold">
                              {site.importAliases.length} Aliases
                            </span>
                          )}
                          {!site.importPattern && site.importAliases.length === 0 && (
                            <span className="text-[10px] opacity-40 italic">Default matching only</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[28px] border border-[color:var(--color-border)] p-6">
        <h3 className="text-lg font-semibold">Recent Uploads</h3>
        <div className="mt-4 space-y-4 text-sm">
          {uploads.length === 0 && (
            <EmptyState
              title="No uploads yet"
              description="Recent uploads will appear here once a CSV is processed."
              icon={<Activity className="h-8 w-8" />}
            />
          )}
          {uploads.map((upload, index) => {
            const isLatest = index === 0;
            const isFailed = upload.status.toLowerCase() === "failed";
            const isCompleted = upload.status.toLowerCase() === "completed";

            return (
              <div
                key={upload.id}
                className={cn(
                  "relative flex items-center justify-between transition-all duration-500",
                  isLatest ? "glass glass-edge rounded-2xl p-5 shadow-lg" : "p-3 border-b border-foreground/5 last:border-0",
                  isLatest && isCompleted && "bg-emerald-500/5 border-emerald-500/20",
                  isLatest && isFailed && "bg-rose-500/5 border-rose-500/20",
                  isLatest && "fade-up mb-4"
                )}
              >
                <div className="flex items-center gap-4">
                  {isLatest && (
                    <div className={cn(
                      "p-2 rounded-xl",
                      isFailed ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"
                    )}>
                      {isFailed ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-3">
                      <p className={cn("font-bold", isLatest ? "text-lg" : "text-sm")}>
                        {upload.site.name}
                      </p>
                      {isLatest && (
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full tracking-widest",
                          isFailed ? "bg-rose-500 text-white" : "bg-emerald-500 text-white"
                        )}>
                          LATEST
                        </span>
                      )}
                    </div>
                    <p className={cn("opacity-60", isLatest ? "text-xs mt-1" : "text-[10px]")}>
                      {upload.fileName ?? "CSV"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "font-black uppercase tracking-widest",
                    isLatest ? "text-[10px]" : "text-[9px] opacity-40",
                    isLatest && isCompleted && "text-emerald-500",
                    isLatest && isFailed && "text-rose-500"
                  )}>
                    {upload.status}
                  </span>
                  {isLatest && (
                    <p className="text-[10px] opacity-40 mt-1 uppercase font-bold tracking-tighter">
                      {new Date(upload.uploadDate).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
