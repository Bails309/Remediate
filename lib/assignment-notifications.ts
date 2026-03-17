import { prisma } from "./prisma";
import { getReportConfig } from "./reports";
import { sendEmail } from "./email";
import { renderWeeklyAssignmentEmail, AssignmentItem } from "./assignment-email";
// Using internal types to bypass environment-specific Prisma export issues while maintaining lint compliance
type VulnerabilityStatusLabel = "Open" | "InProgress" | "InProgressWithCR" | "Remediated" | "FalsePositive" | "NoFixAvailable";
const VulnerabilityStatus = {
    Open: "Open" as VulnerabilityStatusLabel,
    InProgress: "InProgress" as VulnerabilityStatusLabel,
    InProgressWithCR: "InProgressWithCR" as VulnerabilityStatusLabel
};

export async function dispatchWeeklyAssignmentEmails() {
    console.log("[WeeklyAssignments] Starting dispatch process...");
    
    const config = await getReportConfig(true);
    if (!config || !config.enabled) {
        console.log("[WeeklyAssignments] Report config disabled, skipping.");
        return;
    }

    // 1. Get all users with at least one active assignment
    // We include both primary assignee and collaborators
    const users = await prisma.user.findMany({
        where: {
            OR: [
                { vulnerabilities: { some: { status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR] } } } },
                { collaboratingVulnerabilities: { some: { status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR] } } } }
            ]
        },
        include: {
            vulnerabilities: {
                where: { status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR] } }
            },
            collaboratingVulnerabilities: {
                where: { status: { in: [VulnerabilityStatus.Open, VulnerabilityStatus.InProgress, VulnerabilityStatus.InProgressWithCR] } }
            }
        }
    });

    console.log(`[WeeklyAssignments] Found ${users.length} users with active assignments.`);

    for (const user of users) {
        if (!user.email) continue;

        // Combine primary and collaborative vulnerabilities, ensuring uniqueness
        const vulnMap = new Map<string, AssignmentItem>();
        
        user.vulnerabilities.forEach((v) => vulnMap.set(v.id, v as unknown as AssignmentItem));
        user.collaboratingVulnerabilities.forEach((v) => vulnMap.set(v.id, v as unknown as AssignmentItem));
        
        const assignments: AssignmentItem[] = Array.from(vulnMap.values()).map((v: AssignmentItem) => ({
            id: v.id,
            name: v.name,
            risk: v.risk,
            host: v.host,
            port: v.port,
            status: v.status
        }));

        if (assignments.length === 0) continue;

        const subject = `[Remediate] Weekly Assignment Summary: ${assignments.length} items`;
        const html = renderWeeklyAssignmentEmail(user, assignments);
        const text = `Hello ${user.name},\n\nYou have ${assignments.length} active security assignments requiring your attention.\n\nView details at: ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/vulnerabilities?assigneeId=me`;

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
    
    console.log("[WeeklyAssignments] Dispatch process complete.");
}
