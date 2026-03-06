"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { toast } from "sonner";

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
        } catch (e) {
          // network error, wait and retry
        }
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return false;
    };

    const eventsAvailable = await waitForEventsEndpoint(uploadId, 6, 300);
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
        const latest = (await history.json()) as Upload[];
        setUploads(latest);
      }
    }, 2500);
  };

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-semibold">CSV Uploads</h2>
        <p className="text-sm opacity-70">Upload Nessus remediation CSVs by site.</p>
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

            <label className="flex h-32 cursor-pointer items-center justify-center rounded-[24px] border border-dashed border-[color:var(--color-border)] text-sm">
              <input type="file" accept=".csv" className="hidden" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              {file ? file.name : "Drop or select CSV file"}
            </label>

            <Button onClick={startUpload}>Start Upload</Button>
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--color-border)] p-6">
          <h3 className="text-lg font-semibold">Progress</h3>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--color-muted)]">
            <div
              className="h-full bg-[color:var(--color-accent)] transition-all"
              style={{ width: `${progress?.progress ?? 0}%` }}
            />
          </div>
          <p className="mt-3 text-sm opacity-70">{progress?.step ?? "Idle"}</p>
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--color-border)] p-6">
        <h3 className="text-lg font-semibold">Recent Uploads</h3>
        <div className="mt-4 space-y-4 text-sm">
          {uploads.length === 0 && <p className="opacity-60">No uploads yet.</p>}
          {uploads.map((upload) => (
            <div key={upload.id} className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{upload.site.name}</p>
                <p className="opacity-60">{upload.fileName ?? "CSV"}</p>
              </div>
              <span className="text-xs uppercase tracking-[0.2em] opacity-70">{upload.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
