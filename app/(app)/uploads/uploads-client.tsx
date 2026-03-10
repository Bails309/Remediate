"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { EmptyState } from "@/components/EmptyState";
import { Activity, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/components/cn";

type Site = { id: string; name: string };

type Upload = {
  id: string;
  status: string;
  uploadDate: string;
  fileName?: string | null;
  rowCount?: number | null;
  site: Site;
};

type Props = {
  initialSites: Site[];
  initialUploads: Upload[];
};

export function UploadsClient({ initialSites, initialUploads }: Props) {
  const [sites] = useState(initialSites);
  const [uploads, setUploads] = useState(initialUploads);
  const [siteId, setSiteId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ step: string; progress: number } | null>(null);

  const startUpload = async () => {
    if (!siteId || !file) {
      toast.error("Select a site and file");
      return;
    }

    setProgress({ step: "Uploading file", progress: 0 });

    const formData = new FormData();
    formData.append("siteId", siteId);
    formData.append("file", file);

    const response = await fetch("/api/uploads/nessus", {
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

    const finalize = (status: "Completed" | "Failed") => {
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
        toast.error("Upload failed");
      }
      refreshHistory();
    };

    const pollProgress = async () => {
      const progressResponse = await fetch(`/api/uploads/progress?uploadId=${uploadId}`, { cache: "no-store" });
      if (!progressResponse.ok) {
        return;
      }
      const payload = (await progressResponse.json()) as { progress: { step: string; progress: number } | null };
      if (!payload.progress) {
        return;
      }
      setProgress(payload.progress);
      if (payload.progress.step === "Completed" || payload.progress.step === "Failed") {
        finalize(payload.progress.step);
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
      const data = JSON.parse((event as MessageEvent).data) as { step: string; progress: number };
      setProgress(data);
      if (data.step === "Completed") {
        eventSource.close();
        finalize("Completed");
      }
      if (data.step === "Failed") {
        eventSource.close();
        finalize("Failed");
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
      <div>
        <h2 className="text-2xl font-semibold">CSV Uploads</h2>
        <p className="text-sm opacity-70">Upload security remediation CSVs by site.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass rounded-[28px] border border-[color:var(--color-border)] p-6">
          <div className="space-y-4">
            <Select
              value={siteId}
              onChange={setSiteId}
              placeholder="Select site"
              options={[
                ...sites.map((site) => ({ label: site.name, value: site.id }))
              ]}
            />

            <label
              className="flex h-32 cursor-pointer items-center justify-center rounded-[24px] border border-dashed border-[color:var(--color-border)] text-sm"
              title="Accepts Nessus CSV files (.csv). Large files may be rejected by server limits."
            >
              <input type="file" accept=".csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              {file ? file.name : "Drop or select CSV file"}
            </label>

            <Button onClick={startUpload} title="Begin upload and processing of the selected CSV for the chosen site">Start Upload</Button>
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--color-border)] p-6">
          <h3 className="text-lg font-semibold">Progress</h3>
          {progress ? (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
                <div
                  className="h-full bg-[color:var(--color-accent)] transition-all"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              <p className="mt-3 text-sm opacity-70">{progress.step}</p>
            </>
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
