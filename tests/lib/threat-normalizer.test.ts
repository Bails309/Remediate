import { describe, it, expect } from "vitest";
import { normalizeThreatData, scoreToRisk } from "../../lib/threat-intelligence/normalizer";
import { Risk } from "@prisma/client";

describe("Threat Normalizer", () => {
    describe("normalizeThreatData", () => {
        it("normalizes NVD data with CVSS score", () => {
            const base = {
                osvId: "CVE-2024-1234",
                cveId: "CVE-2024-1234",
                summary: "Test CVE",
                source: "NVD",
                publishedAt: new Date("2024-01-01"),
                modifiedAt: new Date("2024-01-02"),
            };
            const enrichment = {
                cvss: 8.5,
                cisaKev: true,
            };

            const result = normalizeThreatData(base, enrichment);

            expect(result.osvId).toBe("CVE-2024-1234");
            expect(result.cvssScore).toBe(8.5);
            expect(result.cisaKevStatus).toBe(true);
            expect(result.source).toBe("NVD");
        });

        it("falls back to vendor severity when CVSS is missing", () => {
            const base = {
                osvId: "GHSA-xxxx",
                summary: "Test GHSA",
                source: "OSV",
            };
            const enrichment = {
                vendorSeverity: "CRITICAL",
            };

            const result = normalizeThreatData(base, enrichment);

            expect(result.cvssScore).toBe(9.5); // Derived from CRITICAL
            expect(result.source).toBe("OSV");
        });

        it("handles missing enrichment data gracefully", () => {
            const base = { osvId: "TEST-1" };
            const result = normalizeThreatData(base, {});

            expect(result.cvssScore).toBeNull();
            expect(result.cisaKevStatus).toBe(false);
            expect(result.summary).toBe("No summary provided");
        });
    });

    describe("scoreToRisk", () => {
        it("maps scores to correct Risk levels", () => {
            expect(scoreToRisk(9.5)).toBe(Risk.Critical);
            expect(scoreToRisk(7.5)).toBe(Risk.High);
            expect(scoreToRisk(5.5)).toBe(Risk.Medium);
            expect(scoreToRisk(2.5)).toBe(Risk.Low);
            expect(scoreToRisk(0)).toBe(Risk.None);
            expect(scoreToRisk(null)).toBe(Risk.None);
        });
    });
});
