

const FETCH_TIMEOUT = 15000;
const NVD_API_KEY = process.env.NVD_API_KEY;

/**
 * Fetcher for NVD CVE API 2.0.
 * Includes jittered exponential backoff for rate limiting (403/429).
 */
export async function fetchNvdCve(cveId: string): Promise<Record<string, unknown>> {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${cveId}`;
    const headers: Record<string, string> = {};
    if (NVD_API_KEY) headers["apiKey"] = NVD_API_KEY;

    const result = await fetchWithBackoff(url, headers);
    return result || {};
}

/**
 * Fetcher for recent NVD CVEs (modified within a window).
 */
export async function fetchRecentNvdCves(hours = 48): Promise<Record<string, unknown>> {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
    const endTime = now.toISOString();

    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate=${startTime}&lastModEndDate=${endTime}`;
    const headers: Record<string, string> = {};
    if (NVD_API_KEY) headers["apiKey"] = NVD_API_KEY;

    const result = await fetchWithBackoff(url, headers);
    return result || {};
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
 * Generic fetch with jittered exponential backoff for rate limiting.
 */
async function fetchWithBackoff(url: string, headers: Record<string, string>, retries = 5): Promise<Record<string, unknown> | undefined> {
    let delay = 2500; // Starting with a slightly higher base delay
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { 
                headers, 
                signal: AbortSignal.timeout(FETCH_TIMEOUT) 
            });
            
            if (res.status === 403 || res.status === 429) {
                // Add jitter to prevent concurrent bulk collisions
                const jitter = Math.random() * 1000;
                const totalDelay = delay + jitter;
                
                console.warn(`Rate limited on ${url}, retrying in ${Math.round(totalDelay)}ms (Attempt ${i + 1}/${retries})...`);
                await new Promise(resolve => setTimeout(resolve, totalDelay));
                
                delay *= 2;
                continue;
            }

            if (!res.ok) throw new Error(`Fetch failed for ${url}: ${res.statusText}`);
            return res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            const jitter = Math.random() * 500;
            await new Promise(resolve => setTimeout(resolve, delay + jitter));
            delay *= 2;
        }
    }
}
