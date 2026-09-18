import { prisma } from "@/lib/prisma";
import { renderThreatEmail, ThreatGroup, ThreatItem } from "./email-template";
import { sendEmail } from "../email";
import { getReportConfig } from "@/lib/reports";
import { getEnvironmentFootprint, filterThreatsForEnvironment } from "./environment-matcher";

interface ThreatSubscription {
    id: string;
    isSubscribed: boolean;
    globalDigestEnabled?: boolean;
    environmentDigestEnabled?: boolean;
    minRisk: string;
    cisaKevOnly: boolean;
    lastSentGlobalAt?: Date | null;
    lastSentEnvironmentAt?: Date | null;
}

interface DispatcherUser {
    email: string;
    threatSubscription: ThreatSubscription | null;
}

interface DBThreat {
    osvId: string;
    cveId: string | null;
    summary: string;
    details?: string | null;
    cvssScore: number | null;
    cisaKevStatus: boolean;
    affectedPackages?: unknown;
}

/**
 * Dispatches daily threat intelligence digest emails to a specific user.
 * Supports dual-feed dispatch:
 *   1. Environment-tailored digest (matched against active & historical CSV, PDF, ACR assets)
 *   2. Global threat horizon digest
 * When both options are selected, dispatches two separate emails.
 */
export async function dispatchDailyThreatDigest(user: DispatcherUser) {
    console.log(`Dispatcher: Starting threat digest cycle for ${user.email}...`);

    try {
        const sub = user.threatSubscription;
        if (!sub) {
            console.log(`Dispatcher: User ${user.email} not subscribed. Skipping.`);
            return;
        }

        const isGlobalEnabled = sub.globalDigestEnabled !== undefined 
            ? sub.globalDigestEnabled 
            : sub.isSubscribed;
        const isEnvEnabled = !!sub.environmentDigestEnabled;

        if (!isGlobalEnabled && !isEnvEnabled && !sub.isSubscribed) {
            console.log(`Dispatcher: User ${user.email} has all threat feeds disabled. Skipping.`);
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

        const settings = await getReportConfig(true);
        if (!settings) {
            console.log("Dispatcher: No report SMTP settings configured; skipping email dispatch.");
            return;
        }

        const updateData: {
            lastSentAt?: Date;
            lastSentGlobalAt?: Date;
            lastSentEnvironmentAt?: Date;
        } = {};

        let sentAny = false;

        // 2. Environment Threat Digest dispatch
        if (isEnvEnabled) {
            try {
                const footprint = await getEnvironmentFootprint();
                const envMatchedThreats = filterThreatsForEnvironment(newThreats, footprint);

                if (envMatchedThreats.length > 0) {
                    const envGroup: ThreatGroup = {
                        cisaKev: [],
                        criticalHigh: [],
                        standard: []
                    };

                    envMatchedThreats.forEach(t => {
                        const item: ThreatItem = {
                            osvId: t.osvId,
                            cveId: t.cveId,
                            summary: t.summary,
                            cvssScore: t.cvssScore,
                            cisaKevStatus: t.cisaKevStatus,
                            environmentMatchReason: t.environmentMatchReason
                        };

                        if (item.cisaKevStatus) {
                            envGroup.cisaKev.push(item);
                        } else if (t.cvssScore && t.cvssScore >= 7.0) {
                            envGroup.criticalHigh.push(item);
                        } else {
                            envGroup.standard.push(item);
                        }
                    });

                    const envEmailHtml = renderThreatEmail(envGroup, {
                        title: "Environment Threat Intelligence",
                        subtitle: "Tailored findings matching your active and historical assets (Nessus CSV, Pentest PDF & ACR).",
                        preheader: `Detected ${envMatchedThreats.length} threats matching your environment assets.`,
                        isEnvironmentTailored: true
                    });

                    await sendEmail(
                        settings,
                        user.email,
                        `[Environment Alert] Daily Threat Intelligence: ${envMatchedThreats.length} Relevant to Your Environment`,
                        envEmailHtml,
                        ""
                    );

                    updateData.lastSentEnvironmentAt = new Date();
                    sentAny = true;
                    console.log(`Dispatcher: Sent environment-tailored digest (${envMatchedThreats.length} issues) to ${user.email}.`);
                } else {
                    console.log(`Dispatcher: No environment-matching threats for ${user.email}. Skipping environment email.`);
                }
            } catch (envErr) {
                console.error(`Dispatcher: Failed environment correlation for ${user.email}:`, envErr);
            }
        }

        // 3. Global Threat Digest dispatch
        if (isGlobalEnabled) {
            const globalGroup: ThreatGroup = {
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
                    globalGroup.cisaKev.push(item);
                } else if (t.cvssScore && t.cvssScore >= 7.0) {
                    globalGroup.criticalHigh.push(item);
                } else {
                    globalGroup.standard.push(item);
                }
            });

            const totalCount = globalGroup.cisaKev.length + globalGroup.criticalHigh.length + globalGroup.standard.length;
            const globalEmailHtml = renderThreatEmail(globalGroup, {
                title: isEnvEnabled ? "Daily Threat Intelligence (Global Feed)" : "Daily Threat Intelligence",
                subtitle: "Aggregated security findings from the last 24 hours.",
                preheader: `Detected ${totalCount} new threats targeting your profile.`,
                isEnvironmentTailored: false
            });

            const subject = isEnvEnabled
                ? `Daily Threat Intelligence (Global Feed): ${totalCount} Found`
                : `Daily Threat Intelligence: ${totalCount} Found`;

            await sendEmail(settings, user.email, subject, globalEmailHtml, "");

            updateData.lastSentGlobalAt = new Date();
            sentAny = true;
            console.log(`Dispatcher: Sent global digest (${totalCount} issues) to ${user.email}.`);
        }

        // 4. Update lastSent timestamps
        if (sentAny) {
            updateData.lastSentAt = new Date();
            await prisma.threatSubscription.update({
                where: { id: sub.id },
                data: updateData
            });
        }

    } catch (error) {
        console.error(`Dispatcher: Failed to send digest to ${user.email}:`, error);
    }
}
