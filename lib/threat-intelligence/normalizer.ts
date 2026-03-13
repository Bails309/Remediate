import { Risk } from "@prisma/client";

export interface NormalizedThreat {
    osvId: string;
    cveId?: string | null;
    summary: string;
    details?: string | null;
    source: string;
    affectedPackages: Record<string, unknown>[];
    publishedAt: Date;
    modifiedAt: Date;
    cvssScore?: number | null;
    epssScore?: number | null;
    cisaKevStatus: boolean;
    remediation?: string | null;
}

/**
 * Normalizes and merges threat data from multiple sources.
 * Implementation follows the "NVD Crisis" fallback logic and CISA KEV triage.
 */
export function normalizeThreatData(
    base: Partial<NormalizedThreat>,
    enrichment: {
        cvss?: number | null;
        epss?: number | null;
        cisaKev?: boolean;
        vendorSeverity?: string | null;
    }
): NormalizedThreat {
    const { cvss, epss, cisaKev, vendorSeverity } = enrichment;

    // 1. Triage Logic: Tag as CISA KEV if match found
    const cisaKevStatus = !!cisaKev;

    // 2. Fallback Logic (The NVD Crisis): 
    // If CVSS score is missing, fall back to parsing vendor severity
    let finalCvss = cvss;
    if (finalCvss === null || finalCvss === undefined) {
        finalCvss = mapVendorSeverityToScore(vendorSeverity);
    }

    return {
        osvId: base.osvId!,
        cveId: base.cveId || null,
        summary: base.summary || "No summary provided",
        details: base.details || null,
        source: base.source || "Unknown",
        affectedPackages: base.affectedPackages || [],
        publishedAt: base.publishedAt || new Date(),
        modifiedAt: base.modifiedAt || new Date(),
        cvssScore: finalCvss,
        epssScore: epss || null,
        cisaKevStatus: cisaKevStatus,
        remediation: base.remediation || null,
    };
}

/**
 * Maps vendor severity strings (CSAF/GHSA) to approximate CVSS scores when NVD is missing data.
 */
function mapVendorSeverityToScore(severity?: string | null): number | null {
    if (!severity) return null;
    const s = severity.toLowerCase();
    if (s.includes("critical")) return 9.5;
    if (s.includes("high")) return 7.5;
    if (s.includes("medium") || s.includes("moderate")) return 5.5;
    if (s.includes("low")) return 2.5;
    return null;
}

/**
 * Maps CVSS score to the existing Risk enum.
 */
export function scoreToRisk(score?: number | null): Risk {
    if (score === null || score === undefined) return Risk.None;
    if (score >= 9.0) return Risk.Critical;
    if (score >= 7.0) return Risk.High;
    if (score >= 4.0) return Risk.Medium;
    if (score >= 0.1) return Risk.Low;
    return Risk.None;
}
