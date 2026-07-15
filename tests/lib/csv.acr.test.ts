import { describe, it, expect } from "vitest";
import { validateAcrCsv, parseAcrCsv } from "@/lib/csv";

describe("validateAcrCsv", () => {
  it("accepts required ACR headers (case-insensitive, BOM tolerant)", () => {
    const input =
      "\uFEFFregistryName,repository,imageDigest,severity,cveId,packageName\n";
    expect(validateAcrCsv(input)).toEqual({ ok: true });
  });

  it("accepts common header aliases", () => {
    const input =
      "Registry Name,Repository,Image Digest,Severity,CVE,Package Name,Installed Version\n";
    expect(validateAcrCsv(input)).toEqual({ ok: true });
  });

  it("reports missing required headers", () => {
    const input = "registryName,repository,severity\n";
    const res = validateAcrCsv(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.missing).toContain("cveId");
      expect(res.missing).toContain("packageName");
      expect(res.missing).toContain("imageDigest");
    }
  });
});

describe("parseAcrCsv", () => {
  it("parses valid rows and drops rows missing required fields", () => {
    const csv =
      `registryName,repository,imageDigest,severity,cveId,packageName,installedVersion,description,remediation\n` +
      `myacr,web/app,sha256:abc,High,CVE-2024-1234,openssl,3.0.1,desc,upgrade\n` +
      `myacr,web/app,sha256:abc,High,,openssl,3.0.1,desc,upgrade\n` +
      `,web/app,sha256:abc,High,CVE-2024-1234,openssl,3.0.1,,\n`;

    const rows = parseAcrCsv(csv);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.registryName).toBe("myacr");
    expect(row.repository).toBe("web/app");
    expect(row.cveId).toBe("CVE-2024-1234");
    expect(row.packageName).toBe("openssl");
    expect(row.installedVersion).toBe("3.0.1");
  });

  it("maps aliased header names", () => {
    const csv =
      `Registry Name,Repository,Image Digest,Severity,CVE,Package Name\n` +
      `acr1,ns/img,sha256:def,Critical,CVE-2025-9999,libc\n`;

    const rows = parseAcrCsv(csv);
    expect(rows.length).toBe(1);
    expect(rows[0].cveId).toBe("CVE-2025-9999");
    expect(rows[0].severity).toBe("Critical");
  });
});
