

const FETCH_TIMEOUT = 15000;

/**
 * Fetcher for NVD CVE API 2.0.
 * Includes exponential backoff for rate limiting (403/429).
 */
export async function fetchNvdCve(cveId: string, apiKey?: string): Promise<Record<string, unknown>> {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`;
    const headers: Record<string, string> = {};
    if (apiKey) headers["apiKey"] = apiKey;

    return fetchWithBackoff(url, headers);
}

/**
 * Fetcher for recent NVD CVEs (modified within a window).
 */
export async function fetchRecentNvdCves(hours = 48, apiKey?: string): Promise<Record<string, unknown>> {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
    const endTime = now.toISOString();

    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate=${startTime}&lastModEndDate=${endTime}`;
    const headers: Record<string, string> = {};
    if (apiKey) headers["apiKey"] = apiKey;

    return fetchWithBackoff(url, headers);
}

/**
 * Fetcher for OSV.dev API.
 */
export async function fetchOsvById(osvId: string): Promise<Record<string, unknown>> {
    const url = `https://api.osv.dev/v1/vulns/${osvId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`OSV fetch failed: ${res.statusText}`);
    return res.json();
}

/**
 * Fetcher for CISA KEV JSON Feed.
 */
export async function fetchCisaKev(): Promise<Record<string, unknown>> {
    const url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) throw new Error(`CISA KEV fetch failed: ${res.statusText}`);
    return res.json();
}

/**
 * Generic fetch with exponential backoff for rate limiting.
 */
async function fetchWithBackoff(url: string, headers: Record<string, string>, retries = 3): Promise<Record<string, unknown> | undefined> {
    let delay = 2000;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { 
                headers, 
                signal: AbortSignal.timeout(FETCH_TIMEOUT) 
            });
            
            if (res.status === 403 || res.status === 429) {
                console.warn(`Rate limited on ${url}, retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
                continue;
            }

            if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.statusText}`);
            return res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
}
