import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        vulnerability: { findMany: vi.fn() },
        vulnerabilityHistory: { findMany: vi.fn() },
    },
}));

import { prisma } from "@/lib/prisma";
import {
    getEnvironmentFootprint,
    normalizeCve,
    extractProductsFromTitle,
    matchThreatToEnvironment,
    filterThreatsForEnvironment,
    clearEnvironmentFootprintCache,
    EnvironmentFootprint,
} from "@/lib/threat-intelligence/environment-matcher";

const mockPrisma = prisma as unknown as {
    vulnerability: { findMany: ReturnType<typeof vi.fn> };
    vulnerabilityHistory: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
    vi.clearAllMocks();
    clearEnvironmentFootprintCache();
});

describe("environment-matcher — normalization & extraction", () => {
    it("normalizes CVE strings to uppercase trimmed format", () => {
        expect(normalizeCve(" cve-2023-44487 ")).toBe("CVE-2023-44487");
        expect(normalizeCve("CVE-2024-21626")).toBe("CVE-2024-21626");
    });

    it("extracts known enterprise products from vulnerability titles", () => {
        const title1 = "Apache Tomcat 9.0.x < 9.0.83 Remote Code Execution";
        const products1 = extractProductsFromTitle(title1);
        expect(products1).toContain("tomcat");
        expect(products1).toContain("apache");

        const title2 = "PT3194-WEB-002 Apache Log4j JNDI RCE";
        const products2 = extractProductsFromTitle(title2);
        expect(products2).toContain("log4j");
        expect(products2).toContain("apache");

        const title3 = "CVE-2024-21626 — runc 1.1.11";
        const products3 = extractProductsFromTitle(title3);
        expect(products3).toContain("runc");
    });

    it("extracts dynamic software prefix before action words or version numbers", () => {
        const title = "CustomGatewayService < 2.4.0 Denial of Service";
        const products = extractProductsFromTitle(title);
        expect(products).toContain("customgatewayservice");
    });
});

describe("environment-matcher — getEnvironmentFootprint", () => {
    it("aggregates CVEs, container packages, and product keywords from active and historical findings", async () => {
        mockPrisma.vulnerability.findMany.mockResolvedValue([
            {
                cve: "CVE-2023-44487, CVE-2023-38545",
                pluginId: "182878",
                packageName: null,
                name: "Apache Tomcat 9.0.x Multiple Vulnerabilities",
            },
            {
                cve: null,
                pluginId: "CVE-2024-21626",
                packageName: "runc",
                name: "CVE-2024-21626 — runc 1.1.11",
            },
        ]);

        mockPrisma.vulnerabilityHistory.findMany.mockResolvedValue([
            {
                cve: "CVE-2021-44228",
                pluginId: "155998",
                packageName: "curl",
                name: "Apache Log4j Remote Code Execution",
            },
        ]);

        const footprint = await getEnvironmentFootprint({ forceRefresh: true });

        // Check CVEs
        expect(footprint.cves.has("CVE-2023-44487")).toBe(true);
        expect(footprint.cves.has("CVE-2023-38545")).toBe(true);
        expect(footprint.cves.has("CVE-2024-21626")).toBe(true);
        expect(footprint.cves.has("CVE-2021-44228")).toBe(true);

        // Check Container Packages
        expect(footprint.packages.has("runc")).toBe(true);
        expect(footprint.packages.has("curl")).toBe(true);

        // Check Extracted Products
        expect(footprint.products.has("tomcat")).toBe(true);
        expect(footprint.products.has("apache")).toBe(true);
        expect(footprint.products.has("log4j")).toBe(true);
    });
});

describe("environment-matcher — matchThreatToEnvironment", () => {
    const footprint: EnvironmentFootprint = {
        cves: new Set(["CVE-2023-44487", "CVE-2024-21626"]),
        packages: new Set(["curl", "openssl", "runc"]),
        products: new Set(["tomcat", "apache tomcat", "log4j"]),
    };

    it("matches threats by exact CVE ID", () => {
        const threat = {
            osvId: "GHSA-m85q-v69p-vj73",
            cveId: "CVE-2024-21626",
            summary: "Container escape in runc",
        };
        const result = matchThreatToEnvironment(threat, footprint);
        expect(result.matched).toBe(true);
        expect(result.reason).toContain("CVE-2024-21626");
    });

    it("matches threats by OSV ID when OSV ID is a known CVE", () => {
        const threat = {
            osvId: "CVE-2023-44487",
            cveId: null,
            summary: "HTTP/2 Rapid Reset",
        };
        const result = matchThreatToEnvironment(threat, footprint);
        expect(result.matched).toBe(true);
        expect(result.reason).toContain("CVE-2023-44487");
    });

    it("matches threats by structured affected package", () => {
        const threat = {
            osvId: "GHSA-xyz",
            cveId: "CVE-2026-99999",
            summary: "Arbitrary code execution",
            affectedPackages: [{ package: { name: "curl" } }],
        };
        const result = matchThreatToEnvironment(threat, footprint);
        expect(result.matched).toBe(true);
        expect(result.reason).toContain("curl");
    });

    it("matches threats by summary text keyword boundary", () => {
        const threat = {
            osvId: "GHSA-abc",
            cveId: "CVE-2026-11111",
            summary: "A vulnerability in Apache Tomcat allows privilege escalation",
        };
        const result = matchThreatToEnvironment(threat, footprint);
        expect(result.matched).toBe(true);
        expect(result.reason).toContain("tomcat");
    });

    it("rejects threats with no overlap to environment", () => {
        const threat = {
            osvId: "GHSA-unrelated",
            cveId: "CVE-2026-55555",
            summary: "WordPress Booking Calendar Plugin SQL Injection",
            details: "Detailed plugin flaw...",
            affectedPackages: [{ name: "booking-calendar" }],
        };
        const result = matchThreatToEnvironment(threat, footprint);
        expect(result.matched).toBe(false);
    });
});

describe("environment-matcher — filterThreatsForEnvironment", () => {
    const footprint: EnvironmentFootprint = {
        cves: new Set(["CVE-2024-21626"]),
        packages: new Set(["curl"]),
        products: new Set(["tomcat"]),
    };

    it("filters a list of candidate threats and annotates match reason", () => {
        const candidates = [
            {
                osvId: "T1",
                cveId: "CVE-2024-21626",
                summary: "runc escape",
            },
            {
                osvId: "T2",
                cveId: "CVE-2026-0001",
                summary: "Unrelated WordPress plugin flaw",
            },
            {
                osvId: "T3",
                cveId: "CVE-2026-0002",
                summary: "Buffer overflow in curl library",
            },
        ];

        const matched = filterThreatsForEnvironment(candidates, footprint);
        expect(matched).toHaveLength(2);
        expect(matched[0].osvId).toBe("T1");
        expect(matched[0].environmentMatchReason).toBeDefined();
        expect(matched[1].osvId).toBe("T3");
        expect(matched[1].environmentMatchReason).toContain("curl");
    });
});
