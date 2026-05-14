import { describe, it, expect } from "vitest";
import { renderThreatEmail, type ThreatGroup } from "@/lib/threat-intelligence/email-template";

const makeGroup = (overrides: Partial<ThreatGroup> = {}): ThreatGroup => ({
    cisaKev: [],
    criticalHigh: [],
    standard: [],
    ...overrides,
});

describe("renderThreatEmail", () => {
    it("returns an HTML string with the layout wrapper and digest heading", () => {
        const html = renderThreatEmail(makeGroup());
        expect(html).toContain("<html");
        expect(html).toContain("Daily Threat Intelligence");
    });

    it("renders a CTA pointing at the threat-intelligence dashboard", () => {
        const html = renderThreatEmail(makeGroup());
        expect(html).toMatch(/href="[^"]*\/threat-intelligence"/);
        expect(html).toContain("VIEW FULL INTELLIGENCE FEED");
    });

    it("includes a CISA KEV section only when KEV threats are present", () => {
        const withoutKev = renderThreatEmail(makeGroup({ standard: [{ osvId: "OSV-1", summary: "low risk thing" }] }));
        expect(withoutKev).not.toContain("Known Exploited (CISA KEV)");

        const withKev = renderThreatEmail(
            makeGroup({
                cisaKev: [
                    { osvId: "CVE-2024-0001", cveId: "CVE-2024-0001", summary: "actively exploited", cvssScore: 9.8, cisaKevStatus: true },
                ],
            }),
        );
        expect(withKev).toContain("Known Exploited (CISA KEV)");
        expect(withKev).toContain("CVE-2024-0001");
        expect(withKev).toContain("actively exploited");
    });

    it("includes a Critical & High Risk section only when criticalHigh threats are present", () => {
        const html = renderThreatEmail(
            makeGroup({
                criticalHigh: [
                    { osvId: "CVE-2024-0010", cveId: "CVE-2024-0010", summary: "high severity issue", cvssScore: 8.1 },
                ],
            }),
        );
        expect(html).toContain("Critical & High Risk");
        expect(html).toContain("CVE-2024-0010");
        expect(html).toContain("CVSS 8.1");
    });

    it("includes Other Vulnerabilities section only when standard threats are present", () => {
        const html = renderThreatEmail(makeGroup({ standard: [{ osvId: "OSV-100", summary: "minor issue", cvssScore: 3.1 }] }));
        expect(html).toContain("Other Vulnerabilities");
        expect(html).toContain("OSV-100");
    });

    it("renders 'N/A' when cvssScore is missing", () => {
        const html = renderThreatEmail(makeGroup({ standard: [{ osvId: "OSV-X", summary: "score unknown" }] }));
        expect(html).toContain("CVSS N/A");
    });

    it("attributes OSV-prefixed ids to OSV.dev and CVE-prefixed ids to NVD/CISA", () => {
        const html = renderThreatEmail(
            makeGroup({
                standard: [
                    { osvId: "OSV-2024-1", summary: "osv item" },
                    { osvId: "CVE-2024-2", cveId: "CVE-2024-2", summary: "cve item" },
                ],
            }),
        );
        expect(html).toContain("OSV.dev");
        expect(html).toContain("NVD/CISA");
    });

    it("preheader summarises the total count across all three buckets", () => {
        const html = renderThreatEmail(
            makeGroup({
                cisaKev: [{ osvId: "CVE-1", summary: "a" }],
                criticalHigh: [
                    { osvId: "CVE-2", summary: "b" },
                    { osvId: "CVE-3", summary: "c" },
                ],
                standard: [{ osvId: "CVE-4", summary: "d" }],
            }),
        );
        // renderEmailLayout puts the preheader inside a hidden span; just verify the text exists.
        expect(html).toContain("Detected 4 new threats");
    });
});
