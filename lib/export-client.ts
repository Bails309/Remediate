import { toast } from "@/lib/toast";

export interface ExportOptions {
  format: "csv" | "json" | "pdf";
  siteId?: string;
  siteIds?: string[];
  status?: string;
  risk?: string;
  assigneeId?: string;
  groupIds?: string[];
  ids?: string[];
  query?: string;
  includeAllStatuses?: boolean;
  fallbackFilename?: string;
}

export async function downloadVulnerabilitiesExport(options: ExportOptions): Promise<boolean> {
  const {
    format,
    siteId,
    siteIds,
    status,
    risk,
    assigneeId,
    groupIds,
    ids,
    query,
    includeAllStatuses,
    fallbackFilename,
  } = options;

  try {
    const params = new URLSearchParams();
    params.set("format", format);

    if (siteId) params.set("siteId", siteId);
    if (siteIds && siteIds.length > 0) params.set("siteIds", siteIds.join(","));
    if (status) params.set("status", status);
    if (risk) params.set("risk", risk);
    if (assigneeId) params.set("assigneeId", assigneeId);
    if (groupIds && groupIds.length > 0) params.set("groupIds", groupIds.join(","));
    if (ids && ids.length > 0) params.set("ids", ids.join(","));
    if (query) params.set("q", query);
    if (includeAllStatuses) params.set("includeAllStatuses", "true");

    const res = await fetch(`/api/vulnerabilities/export?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || `Failed to export ${format.toUpperCase()}`);
      return false;
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition");
    let filename = fallbackFilename ?? `remediate-outstanding-vulnerabilities.${format}`;

    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

    toast.success(`Exported ${format.toUpperCase()} successfully`);
    return true;
  } catch (error) {
    console.error("Export download error:", error);
    toast.error(`Network error exporting ${format.toUpperCase()}`);
    return false;
  }
}
