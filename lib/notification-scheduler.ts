import { prisma } from "@/lib/prisma";
import { getReportConfig } from "@/lib/reports";
import { sendEmail, renderEmailLayout } from "@/lib/email";

type AssignmentNotificationRecord = {
    id: string;
    userId: string;
    user?: { name?: string; email?: string };
    vulnerability: { id: string; name?: string; risk?: string; host?: string; port?: string };
};

const NOTIFICATION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startNotificationScheduler() {
    setInterval(async () => {
        try {
            const config = await getReportConfig(true);
            if (!config || !config.enabled) return;

            const pending = await prisma.assignmentNotification.findMany({
                where: { sentAt: null },
                include: {
                    vulnerability: true,
                    user: true,
                },
                orderBy: { createdAt: 'asc' },
            });

            if (pending.length === 0) return;

            // Group by user
            const userNotifications = pending.reduce((acc, n: AssignmentNotificationRecord) => {
                if (!acc[n.userId]) {
                    acc[n.userId] = {
                        user: n.user,
                        notifications: [] as AssignmentNotificationRecord[],
                    };
                }
                acc[n.userId].notifications.push(n as AssignmentNotificationRecord);
                return acc;
            }, {} as Record<string, { user?: { name?: string; email?: string }; notifications: AssignmentNotificationRecord[] }>);

            for (const userId in userNotifications) {
                const { user, notifications } = userNotifications[userId];
                const uniqueVulnsDict: Record<string, { id: string; name?: string; risk?: string; host?: string; port?: string }> = {};
                notifications.forEach((n: AssignmentNotificationRecord) => {
                    uniqueVulnsDict[n.vulnerability.id] = n.vulnerability;
                });
                const uniqueVulns = Object.values(uniqueVulnsDict);

                const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
                const subject = `[Remediate] ${uniqueVulns.length} New Finding Assignment(s)`;

                const riskStyles = {
                    Critical: { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
                    High: { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
                    Medium: { bg: "rgba(249, 115, 22, 0.08)", text: "#f97316", border: "rgba(249, 115, 22, 0.2)" },
                    Low: { bg: "rgba(59, 130, 246, 0.08)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.2)" },
                    None: { bg: "rgba(100, 116, 139, 0.08)", text: "#64748b", border: "rgba(100, 116, 139, 0.2)" },
                };

                const html = renderEmailLayout({
                    title: "New Assignments",
                    preheader: `You have ${uniqueVulns.length} new mission-critical findings assigned.`,
                    contentHtml: `
            <h1 style="color: #0f172a; font-size: 28px; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.03em; line-height: 1.1;">Security Briefing</h1>
            <p style="color: #475569; font-size: 16px; font-weight: 400; line-height: 1.6; margin: 0 0 32px 0;">
                Hello <span style="font-weight: 600; color: #0f172a;">${user?.name ?? "there"}</span>, you have been designated as a collaborator or primary owner for <span style="font-weight: 700; color: #2563eb;">${uniqueVulns.length}</span> new finding(s).
            </p>

            <div style="text-transform: uppercase; font-size: 11px; font-weight: 800; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 16px;">Assigned Findings</div>

            ${uniqueVulns.map(v => {
                        const style = riskStyles[v.risk as keyof typeof riskStyles] || riskStyles.None;
                        const vulnUrl = `${appUrl}/vulnerabilities?id=${v.id}`;
                        return `
                <div style="background-color: #ffffff; border: 1px solid #f1f5f9; border-radius: 20px; padding: 24px; margin-bottom: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                            <td style="padding-bottom: 12px;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                    <tr>
                                        <td>
                                            <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3;">${v.name}</div>
                                        </td>
                                        <td align="right" valign="top" style="padding-left: 12px;">
                                            <div style="display: inline-block; background-color: ${style.bg}; color: ${style.text}; border: 1px solid ${style.border}; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap;">
                                                ${v.risk}
                                            </div>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <div style="display: inline-block; font-size: 13px; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; background-color: #f8fafc; padding: 4px 10px; border-radius: 8px;">
                                    ${v.host}${v.port !== '0' && v.port !== '' ? ':' + v.port : ''}
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding-top: 24px;">
                                <a href="${vulnUrl}" style="background-color: #ffffff; border: 1px solid #e2e8f0; color: #0f172a; display: inline-block; font-size: 13px; font-weight: 700; line-height: 40px; text-align: center; text-decoration: none; width: 140px; border-radius: 10px; transition: all 0.2s ease;">Investigate &rarr;</a>
                            </td>
                        </tr>
                    </table>
                </div>
              `;
                    }).join("")}

            <div align="center" style="margin-top: 40px; padding-top: 32px; border-top: 1px solid #f1f5f9;">
                <a href="${appUrl}/vulnerabilities" style="background-color: #0f172a; color: #ffffff; display: inline-block; font-size: 15px; font-weight: 700; line-height: 56px; text-align: center; text-decoration: none; width: 240px; border-radius: 14px; box-shadow: 0 10px 15px -3px rgba(15, 23, 42, 0.3);">Access Command Center</a>
            </div>
          `
                });

                const text = `Hello ${user?.name ?? "there"},\n\nYou have ${uniqueVulns.length} new finding assignments:\n\n${uniqueVulns.map(v => `- ${v.name} (${v.risk}) - ${v.host}`).join("\n")}\n\nView details: ${appUrl}/vulnerabilities`;

                if (user?.email) {
                    await sendEmail(config, user.email, subject, html, text);

                    // Mark as sent
                    await prisma.assignmentNotification.updateMany({
                        where: {
                            id: { in: notifications.map(n => n.id) }
                        },
                        data: { sentAt: new Date() }
                    });
                }
            }
        } catch (err) {
            console.error("Assignment notification scheduler failed:", err);
        }
    }, NOTIFICATION_INTERVAL_MS);
}
