"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type Site = { id: string; name: string };

type Props = {
  initialSites: Site[];
};

export function SitesClient({ initialSites }: Props) {
  const [sites, setSites] = useState<Site[]>(initialSites);
  const [name, setName] = useState("");

  const createSite = async () => {
    if (!name.trim()) return;
    const response = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      toast.error("Failed to create bucket");
      return;
    }

    const site = (await response.json()) as Site;
    setSites((prev) => [...prev, site]);
    setName("");
    toast.success("Bucket added");
  };

  const removeSite = async (site: Site) => {
    const confirmed = window.confirm(`Remove ${site.name}? This will delete related uploads and vulnerabilities.`);
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to remove bucket");
      return;
    }

    setSites((prev) => prev.filter((item) => item.id !== site.id));
    toast.success("Bucket removed");
  };

  return (
    <div className="space-y-8">
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
        <Button onClick={createSite}>Add Bucket</Button>
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
              className="rounded-md p-2 text-gray-400 transition-colors hover:text-red-500"
              aria-label={`Remove ${site.name}`}
              title={`Remove ${site.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
