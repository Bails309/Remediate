import { renderEmailLayout } from "./email";
type Risk = any;

export interface AssignmentItem {
    id: string;
    name: string;
    risk: Risk;
    host: string;
    port: string;
    status: string;
}

export function renderWeeklyAssignmentEmail(user: { name: string }, assignments: AssignmentItem[]) {
    const totalCount = assignments.length;
    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    
    // Categorize by risk
    const critical = assignments.filter(a => a.risk === "Critical");
    const high = assignments.filter(a => a.risk === "High");
    const others = assignments.filter(a => a.risk !== "Critical" && a.risk !== "High");

    const riskStyles = {
        Critical: { bg: "#fef2f2", text: "#ef4444", border: "#fee2e2" },
        High: { bg: "#fffaf0", text: "#f97316", border: "#ffedd5" },
        Medium: { bg: "#f0f9ff", text: "#0ea5e9", border: "#e0f2fe" },
        Low: { bg: "#f8fafc", text: "#64748b", border: "#f1f5f9" },
        None: { bg: "#f8fafc", text: "#94a3b8", border: "#f1f5f9" },
    };

    const contentHtml = `
    <div style="margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9;">
        <h1 style="color: #0f172a; font-size: 28px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.02em; line-height: 1.2;">Weekly Assignment Summary</h1>
        <p style="color: #64748b; font-size: 16px; margin: 0; line-height: 1.5;">Hello ${user.name}, here is the status of your active security tasks.</p>
    </div>

    <!-- Stats Table -->
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 40px;">
        <tr>
            <td width="33%" style="padding-right: 8px;">
                <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 800; color: #991b1b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Critical</div>
                    <div style="font-size: 24px; font-weight: 800; color: #ef4444;">${critical.length}</div>
                </div>
            </td>
            <td width="33%" style="padding: 0 4px;">
                <div style="background-color: #fffaf0; border: 1px solid #ffedd5; border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 800; color: #9a3412; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">High</div>
                    <div style="font-size: 24px; font-weight: 800; color: #f97316;">${high.length}</div>
                </div>
            </td>
            <td width="33%" style="padding-left: 8px;">
                <div style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 16px; padding: 16px; text-align: center;">
                    <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Other</div>
                    <div style="font-size: 24px; font-weight: 800; color: #334155;">${others.length}</div>
                </div>
            </td>
        </tr>
    </table>

    <!-- Critical Section -->
    ${critical.length > 0 ? `
    <div style="margin-bottom: 32px;">
        <h2 style="color: #1e293b; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.1em; color: #ef4444;">🚨 Urgent Action Required</h2>
        ${renderAssignmentCards(critical, riskStyles, appUrl)}
    </div>
    ` : ""}

    <!-- High Section -->
    ${high.length > 0 ? `
    <div style="margin-bottom: 32px;">
        <h2 style="color: #1e293b; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.1em; color: #f97316;">🔥 High Priority</h2>
        ${renderAssignmentCards(high, riskStyles, appUrl)}
    </div>
    ` : ""}

    <!-- Others Section -->
    ${others.length > 0 ? `
    <div style="margin-bottom: 32px;">
        <h2 style="color: #64748b; font-size: 14px; font-weight: 800; text-transform: uppercase; margin: 0 0 16px 0; letter-spacing: 0.1em;">🛡️ Active Monitoring</h2>
        ${renderAssignmentCards(others, riskStyles, appUrl)}
    </div>
    ` : ""}

    <!-- CTA -->
    <div style="text-align: center; margin: 48px 0;">
        <a href="${appUrl}/vulnerabilities?assigneeId=me" style="background-color: #0f172a; color: #ffffff; padding: 18px 36px; border-radius: 12px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; letter-spacing: 0.02em; border: 1px solid #1e293b; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
            OPEN COMMAND CENTRE
        </a>
    </div>

    <div style="margin-top: 48px; padding-top: 32px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8; text-align: center; line-height: 1.8;">
        <p style="margin: 0 0 8px 0;">This is a recurring weekly summary of your security assignments.</p>
        <p style="margin: 0; font-style: italic;">Remediate &copy; High-Fidelity Security Orchestration</p>
    </div>
    `;

    return renderEmailLayout({
        title: "Weekly Assignment Summary",
        preheader: `Status Alert: You have ${totalCount} active items requiring attention.`,
        contentHtml
    });
}

function renderAssignmentCards(items: AssignmentItem[], styles: any, appUrl: string) {
    return items.map(item => {
        const style = styles[item.risk] || styles.None;
        const vulnUrl = `${appUrl}/vulnerabilities?id=${item.id}`;
        
        return `
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div style="font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.4; margin-right: 12px;">${item.name}</div>
                <div style="background: ${style.bg}; border: 1px solid ${style.border}; padding: 4px 10px; border-radius: 20px; color: ${style.text}; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">
                    ${item.risk}
                </div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 16px;">
                 <div style="display: inline-block; font-size: 12px; color: #64748b; font-family: ui-monospace, monospace; background-color: #f8fafc; padding: 4px 10px; border-radius: 8px;">
                    ${item.host}${item.port !== '0' && item.port !== '' ? ':' + item.port : ''}
                </div>
                <div style="display: inline-block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; padding: 4px 0;">
                    ${item.status}
                </div>
            </div>
            <a href="${vulnUrl}" style="color: #2563eb; font-size: 13px; font-weight: 700; text-decoration: none;">View Detail &rarr;</a>
        </div>
        `;
    }).join("");
}
