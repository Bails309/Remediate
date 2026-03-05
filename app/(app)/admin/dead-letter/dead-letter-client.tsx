"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { SideSheet } from "@/components/SideSheet";
import { toast } from "sonner";

type DeadLetterItem = {
  id: string;
  retryCount: number;
  status: string;
  fileName: string | null;
  siteName: string | null;
  uploadedBy: string | null;
  uploadDate: string | null;
};

export function DeadLetterClient() {
  const [items, setItems] = useState<DeadLetterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeDays, setPurgeDays] = useState("7");
  const [confirmAction, setConfirmAction] = useState<null | "requeue" | "purge">(null);

  const load = async () => {
    const response = await fetch("/api/uploads/dead-letter");
    if (!response.ok) {
      toast.error("Failed to load dead-letter queue");
      return;
    }
    const data = await response.json();
    setItems(data.items ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const requeue = async (uploadId: string) => {
    const response = await fetch("/api/uploads/dead-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId }),
    });

    if (!response.ok) {
      const data = await response.json();
      toast.error(data.error ?? "Requeue failed");
      return;
    }

    toast.success("Upload requeued");
    setItems((prev) => prev.filter((item) => item.id !== uploadId));
  };

  const requeueAll = async () => {
    const response = await fetch("/api/uploads/dead-letter", {
      method: "PUT",
    });

    if (!response.ok) {
      toast.error("Requeue all failed");
      return;
    }

    const data = await response.json();
    toast.success(`Requeued ${data.requeued} uploads`);
    load();
  };

  const purgeStale = async () => {
    const parsed = Number(purgeDays || "0");
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
    const response = await fetch("/api/uploads/dead-letter", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days }),
    });

    if (!response.ok) {
      toast.error("Purge failed");
      return;
    }

    const data = await response.json();
    toast.success(`Purged ${data.purged} stale uploads`);
    load();
  };

  if (loading) {
    return <p className="text-sm opacity-70">Loading dead-letter queue...</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Dead Letter Queue</h2>
        <p className="text-sm opacity-70">Failed uploads that exceeded retry limits.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => setConfirmAction("requeue")}>
          Requeue All
        </Button>
        <div className="flex items-center gap-2">
          <Input
            value={purgeDays}
            onChange={(event) => setPurgeDays(event.target.value)}
            placeholder="Days"
            className="w-24"
          />
          <Button variant="outline" onClick={() => setConfirmAction("purge")}>
            Purge Stale
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-[color:var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[color:var(--color-border)] text-xs uppercase tracking-[0.2em]">
            <tr>
              <th className="p-4">Upload</th>
              <th className="p-4">Site</th>
              <th className="p-4">Owner</th>
              <th className="p-4">Retries</th>
              <th className="p-4">Status</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td className="p-6 text-sm opacity-60" colSpan={6}>
                  Dead-letter queue is empty.
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id} className="border-b border-[color:var(--color-border)] last:border-none">
                <td className="p-4">
                  <p className="font-semibold">{item.fileName ?? item.id}</p>
                  <p className="text-xs opacity-60">{item.uploadDate ? new Date(item.uploadDate).toLocaleString() : "Unknown"}</p>
                </td>
                <td className="p-4">{item.siteName ?? "Unknown"}</td>
                <td className="p-4">{item.uploadedBy ?? "Unknown"}</td>
                <td className="p-4">{item.retryCount}</td>
                <td className="p-4">{item.status}</td>
                <td className="p-4">
                  <Button variant="outline" onClick={() => requeue(item.id)}>
                    Requeue
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SideSheet
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === "purge" ? "Confirm Purge" : "Confirm Requeue"}
      >
        {confirmAction === "purge" ? (
          <div className="space-y-4">
            <p>This will delete dead-letter entries older than {purgeDays || "7"} days.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await purgeStale();
                  setConfirmAction(null);
                }}
              >
                Purge
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p>This will requeue every failed upload that still has payload data.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  await requeueAll();
                  setConfirmAction(null);
                }}
              >
                Requeue All
              </Button>
            </div>
          </div>
        )}
      </SideSheet>
    </div>
  );
}
