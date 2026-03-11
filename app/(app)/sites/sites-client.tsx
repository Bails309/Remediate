"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Trash2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";


type Site = { id: string; name: string };

type Props = {
  initialSites: Site[];
};

export function SitesClient({ initialSites }: Props) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [name, setName] = useState("");
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const createSite = async () => {
    if (!name.trim()) return;
    try {
      const response = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      let parsed: unknown = null;
      try {
        // If the server redirected (e.g. to a login page), `response.redirected` will be true
        if (response.redirected || (response.url && response.url.includes("/login"))) {
          toast.error("Not authenticated — please sign in and try again.");
          return;
        }

        parsed = await response.json();
      } catch {
        const txt = await response.text().catch(() => "");
        toast.error(`Unexpected server response: ${txt ? txt.slice(0, 200) : response.status}`);
        return;
      }

      if (!response.ok) {
        toast.error("Failed to create bucket");
        return;
      }

      if (typeof parsed !== "object" || parsed === null || !("id" in parsed) || !("name" in parsed)) {
        toast.error("Unexpected server response");
        return;
      }

      const site = parsed as Site;
      setSites((prev) => [...prev, site]);
      setName("");
      toast.success("Bucket added");
    } catch {
      toast.error("Failed to create bucket (network error)");
    }
  };

  const removeSite = (site: Site) => {
    setSiteToDelete(site);
  };

  const confirmDelete = async () => {
    if (!siteToDelete) return;
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/sites/${siteToDelete.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to remove bucket");
        return;
      }

      setSites((prev) => prev.filter((item) => item.id !== siteToDelete.id));
      toast.success("Bucket removed");
      setSiteToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8 relative">
      <div>
        <h2 className="text-2xl font-semibold">Buckets</h2>
        <p className="text-sm opacity-70">Organize uploads by bucket or environment.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Create new bucket"
        />
        <Button onClick={createSite} disabled={!name.trim()} title={!name.trim() ? "Enter a bucket name" : undefined}>
          Add Bucket
        </Button>
      </div>

      <div className="grid gap-3">
        {sites.map((site) => (
          <div key={site.id} className="flex items-center justify-between gap-4 rounded-[18px] border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{site.name}</p>
              <p className="truncate text-[11px] opacity-60">Bucket ID: {site.id}</p>
            </div>
            <button
              onClick={() => removeSite(site)}
              className="rounded-md p-2 text-gray-400 transition-colors hover:text-rose-500"
              aria-label={`Remove ${site.name}`}
              title={`Remove ${site.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {siteToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-rose-500/20 bg-white dark:bg-slate-900 p-8 shadow-2xl glass glass-edge animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setSiteToDelete(null)}
              disabled={isDeleting}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                <AlertTriangle className="h-8 w-8 text-rose-500" />
              </div>
              <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Delete Bucket?</h3>
              <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to remove <span className="font-bold text-slate-700 dark:text-slate-300">&quot;{siteToDelete.name}&quot;</span>?
                This action is permanent and will securely wipe all related uploads and vulnerability data.
              </p>

              <div className="flex w-full gap-4">
                <Button
                  variant="outline"
                  onClick={() => setSiteToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={confirmDelete}
                  loading={isDeleting}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.2)] text-white border-0"
                >
                  {isDeleting ? "Deleting..." : "Delete Permanently"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
