"use client";

import { siApache, siCitrix, siConfluence, siKubernetes, siLinux, siVmware } from "simple-icons";
import { cn } from "@/components/cn";

type SimpleIcon = { title: string; hex: string; path: string };

// Only buckets that map to a single vendor get a brand mark; multi-vendor
// categories (VPN appliances, databases, …) keep their generic icon.
const BRAND_ICONS: Record<string, SimpleIcon> = {
  Citrix: siCitrix,
  "VMware / ESXi": siVmware,
  "Atlassian Confluence": siConfluence,
  "Apache / Log4j": siApache,
  "Containers / Kubernetes": siKubernetes,
  Linux: siLinux,
};

/** Brand hex values like Confluence's #172B4D vanish on the dark theme. */
function isLegible(hex: string) {
  const value = parseInt(hex, 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 90;
}

export function hasBrandIcon(technology: string) {
  return technology in BRAND_ICONS;
}

export function BrandIcon({ technology, className }: { technology: string; className?: string }) {
  const icon = BRAND_ICONS[technology];
  if (!icon) return null;

  return (
    <svg
      role="img"
      aria-label={icon.title}
      viewBox="0 0 24 24"
      className={cn("h-3.5 w-3.5 shrink-0", className)}
      fill={isLegible(icon.hex) ? `#${icon.hex}` : "currentColor"}
    >
      <path d={icon.path} />
    </svg>
  );
}
