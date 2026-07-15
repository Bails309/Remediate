import { parse } from "csv-parse/sync";

export type NessusRow = {
  pluginId: string;
  cve?: string;
  cvssScore?: number;
  risk: string;
  host: string;
  protocol: string;
  port: string;
  name: string;
  synopsis?: string;
  description?: string;
  solution?: string;
  seeAlso?: string;
  pluginOutput?: string;
  pluginPublicationDate?: string;
  pluginModificationDate?: string;
};

const headers = new Map([
  ["plugin id", "pluginId"],
  ["cve", "cve"],
  ["cvss", "cvssScore"],
  ["cvss score", "cvssScore"],
  ["risk", "risk"],
  ["severity", "risk"],
  ["host", "host"],
  ["protocol", "protocol"],
  ["port", "port"],
  ["name", "name"],
  ["synopsis", "synopsis"],
  ["description", "description"],
  ["solution", "solution"],
  ["see also", "seeAlso"],
  ["plugin output", "pluginOutput"],
  ["plugin publication date", "pluginPublicationDate"],
  ["plugin publication", "pluginPublicationDate"],
  ["publication date", "pluginPublicationDate"],
  ["plugin modification date", "pluginModificationDate"],
]);

function normalizeHeader(value: string) {
  // Remove BOM, lowercase, trim, and remove any non-alphanumeric characters except spaces
  return value.replace(/^\uFEFF/, "").toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

const requiredKeys = ["pluginId", "host", "port"];

export function validateNessusCsv(input: string) {
  const rows = parse(input, {
    to_line: 1,
    relax_column_count: true,
    trim: true,
  }) as string[][];

  const headerRow = rows[0] ?? [];
  const mapped = headerRow.map((header) => headers.get(normalizeHeader(header)) ?? header);
  const normalized = new Set(mapped.map((value) => value.toLowerCase()));

  const missing = requiredKeys.filter((key) => !normalized.has(key.toLowerCase()));
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}

export function parseNessusCsv(input: string) {
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const results: NessusRow[] = [];
  for (const record of records) {
    const normalized: Record<string, string> = {};
    const rawKeys = Object.keys(record);
    if (results.length === 0) {
      console.log(`[CSV] Row 1 raw headers: ${JSON.stringify(rawKeys)}`);
    }
    
    for (const [key, value] of Object.entries(record)) {
      const norm = normalizeHeader(key);
      const mapped = headers.get(norm) ?? norm;
      normalized[mapped] = value;
    }

    if (!normalized.pluginId || !normalized.host || !normalized.port) {
      continue;
    }

    results.push({
      pluginId: normalized.pluginId,
      cve: normalized.cve || undefined,
      cvssScore: normalized.cvssScore ? Number(normalized.cvssScore) : undefined,
      risk: normalized.risk || "None",
      host: normalized.host,
      protocol: normalized.protocol || "",
      port: normalized.port,
      name: normalized.name || normalized.pluginId,
      synopsis: normalized.synopsis || undefined,
      description: normalized.description || undefined,
      solution: normalized.solution || undefined,
      seeAlso: normalized.seeAlso || undefined,
      pluginOutput: normalized.pluginOutput || undefined,
      pluginPublicationDate: normalized.pluginPublicationDate || undefined,
      pluginModificationDate: normalized.pluginModificationDate || undefined,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Azure Container Registry (ACR) vulnerability CSV export
// ---------------------------------------------------------------------------

export type AcrRow = {
  timeGenerated?: string;
  registryName: string;
  repository: string;
  imageDigest: string;
  severity: string;
  cveId: string;
  packageName: string;
  installedVersion?: string;
  description?: string;
  remediation?: string;
};

const acrHeaders = new Map<string, keyof AcrRow>([
  ["time generated", "timeGenerated"],
  ["timegenerated", "timeGenerated"],
  ["registry name", "registryName"],
  ["registryname", "registryName"],
  ["repository", "repository"],
  ["image digest", "imageDigest"],
  ["imagedigest", "imageDigest"],
  ["severity", "severity"],
  ["cve id", "cveId"],
  ["cveid", "cveId"],
  ["cve", "cveId"],
  ["package name", "packageName"],
  ["packagename", "packageName"],
  ["installed version", "installedVersion"],
  ["installedversion", "installedVersion"],
  ["description", "description"],
  ["remediation", "remediation"],
]);

const acrRequiredKeys: Array<keyof AcrRow> = [
  "registryName",
  "repository",
  "imageDigest",
  "severity",
  "cveId",
  "packageName",
];

export function validateAcrCsv(input: string) {
  const rows = parse(input, {
    to_line: 1,
    relax_column_count: true,
    trim: true,
  }) as string[][];

  const headerRow = rows[0] ?? [];
  const mapped = headerRow.map((header) => acrHeaders.get(normalizeHeader(header)) ?? header);
  const normalized = new Set(mapped.map((value) => value.toLowerCase()));

  const missing = acrRequiredKeys.filter((key) => !normalized.has(key.toLowerCase()));
  if (missing.length > 0) {
    return { ok: false as const, missing };
  }
  return { ok: true as const };
}

export function parseAcrCsv(input: string): AcrRow[] {
  const records = parse(input, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const results: AcrRow[] = [];
  for (const record of records) {
    const normalized: Partial<Record<keyof AcrRow, string>> = {};

    for (const [key, value] of Object.entries(record)) {
      const norm = normalizeHeader(key);
      const mapped = acrHeaders.get(norm);
      if (mapped) {
        normalized[mapped] = value;
      }
    }

    if (
      !normalized.registryName ||
      !normalized.repository ||
      !normalized.imageDigest ||
      !normalized.cveId ||
      !normalized.packageName
    ) {
      continue;
    }

    results.push({
      timeGenerated: normalized.timeGenerated || undefined,
      registryName: normalized.registryName,
      repository: normalized.repository,
      imageDigest: normalized.imageDigest,
      severity: normalized.severity || "None",
      cveId: normalized.cveId,
      packageName: normalized.packageName,
      installedVersion: normalized.installedVersion || undefined,
      description: normalized.description || undefined,
      remediation: normalized.remediation || undefined,
    });
  }

  return results;
}
