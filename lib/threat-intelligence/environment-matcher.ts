import { prisma } from "@/lib/prisma";

export interface EnvironmentFootprint {
    cves: Set<string>;
    packages: Set<string>;
    products: Set<string>;
}

export interface ThreatCandidate {
    osvId: string;
    cveId?: string | null;
    summary: string;
    details?: string | null;
    affectedPackages?: unknown;
}

export interface EnvironmentMatchResult {
    matched: boolean;
    reason?: string;
}

// Well-known enterprise & open-source software, servers, runtimes, and libraries
const KNOWN_ENTERPRISE_PRODUCTS = new Set([
    "apache", "tomcat", "apache tomcat", "nginx", "openssl", "openssh", "java", "oracle java",
    "python", "node.js", "nodejs", "wordpress", "kubernetes", "docker", "runc", "containerd",
    "redis", "postgresql", "postgres", "mysql", "mariadb", "jenkins", "gitlab", "github",
    "grafana", "prometheus", "elasticsearch", "logstash", "kibana", "rabbitmq", "activemq",
    "kafka", "spring", "spring boot", "spring framework", "log4j", "struts", "struts2",
    "ruby", "rails", "php", "django", "flask", "express", "golang", "dotnet", ".net",
    "asp.net", "iis", "windows server", "linux", "ubuntu", "debian", "alpine", "centos",
    "rhel", "redhat", "busybox", "curl", "libcurl", "sqlite", "sudo", "systemd", "glibc",
    "zlib", "cisco", "fortinet", "fortios", "palo alto", "vmware", "vcenter", "citrix",
    "jquery", "bootstrap", "solr", "weblogic", "websphere", "jboss", "drupal", "joomla",
    "confluence", "jira", "mongodb", "memcached", "postfix", "sendmail", "exim", "bind",
    "named", "haproxy", "envoy", "traefik", "consul", "vault", "terraform", "ansible"
]);

// Stopwords to ignore when extracting software names dynamically
const STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with", "by", "of", "from",
    "vulnerability", "vulnerabilities", "security", "update", "patch", "remote", "code",
    "execution", "denial", "service", "dos", "rce", "buffer", "overflow", "privilege",
    "escalation", "elevation", "arbitrary", "information", "disclosure", "bypass", "multiple",
    "flaw", "issue", "bug", "unspecified", "error", "server", "client", "unknown", "installed",
    "version", "versions", "detected", "weakness", "unauthenticated", "authenticated"
]);

const CVE_REGEX = /\bCVE-\d{4}-\d{4,}\b/gi;

/**
 * Normalizes a CVE string to standard uppercase format.
 */
export function normalizeCve(raw: string): string {
    return raw.trim().toUpperCase();
}

/**
 * Extracts candidate software product names from a vulnerability title.
 */
export function extractProductsFromTitle(title: string): string[] {
    if (!title) return [];

    const products: string[] = [];

    // Clean leading scanner tags e.g. "PT3194-WEB-002 " or "CVE-2024-21626 — "
    let clean = title.replace(/^PT\d+-[A-Z]+-\d+\s*/i, "");
    clean = clean.replace(/^CVE-\d{4}-\d{4,}\s*[—\-:]*\s*/i, "");

    // Check for well-known enterprise products in title
    const cleanLower = clean.toLowerCase();
    for (const prod of KNOWN_ENTERPRISE_PRODUCTS) {
        const regex = new RegExp(`\\b${escapeRegExp(prod)}\\b`, "i");
        if (regex.test(cleanLower)) {
            products.push(prod);
        }
    }

    // Dynamic prefix extraction: match text before first version number or action word
    const prefixMatch = clean.match(/^([A-Za-z0-9_\-.\s]{3,40}?)(?=\s+(?:<|>|<=|>=|\d+\.\d+|Multiple|Vulnerability|Vulnerabilities|Security|Update|RCE|Remote|Buffer|Denial|Privilege))/i);
    if (prefixMatch && prefixMatch[1]) {
        const candidate = prefixMatch[1].trim().toLowerCase();
        if (candidate.length >= 3 && !STOPWORDS.has(candidate)) {
            products.push(candidate);
        }
    }

    return products;
}

/**
 * Helper to escape characters for safe regex construction.
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let cachedFootprint: { data: EnvironmentFootprint; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clears the environment footprint cache (useful in tests or after bulk ingest).
 */
export function clearEnvironmentFootprintCache() {
    cachedFootprint = null;
}

/**
 * Builds the environment footprint across active and historical vulnerabilities
 * imported via Nessus CSV, Pentest PDF, or Azure Container Registry (ACR).
 */
export async function getEnvironmentFootprint(options: { forceRefresh?: boolean } = {}): Promise<EnvironmentFootprint> {
    const now = Date.now();
    if (!options.forceRefresh && cachedFootprint && cachedFootprint.expiresAt > now) {
        return cachedFootprint.data;
    }

    const cves = new Set<string>();
    const packages = new Set<string>();
    const products = new Set<string>();

    // Query active and historical vulnerabilities concurrently
    const [activeVulns, historicalVulns] = await Promise.all([
        prisma.vulnerability.findMany({
            select: {
                cve: true,
                pluginId: true,
                packageName: true,
                name: true
            }
        }),
        prisma.vulnerabilityHistory.findMany({
            select: {
                cve: true,
                pluginId: true,
                packageName: true,
                name: true
            }
        })
    ]);

    const allRecords = [...activeVulns, ...historicalVulns];

    for (const record of allRecords) {
        // 1. CVE extraction
        if (record.cve) {
            const matches = record.cve.match(CVE_REGEX);
            if (matches) {
                matches.forEach(cve => cves.add(normalizeCve(cve)));
            }
        }
        if (record.pluginId) {
            const matches = record.pluginId.match(CVE_REGEX);
            if (matches) {
                matches.forEach(cve => cves.add(normalizeCve(cve)));
            }
        }

        // 2. Package extraction (ACR container packages)
        if (record.packageName) {
            const pkg = record.packageName.trim().toLowerCase();
            if (pkg.length >= 2 && !STOPWORDS.has(pkg)) {
                packages.add(pkg);
            }
        }

        // 3. Product / Technology extraction from title
        if (record.name) {
            const extracted = extractProductsFromTitle(record.name);
            extracted.forEach(p => products.add(p.toLowerCase()));
        }
    }

    const footprint: EnvironmentFootprint = { cves, packages, products };
    cachedFootprint = { data: footprint, expiresAt: now + CACHE_TTL_MS };

    return footprint;
}

/**
 * Determines whether an incoming threat matches the environment footprint.
 */
export function matchThreatToEnvironment(
    threat: ThreatCandidate,
    footprint: EnvironmentFootprint
): EnvironmentMatchResult {
    // 1. Direct CVE / Identifier match
    if (threat.cveId) {
        const normalized = normalizeCve(threat.cveId);
        if (footprint.cves.has(normalized)) {
            return {
                matched: true,
                reason: `Matches environment CVE: ${normalized}`
            };
        }
    }

    if (threat.osvId) {
        const normalized = normalizeCve(threat.osvId);
        if (footprint.cves.has(normalized)) {
            return {
                matched: true,
                reason: `Matches environment CVE: ${normalized}`
            };
        }
    }

    // 2. Affected packages match (from OSV / NVD structured packages)
    if (Array.isArray(threat.affectedPackages)) {
        for (const item of threat.affectedPackages) {
            let pkgName: string | null = null;
            if (typeof item === "string") {
                pkgName = item;
            } else if (item && typeof item === "object") {
                const obj = item as Record<string, unknown>;
                if (typeof obj.package === "object" && obj.package !== null) {
                    const p = obj.package as Record<string, unknown>;
                    if (typeof p.name === "string") pkgName = p.name;
                } else if (typeof obj.name === "string") {
                    pkgName = obj.name;
                }
            }

            if (pkgName) {
                const normPkg = pkgName.trim().toLowerCase();
                if (footprint.packages.has(normPkg)) {
                    return {
                        matched: true,
                        reason: `Matches container package: ${pkgName}`
                    };
                }
                if (footprint.products.has(normPkg)) {
                    return {
                        matched: true,
                        reason: `Matches environment product: ${pkgName}`
                    };
                }
            }
        }
    }

    // 3. Text keyword match in summary or details
    const textToSearch = `${threat.summary || ""} ${threat.details || ""}`.toLowerCase();

    // Check environment packages as whole words
    for (const pkg of footprint.packages) {
        if (pkg.length < 3) continue; // prevent short false positives
        const regex = new RegExp(`\\b${escapeRegExp(pkg)}\\b`, "i");
        if (regex.test(textToSearch)) {
            return {
                matched: true,
                reason: `Matches active package: ${pkg}`
            };
        }
    }

    // Check environment products as whole words
    for (const prod of footprint.products) {
        if (prod.length < 3) continue;
        const regex = new RegExp(`\\b${escapeRegExp(prod)}\\b`, "i");
        if (regex.test(textToSearch)) {
            return {
                matched: true,
                reason: `Matches environment product: ${prod}`
            };
        }
    }

    return { matched: false };
}

/**
 * Filters a list of threats down to only those matching the user's environment.
 */
export function filterThreatsForEnvironment<T extends ThreatCandidate>(
    threats: T[],
    footprint: EnvironmentFootprint
): Array<T & { environmentMatchReason: string }> {
    const matched: Array<T & { environmentMatchReason: string }> = [];

    for (const threat of threats) {
        const result = matchThreatToEnvironment(threat, footprint);
        if (result.matched && result.reason) {
            matched.push({
                ...threat,
                environmentMatchReason: result.reason
            });
        }
    }

    return matched;
}
