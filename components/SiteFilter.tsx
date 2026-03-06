"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/Select";

type Site = { id: string; name: string };

export function SiteFilter({ sites, selected }: { sites: Site[]; selected: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const onChange = (value: string) => {
    const next = new URLSearchParams(params?.toString() || "");
    if (value) {
      next.set("siteId", value);
    } else {
      next.delete("siteId");
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const options = [
    { label: "All Sites", value: "" },
    ...sites.map((site) => ({ label: site.name, value: site.id }))
  ];

  return (
    <Select
      value={selected}
      onChange={(val) => onChange(val)}
      options={options}
    />
  );
}
