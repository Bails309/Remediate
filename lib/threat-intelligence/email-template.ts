import { renderEmailLayout } from "../email";

export interface ThreatItem {
    osvId: string;
    cveId?: string | null;
    summary: string;
    cvssScore?: number | null;
    cisaKevStatus?: boolean;
}

export interface ThreatGroup {
    cisaKev: ThreatItem[];
    criticalHigh: ThreatItem[];
    standard: ThreatItem[];
}

export function renderThreatEmail(threats: ThreatGroup) {
    const totalCount = threats.cisaKev.length + threats.criticalHigh.length + threats.standard.length;
    const dashboardUrl = process.env.AUTH_URL || "https://dashboard.remediate.io";
    
    const contentHtml = `
    <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9;">
        <h1 style="color: #0f172a; font-size: 28px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.02em; line-height: 1.2;">Daily Threat Intelligence</h1>
        <p style="color: #64748b; font-size: 16px; margin: 0; line-height: 1.5;">Aggregated security findings from the last 24 hours.</p>
    </div>

    <!-- Bucket 1: CISA KEV (Urgent) -->
    ${threats.cisaKev.length > 0 ? `
    <div style="margin-bottom: 40px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <div style="background-color: #f43f5e; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">Action Required</div>
            <h2 style="color: #0f172a; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0; letter-spacing: 0.05em;">Known Exploited (CISA KEV)</h2>
        </div>
        ${renderThreatCards(threats.cisaKev, "#f43f5e")}
    </div>
    ` : ""}

    <!-- Bucket 2: Critical & High Risk -->
    ${threats.criticalHigh.length > 0 ? `
    <div style="margin-bottom: 40px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <div style="background-color: #f59e0b; color: white; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;">High Severity</div>
            <h2 style="color: #0f172a; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0; letter-spacing: 0.05em;">Critical & High Risk</h2>
        </div>
        ${renderThreatCards(threats.criticalHigh, "#f59e0b")}
    </div>
    ` : ""}

    <!-- Bucket 3: Other Vulnerabilities -->
    ${threats.standard.length > 0 ? `
    <div style="margin-bottom: 40px;">
        <h2 style="color: #64748b; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.05em;">🛡️ Other Vulnerabilities</h2>
        ${renderThreatCards(threats.standard, "#94a3b8")}
    </div>
    ` : ""}

    <!-- CTA -->
    <div style="text-align: center; margin: 48px 0;">
        <a href="${dashboardUrl}/threat-intelligence" style="background-color: #0f172a; color: #ffffff; padding: 16px 32px; border-radius: 12px; font-size: 14px; font-weight: 700; text-decoration: none; display: inline-block; letter-spacing: 0.02em; border: 1px solid #1e293b; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            VIEW FULL INTELLIGENCE FEED
        </a>
    </div>

    <div style="margin-top: 48px; padding-top: 32px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.8;">
        <p style="margin: 0 0 8px 0;">You are receiving this because you opted in to Daily Threat Intelligence alerts.</p>
        <p style="margin: 0; font-style: italic;">Disclaimer: Aggregated from NVD, OSV, and CISA. Accuracy depends on downstream data sources.</p>
    </div>
    `;

    return renderEmailLayout({
        title: "Daily Threat Digest",
        preheader: `Detected ${totalCount} new threats targeting your profile.`,
        contentHtml
    });
}

function renderThreatCards(items: ThreatItem[], accentColor: string) {
    return items.map(item => {
        const score = item.cvssScore || 0;
        let badgeColor = "#94a3b8";
        if (score >= 9.0) badgeColor = "#ef4444";
        else if (score >= 7.0) badgeColor = "#f97316";
        else if (score >= 4.0) badgeColor = "#eab308";

        return `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 16px; position: relative; overflow: hidden;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 800; color: #0f172a; font-size: 15px; letter-spacing: -0.02em;">${item.cveId || item.osvId}</span>
                <span style="font-size: 11px; font-weight: 800; background: ${badgeColor}20; border: 1px solid ${badgeColor}40; padding: 4px 10px; border-radius: 20px; color: ${badgeColor}; text-transform: uppercase; letter-spacing: 0.05em;">
                    CVSS ${item.cvssScore || "N/A"}
                </span>
            </div>
            <div style="font-size: 14px; color: #334155; line-height: 1.6; font-weight: 500;">${item.summary}</div>
            <div style="margin-top: 16px; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;">
                Source: ${item.osvId.startsWith("CVE") ? "NVD/CISA" : "OSV.dev"}
            </div>
        </div>
        `;
    }).join("");
}
