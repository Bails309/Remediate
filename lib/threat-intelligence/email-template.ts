import { renderEmailLayout } from "../email";

interface ThreatItem {
    osvId: string;
    cveId?: string | null;
    summary: string;
    cvssScore?: number | null;
}

interface ThreatGroup {
    cisaKev: ThreatItem[];
    criticalHigh: ThreatItem[];
    standard: ThreatItem[];
}

export function renderThreatEmail(threats: ThreatGroup) {
    const totalCount = threats.cisaKev.length + threats.criticalHigh.length + threats.standard.length;
    
    const contentHtml = `
    <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0 0 8px 0; letter-spacing: -0.025em;">Daily Threat Intelligence</h1>
    <p style="color: #64748b; font-size: 15px; margin: 0 0 32px 0;">Summary of new vulnerabilities and exploits detected in the last 24 hours.</p>

    <!-- Bucket 1: CISA KEV (Urgent) -->
    ${threats.cisaKev.length > 0 ? `
    <div style="background-color: #fff1f2; border: 1px solid #fda4af; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <h2 style="color: #9f1239; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 12px 0; letter-spacing: 0.05em;">🚨 Known Exploited (CISA KEV)</h2>
        ${renderThreatList(threats.cisaKev)}
    </div>
    ` : ""}

    <!-- Bucket 2: Critical & High Risk -->
    ${threats.criticalHigh.length > 0 ? `
    <div style="background-color: #fff7ed; border: 1px solid #fdba74; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <h2 style="color: #9a3412; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 12px 0; letter-spacing: 0.05em;">🔥 Critical & High Risk</h2>
        ${renderThreatList(threats.criticalHigh)}
    </div>
    ` : ""}

    <!-- Bucket 3: Other Vulnerabilities -->
    ${threats.standard.length > 0 ? `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
        <h2 style="color: #475569; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 12px 0; letter-spacing: 0.05em;">🛡️ Other Vulnerabilities</h2>
        ${renderThreatList(threats.standard)}
    </div>
    ` : ""}

    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        <p>You are receiving this because you opted in to Daily Threat Intelligence alerts on the Remediate dashboard.</p>
        <p style="font-style: italic;">Disclaimer: This data is aggregated from public feeds (NVD, OSV, CISA). Accuracy depends on source availability.</p>
    </div>
    `;

    return renderEmailLayout({
        title: "Daily Threat Digest",
        preheader: `We've detected ${totalCount} new threats relevant to your profile.`,
        contentHtml
    });
}

function renderThreatList(items: ThreatItem[]) {
    return items.map(item => `
        <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <span style="font-weight: 700; color: #1e293b; font-size: 14px;">${item.cveId || item.osvId}</span>
                <span style="font-size: 11px; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; color: #475569;">CVSS ${item.cvssScore || "N/A"}</span>
            </div>
            <div style="font-size: 13px; color: #475569; margin-top: 4px;">${item.summary}</div>
        </div>
    `).join("");
}
