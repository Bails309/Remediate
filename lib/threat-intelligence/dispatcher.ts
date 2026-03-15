import { prisma } from "@/lib/prisma";
import { renderThreatEmail, ThreatGroup, ThreatItem } from "./email-template";
import { sendEmail } from "../email";
import { getReportConfig } from "@/lib/reports";

interface RiskBridge {
    Critical: string;
    High: string;
    Medium: string;
    Low: string;
}

const Risk: RiskBridge = {
    Critical: "Critical",
    High: "High",
    Medium: "Medium",
    Low: "Low"
};

/**
 * Dispatches daily threat intelligence digest emails to all users who have it enabled.
 */
export async function dispatchDailyThreatDigest() {
    console.log("Dispatcher: Starting daily threat digest cycle...");

    try {
        // 1. Get all users who have daily digest enabled
        const users = await prisma.user.findMany({
            where: {
                threatSubscription: { is: { isSubscribed: true } }
            }
        });

        if (users.length === 0) {
            console.log("Dispatcher: No users have daily digest enabled. Skipping cycle.");
            return;
        }

        // 2. Get today's threat items (newly seen today)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const newThreats = await prisma.vulnerability.findMany({
            where: {
                lastSeenAt: {
                    gte: startOfToday
                }
            },
            include: {
                site: true
            }
        });

        if (newThreats.length === 0) {
            console.log("Dispatcher: No new threats detected today. Skipping email dispatch.");
            return;
        }

        // 3. Group threats for the digest
        const threatGroup: ThreatGroup = {
            cisaKev: [],
            criticalHigh: [],
            standard: []
        };

        newThreats.forEach(t => {
            const item: ThreatItem = {
                osvId: t.id,
                cveId: t.cve,
                summary: t.name,
                cvssScore: t.cvssScore,
                cisaKevStatus: t.description?.includes("CISA KEV") || false
            };

            if (item.cisaKevStatus) {
                threatGroup.cisaKev.push(item);
            } else if (t.risk === Risk.Critical || t.risk === Risk.High) {
                threatGroup.criticalHigh.push(item);
            } else {
                threatGroup.standard.push(item);
            }
        });

        // 4. Send email to each user
        const settings = await getReportConfig(true);
        if (!settings) {
            console.log("Dispatcher: No report SMTP settings configured; skipping email dispatch.");
            return;
        }

        let sentCount = 0;
        for (const user of users) {
            if (!user.email) continue;

            const emailHtml = renderThreatEmail(threatGroup);

            const totalCount = threatGroup.cisaKev.length + threatGroup.criticalHigh.length + threatGroup.standard.length;

            await sendEmail(settings, user.email, `Daily Threat Intelligence: ${totalCount} Found`, emailHtml, "");
            sentCount++;
        }

        console.log(`Dispatcher: Sent digest to ${sentCount} users.`);
        console.log("Dispatcher: Dispatch cycle complete.");

    } catch (error) {
        console.error("Dispatcher: Failed to send digest:", error);
    }
}
