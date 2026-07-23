import { prisma } from "./prisma";
import { getReportConfig } from "./reports";
import { sendEmail } from "./email";
import { renderWeeklyAssignmentEmail, renderLeaderGroupDigest, AssignmentItem, LeaderGroupAssignmentItem } from "./assignment-email";
// Using internal types to bypass environment-specific Prisma export issues while maintaining lint compliance
type VulnerabilityStatusLabel = "Open" | "InProgress" | "InProgressWithCR" | "Remediated" | "FalsePositive" | "NoFixAvailable" | "Sunset" | "AwaitingVendor";
const VulnerabilityStatus = {
    Open: "Open" as VulnerabilityStatusLabel,
    InProgress: "InProgress" as VulnerabilityStatusLabel,
    InProgressWithCR: "InProgressWithCR" as VulnerabilityStatusLabel,
    AwaitingVendor: "AwaitingVendor" as VulnerabilityStatusLabel,
};

export async function dispatchWeeklyAssignmentEmails() {
    console.log("[WeeklyAssignments] Starting dispatch process...");
    
    const config = await getReportConfig(true);
    if (!config || !config.enabled) {
        console.log("[WeeklyAssignments] Report config disabled, skipping.");
        return;
    }

    // 1. Get all users with at least one active assignment
    // We only include the primary assignee
    const users = await prisma.user.findMany({
        where: {
            vulnerabilities: { some: { status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR, VulnerabilityStatus.AwaitingVendor] } } }
        },
        include: {
            vulnerabilities: {
                where: { status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR, VulnerabilityStatus.AwaitingVendor] } }
            }
        }
    });

    console.log(`[WeeklyAssignments] Found ${users.length} users with active assignments.`);

    for (const user of users) {
        if (!user.email) continue;

        const assignments: AssignmentItem[] = (user.vulnerabilities as unknown as AssignmentItem[]).map((v: AssignmentItem) => ({
            id: v.id,
            name: v.name,
            risk: v.risk,
            host: v.host,
            port: v.port,
            status: v.status
        }));

        if (assignments.length === 0) continue;

        const appUrl = process.env.NEXTAUTH_URL;
        if (!appUrl) {
            console.warn("[WeeklyAssignments] NEXTAUTH_URL not set, skipping email send");
            continue;
        }

        const subject = `[Remediate] Weekly Assignment Summary: ${assignments.length} items`;
        const html = renderWeeklyAssignmentEmail(user, assignments);
        const text = `Hello ${user.name},\n\nYou have ${assignments.length} active security assignments requiring your attention.\n\nView details at: ${appUrl}/vulnerabilities?assigneeId=me`;

        try {
            await sendEmail(config, user.email, subject, html, text);
            console.log(`[WeeklyAssignments] Sent summary to ${user.email} (${assignments.length} items)`);
            
            // Update last sent timestamp
            await prisma.user.update({
                where: { id: user.id },
                data: { lastWeeklyAssignmentReportAt: new Date() }
            });
        } catch (err) {
            console.error(`[WeeklyAssignments] Failed to send to ${user.email}:`, err);
        }
    }

    // 2. Group leader digests: any user who is a leader of one or more groups
    //    receives an additional email per group with all active items the group owns.
    try {
        const leaderMemberships = await (prisma as unknown as {
            groupMembership: {
                findMany: (a: unknown) => Promise<Array<{
                    userId: string;
                    groupId: string;
                    user: { id: string; name: string | null; email: string | null };
                    group: { id: string; name: string };
                }>>;
            };
        }).groupMembership.findMany({
            where: { role: "leader" },
            include: {
                user: { select: { id: true, name: true, email: true } },
                group: { select: { id: true, name: true } },
            },
        });

        const appUrl = process.env.NEXTAUTH_URL;
        if (!appUrl) {
            console.warn("[WeeklyAssignments] NEXTAUTH_URL not set, skipping leader digests");
        } else {
            for (const m of leaderMemberships) {
                if (!m.user.email) continue;
                const items = await (prisma as unknown as {
                    vulnerability: {
                        findMany: (a: unknown) => Promise<Array<{
                            id: string;
                            name: string;
                            risk: string;
                            host: string;
                            port: string;
                            status: string;
                            assignee: { name: string | null } | null;
                        }>>;
                    };
                }).vulnerability.findMany({
                    where: {
                        groupId: m.groupId,
                        status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR, VulnerabilityStatus.AwaitingVendor] },
                    },
                    select: {
                        id: true,
                        name: true,
                        risk: true,
                        host: true,
                        port: true,
                        status: true,
                        assignee: { select: { name: true } },
                    },
                });

                if (items.length === 0) continue;

                const cards: LeaderGroupAssignmentItem[] = items.map((v) => ({
                    id: v.id,
                    name: v.name,
                    risk: v.risk as AssignmentItem["risk"],
                    host: v.host,
                    port: v.port,
                    status: v.status,
                    assigneeName: v.assignee?.name ?? null,
                }));

                const subject = `[Remediate] ${m.group.name} Leader Digest: ${cards.length} active items`;
                const html = renderLeaderGroupDigest({ name: m.user.name ?? m.user.email }, m.group, cards);
                const text = `Hello ${m.user.name ?? m.user.email},\n\nYour group '${m.group.name}' has ${cards.length} active security items.\n\nView the queue: ${appUrl}/vulnerabilities?groupIds=${m.groupId}`;

                try {
                    await sendEmail(config, m.user.email, subject, html, text);
                    console.log(`[WeeklyAssignments] Sent leader digest for ${m.group.name} to ${m.user.email} (${cards.length} items)`);
                } catch (err) {
                    console.error(`[WeeklyAssignments] Failed to send leader digest to ${m.user.email}:`, err);
                }
            }
        }
    } catch (err) {
        console.error("[WeeklyAssignments] Leader digest pass failed:", err);
    }

    console.log("[WeeklyAssignments] Dispatch process complete.");
}
