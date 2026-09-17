export interface VulnerabilityExportItem {
  id: string;
  name: string;
  risk: string;
  status: string;
  host: string;
  port: string;
  protocol: string;
  cve?: string | null;
  cvssScore?: number | null;
  pluginId: string;
  scannerType?: string | null;
  crNumber?: string | null;
  synopsis?: string | null;
  description?: string | null;
  solution?: string | null;
  seeAlso?: string | null;
  pluginOutput?: string | null;
  createdAt: Date | string;
  lastSeenAt: Date | string;
  site?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; email?: string } | null;
  group?: { id: string; name: string } | null;
}

/**
 * Escapes a cell value for CSV output following RFC 4180 and
 * sanitizes potential spreadsheet formula injection (=, +, -, @, \t, \r).
 */
export function sanitizeAndEscapeCsvCell(raw: unknown): string {
  if (raw === null || raw === undefined) {
    return "";
  }

  let str = String(raw);

  // Prevent spreadsheet formula injection (DDE / CSV injection)
  // If the cell starts with a formula trigger, prepend a single quote
  const formulaTriggers = ["=", "+", "-", "@", "\t", "\r"];
  if (formulaTriggers.some((char) => str.startsWith(char))) {
    str = `'${str}`;
  }

  // If the cell contains quotes, commas, or newlines, quote the entire field and escape quotes
  if (/[",\n\r]/.test(str) || str.startsWith("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export const CSV_COLUMNS = [
  "ID",
  "Report / Bucket",
  "Title",
  "Severity Level",
  "Status",
  "Host / Asset",
  "Service / Port",
  "Protocol",
  "CVE",
  "CVSS Score",
  "Plugin ID / Report Ref",
  "Scanner Type",
  "Assignee Name",
  "Assignee Email",
  "Assigned Group",
  "CR Number",
  "Brief Description",
  "Full Description",
  "Solution",
  "See Also",
  "Plugin Output",
  "First Detected",
  "Last Seen",
] as const;

export function serializeVulnerabilitiesToCsv(items: VulnerabilityExportItem[]): string {
  const headerRow = CSV_COLUMNS.map(sanitizeAndEscapeCsvCell).join(",");

  const rows = items.map((item) => {
    const briefDesc = item.synopsis || (item.description ? item.description.slice(0, 300) : "");

    const values = [
      item.id,
      item.site?.name ?? "",
      item.name,
      item.risk,
      item.status,
      item.host,
      item.port,
      item.protocol,
      item.cve ?? "",
      item.cvssScore !== null && item.cvssScore !== undefined ? String(item.cvssScore) : "",
      item.pluginId,
      item.scannerType ?? "NESSUS",
      item.assignee?.name ?? "",
      item.assignee?.email ?? "",
      item.group?.name ?? "",
      item.crNumber ?? "",
      briefDesc,
      item.description ?? "",
      item.solution ?? "",
      item.seeAlso ?? "",
      item.pluginOutput ?? "",
      item.createdAt ? new Date(item.createdAt).toISOString() : "",
      item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : "",
    ];

    return values.map(sanitizeAndEscapeCsvCell).join(",");
  });

  return [headerRow, ...rows].join("\r\n");
}

export function serializeVulnerabilitiesToJson(
  items: VulnerabilityExportItem[],
  metadata?: {
    bucketName?: string;
    filters?: Record<string, unknown>;
  }
): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    total: items.length,
    ...(metadata?.bucketName ? { bucket: metadata.bucketName, report: metadata.bucketName } : {}),
    ...(metadata?.filters ? { filters: metadata.filters } : {}),
    vulnerabilities: items.map((item) => ({
      id: item.id,
      report: item.site?.name ?? null,
      bucket: item.site?.name ?? null,
      title: item.name,
      name: item.name,
      severity: item.risk,
      risk: item.risk,
      status: item.status,
      host: item.host,
      service: item.port,
      port: item.port,
      protocol: item.protocol,
      cve: item.cve ?? null,
      cvssScore: item.cvssScore ?? null,
      pluginId: item.pluginId,
      reportRef: item.pluginId,
      scannerType: item.scannerType ?? "NESSUS",
      assignee: item.assignee
        ? {
            id: item.assignee.id,
            name: item.assignee.name,
            email: item.assignee.email ?? null,
          }
        : null,
      group: item.group
        ? {
            id: item.group.id,
            name: item.group.name,
          }
        : null,
      crNumber: item.crNumber ?? null,
      briefDescription: item.synopsis ?? (item.description ? item.description.slice(0, 300) : null),
      synopsis: item.synopsis ?? null,
      description: item.description ?? null,
      solution: item.solution ?? null,
      seeAlso: item.seeAlso ?? null,
      pluginOutput: item.pluginOutput ?? null,
      firstDetected: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      lastSeenAt: item.lastSeenAt ? new Date(item.lastSeenAt).toISOString() : null,
    })),
  };

  return JSON.stringify(payload, null, 2);
}
