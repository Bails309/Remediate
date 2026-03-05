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
  ["plugin modification date", "pluginModificationDate"],
]);

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").toLowerCase().trim();
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
    for (const [key, value] of Object.entries(record)) {
      const mapped = headers.get(normalizeHeader(key)) ?? key;
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
