import { prisma } from "@/lib/prisma";
import { renderThreatEmail } from "./email-template";
import { sendEmail } from "../email";
import { getReportConfig } from "../reports";
import { Risk } from "@prisma/client";

/**
 * Aggregates threats from the last 24 hours.
 */
export async function aggregateThreats(since?: Date) {
    const startTime = since || new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    return prisma.threatVulnerability.findMany({
        where: {
            publishedAt: { gte: startTime }
        },
        orderBy: { cvssScore: 'desc' }
    });
}

/**
 * Dispatches personalized daily digests to all subscribed users.
 */
export async function dispatchDailyDigests() {
    console.log("Starting daily threat digest dispatch...");
    
    const settings = await getReportConfig(true);
    if (!settings || !settings.enabled) {
        console.warn("Email settings not configured or disabled. Skipping dispatch.");
        return;
    }

    const subscribers = await prisma.threatSubscription.findMany({
        where: { isSubscribed: true },
        include: { user: true }
    });

    if (subscribers.length === 0) {
        console.log("No subscribers found for daily digest.");
        return;
    }

    const allThreats = await aggregateThreats();
    if (allThreats.length === 0) {
        console.log("No new threats to report in the last 24 hours.");
        return;
    }

    for (const sub of subscribers) {
        try {
            const filtered = filterThreatsForUser(allThreats, sub);
            
            if (filtered.cisaKev.length === 0 && filtered.criticalHigh.length === 0 && filtered.standard.length === 0) {
                continue;
            }

            const html = renderThreatEmail(filtered);
            const text = `Daily Threat intelligence Summary: Found ${filtered.cisaKev.length + filtered.criticalHigh.length + filtered.standard.length} items.`;
            
            await sendEmail(
                settings as any, // Cast to any to handle type mismatch if necessary
                sub.user.email,
                "Daily Threat Intelligence Digest",
                html,
                text
            );
            
            console.log(`✓ Sent digest to ${sub.user.email}`);
        } catch (err) {
            console.error(`Failed to send digest to ${sub.user.email}:`, err);
        }
    }
}

function filterThreatsForUser(threats: any[], sub: any) {
    const cisaKev: any[] = [];
    const criticalHigh: any[] = [];
    const standard: any[] = [];

    const minRiskValue = riskToValue(sub.minRisk);

    for (const t of threats) {
        const risk = scoreToRisk(t.cvssScore);
        const riskValue = riskToValue(risk);

        // 1. CISA KEV (Always include if user didn't explicitly say only KEV and it's not KEV)
        if (t.cisaKevStatus) {
            cisaKev.push(t);
            continue;
        }

        if (sub.cisaKevOnly) continue;

        // 2. Risk threshold
        if (riskValue < minRiskValue) continue;

        if (risk === Risk.Critical || risk === Risk.High) {
            criticalHigh.push(t);
        } else {
            standard.push(t);
        }
    }

    return { cisaKev, criticalHigh, standard };
}

function riskToValue(risk: Risk): number {
    switch (risk) {
        case Risk.Critical: return 4;
        case Risk.High: return 3;
        case Risk.Medium: return 2;
        case Risk.Low: return 1;
        case Risk.None: return 0;
        default: return 0;
    }
}

function scoreToRisk(score?: number | null): Risk {
    if (score === null || score === undefined) return Risk.None;
    if (score >= 9.0) return Risk.Critical;
    if (score >= 7.0) return Risk.High;
    if (score >= 4.0) return Risk.Medium;
    if (score >= 0.1) return Risk.Low;
    return Risk.None;
}
