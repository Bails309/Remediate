"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/Select";

type Site = { id: string; name: string };

export function SiteFilter({ sites, selected }: { sites: Site[]; selected: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const onChange = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set("siteId", value);
    } else {
      next.delete("siteId");
    }
    router.push(`/dashboard?${next.toString()}`);
  };

  return (
    <Select value={selected} onChange={(event) => onChange(event.target.value)}>
      <option value="">All Sites</option>
      {sites.map((site) => (
        <option key={site.id} value={site.id}>
          {site.name}
        </option>
      ))}
    </Select>
  );
}
