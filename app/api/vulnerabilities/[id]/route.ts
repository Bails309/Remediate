import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { sendEmail, renderEmailLayout } from "@/lib/email";
import { getReportConfig } from "@/lib/reports";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await (prisma.user as unknown as { findUnique: (a: unknown) => Promise<{ id: string, roles: string[] } | null> }).findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = (user?.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<{ assigneeId: string | null, collaborators: { id: string }[] } | null> }).findUnique({
        where: { id: vulnerabilityId },
        include: { collaborators: { select: { id: true } } },
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAssignee = vulnerability.assigneeId === user.id;

    if (!isAdmin && !isAssignee) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { askForHelp, collaboratorIds } = await req.json();

    const updateData: any = {};
    if (typeof askForHelp === 'boolean') {
        updateData.askForHelp = askForHelp;
    }

    if (Array.isArray(collaboratorIds)) {
        updateData.collaborators = {
            set: collaboratorIds.map((id: string) => ({ id })),
        };
    }

    const updated = await (prisma.vulnerability as unknown as {
        update: (a: unknown) => Promise<{
            id: string,
            name: string,
            host: string,
            port: string | null,
            risk: string,
            collaborators: { id: string, name: string | null, email: string | null }[]
        }>
    }).update({
        where: { id: vulnerabilityId },
        data: updateData,
        include: {
            collaborators: { select: { id: true, name: true, email: true } },
        },
    });

    const config = await getReportConfig(true);

    // Send emails to new collaborators
    if (config?.enabled && Array.isArray(collaboratorIds) && collaboratorIds.length > 0) {
        const existingCollaboratorIds = (vulnerability?.collaborators as { id: string }[] || []).map((c) => c.id);
        const newCollaboratorIds = collaboratorIds.filter((id: string) => !existingCollaboratorIds.includes(id));

        const newCollaborators = updated.collaborators.filter(c => newCollaboratorIds.includes(c.id));

        for (const collab of newCollaborators) {
            try {
                // Skip if current user
                if (collab.email === session.user.email) continue;

                const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
                const vulnUrl = `${appUrl}/vulnerabilities?id=${vulnerabilityId}`;

                // v2 Ultra Modern Design Tokens
                const riskStyles = {
                    Critical: { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
                    High: { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
                    Medium: { bg: "rgba(249, 115, 22, 0.08)", text: "#f97316", border: "rgba(249, 115, 22, 0.2)" },
                    Low: { bg: "rgba(59, 130, 246, 0.08)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.2)" },
                    None: { bg: "rgba(100, 116, 139, 0.08)", text: "#64748b", border: "rgba(100, 116, 139, 0.2)" },
                };

                const style = riskStyles[updated.risk as keyof typeof riskStyles] || riskStyles.None;

                const subject = `[Remediate] Collaboration Requested: ${updated.name}`;
                const text = `Hello ${collab.name || "there"},\n\n${session.user.name || session.user.email} has invited you to collaborate on a vulnerability finding: ${updated.name} (Risk: ${updated.risk}).\n\nYou can view the details here: ${vulnUrl}\n\nRegards,\nThe Remediate Team`;

                const html = renderEmailLayout({
                    title: "Collaboration Requested",
                    preheader: `${session.user.name || session.user.email} has invited you to collaborate.`,
                    contentHtml: `
                        <h1 style="color: #0f172a; font-size: 26px; font-weight: 800; margin: 0 0 16px 0; letter-spacing: -0.025em; line-height: 1.2;">Collaboration Requested</h1>
                        <p style="color: #475569; font-size: 16px; font-weight: 400; line-height: 1.6; margin: 0 0 32px 0;">
                            Hello <span style="font-weight: 600; color: #0f172a;">${collab.name || "there"}</span>, <span style="font-weight: 600; color: #0f172a;">${session.user.name || session.user.email}</span> has invited you to collaborate on a mission-critical finding.
                        </p>

                        <!-- Premium Findings Card -->
                        <div style="background-color: #ffffff; border: 1px solid #eef2f6; border-radius: 16px; padding: 28px; margin-bottom: 40px; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.02);">
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="padding-bottom: 20px;">
                                        <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td>
                                                    <div style="text-transform: uppercase; font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.1em;">Finding Overview</div>
                                                </td>
                                                <td align="right">
                                                    <div style="display: inline-block; background-color: ${style.bg}; color: ${style.text}; border: 1px solid ${style.border}; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                                                        ${updated.risk}
                                                    </div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td>
                                        <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 10px 0; line-height: 1.4;">${updated.name}</div>
                                        <div style="font-size: 14px; color: #64748b; font-family: 'JetBrains Mono', 'Fira Code', monospace;">${updated.host}<span style="opacity: 0.5;">${(updated.port && updated.port !== "0") ? ":" + updated.port : ""}</span></div>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <!-- Call to Action -->
                        <div align="center">
                            <a href="${vulnUrl}" style="background-color: #2563eb; background-image: linear-gradient(to bottom, #3b82f6, #2563eb); color: #ffffff; display: inline-block; font-size: 16px; font-weight: 700; line-height: 56px; text-align: center; text-decoration: none; width: 240px; border-radius: 14px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">View Finding</a>
                        </div>
                    `
                });

                if (collab.email) {
                    await sendEmail(config, collab.email, subject, html, text);
                }
            } catch (error) {
                console.error("Failed to send collaboration email:", error);
            }
        }
    }

    return NextResponse.json(updated);
}

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<unknown> }).findUnique({
        where: { id: vulnerabilityId },
        include: {
            assignee: { select: { id: true, name: true } },
            collaborators: { select: { id: true, name: true } },
            site: true,
        }
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(vulnerability);
}
