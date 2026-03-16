import { prisma } from "@/lib/prisma";
import { renderThreatEmail, ThreatGroup, ThreatItem } from "./email-template";
import { sendEmail } from "../email";
import { getReportConfig } from "@/lib/reports";



interface ThreatSubscription {
    id: string;
    isSubscribed: boolean;
    minRisk: string;
    cisaKevOnly: boolean;
}

interface DispatcherUser {
    email: string;
    threatSubscription: ThreatSubscription | null;
}

interface DBThreat {
    osvId: string;
    cveId: string | null;
    summary: string;
    cvssScore: number | null;
    cisaKevStatus: boolean;
}

/**
 * Dispatches daily threat intelligence digest emails to a specific user.
 */
export async function dispatchDailyThreatDigest(user: DispatcherUser) {
    console.log(`Dispatcher: Starting threat digest cycle for ${user.email}...`);

    try {
        const sub = user.threatSubscription;
        if (!sub || !sub.isSubscribed) {
            console.log(`Dispatcher: User ${user.email} not subscribed. Skipping.`);
            return;
        }

        // 1. Get threats from the last 24 hours (using syncedAt)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const newThreats = await prisma.threatVulnerability.findMany({
            where: {
                syncedAt: {
                    gte: twentyFourHoursAgo
                },
                // Apply user risk preferences
                cvssScore: sub.minRisk === "Critical" ? { gte: 9.0 } : 
                           sub.minRisk === "High" ? { gte: 7.0 } : 
                           sub.minRisk === "Medium" ? { gte: 4.0 } : undefined,
                cisaKevStatus: sub.cisaKevOnly ? true : undefined
            },
            orderBy: {
                cvssScore: "desc"
            }
        }) as DBThreat[];

        if (newThreats.length === 0) {
            console.log(`Dispatcher: No new threats for ${user.email} since ${twentyFourHoursAgo.toISOString()}. Skipping email.`);
            return;
        }

        // 2. Group threats for the digest
        const threatGroup: ThreatGroup = {
            cisaKev: [],
            criticalHigh: [],
            standard: []
        };

        newThreats.forEach((t: DBThreat) => {
            const item: ThreatItem = {
                osvId: t.osvId,
                cveId: t.cveId,
                summary: t.summary,
                cvssScore: t.cvssScore,
                cisaKevStatus: t.cisaKevStatus
            };

            if (item.cisaKevStatus) {
                threatGroup.cisaKev.push(item);
            } else if (t.cvssScore && t.cvssScore >= 7.0) {
                threatGroup.criticalHigh.push(item);
            } else {
                threatGroup.standard.push(item);
            }
        });

        // 3. Send email to user
        const settings = await getReportConfig(true);
        if (!settings) {
            console.log("Dispatcher: No report SMTP settings configured; skipping email dispatch.");
            return;
        }

        const emailHtml = renderThreatEmail(threatGroup);
        const totalCount = threatGroup.cisaKev.length + threatGroup.criticalHigh.length + threatGroup.standard.length;

        await sendEmail(settings, user.email, `Daily Threat Intelligence: ${totalCount} Found`, emailHtml, "");

        // 4. Update lastSentAt for the subscription
        await prisma.threatSubscription.update({
            where: { id: sub.id },
            data: { lastSentAt: new Date() }
        });

        console.log(`Dispatcher: Sent digest to ${user.email}.`);

    } catch (error) {
        console.error(`Dispatcher: Failed to send digest to ${user.email}:`, error);
    }
}
