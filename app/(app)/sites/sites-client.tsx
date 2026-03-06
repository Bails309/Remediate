"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
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
      toast.error("Failed to create site");
      return;
    }

    const site = (await response.json()) as Site;
    setSites((prev) => [...prev, site]);
    setName("");
    toast.success("Site added");
  };

  const removeSite = async (site: Site) => {
    const confirmed = window.confirm(`Remove ${site.name}? This will delete related uploads and vulnerabilities.`);
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to remove site");
      return;
    }

    setSites((prev) => prev.filter((item) => item.id !== site.id));
    toast.success("Site removed");
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Sites</h2>
        <p className="text-sm opacity-70">Organize uploads by site or environment.</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Create new site"
        />
        <Button onClick={createSite}>Add Site</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sites.map((site) => (
          <div key={site.id} className="glass rounded-[24px] border border-[color:var(--color-border)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">{site.name}</p>
                <p className="text-xs opacity-60">Site ID: {site.id}</p>
              </div>
              <Button variant="outline" onClick={() => removeSite(site)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
