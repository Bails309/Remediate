import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { sendEmail } from "@/lib/email";
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

    const updateData: Record<string, unknown> = {};
    if (typeof askForHelp === "boolean") {
        updateData.askForHelp = askForHelp;
    }
    if (Array.isArray(collaboratorIds)) {
        updateData.collaborators = {
            set: collaboratorIds.map((id: string) => ({ id })),
        };
    }

    const updated = await (prisma.vulnerability as unknown as { update: (a: unknown) => Promise<{ id: string, name: string, host: string, port: string | null }> }).update({
        where: { id: vulnerabilityId },
        data: updateData,
        include: {
            collaborators: { select: { id: true, name: true } },
        }
    });

    const existingCollaboratorIds = (vulnerability?.collaborators as { id: string }[] || []).map((c) => c.id);
    const newCollaboratorIds = Array.isArray(collaboratorIds)
        ? collaboratorIds.filter((id: string) => !existingCollaboratorIds.includes(id))
        : [];

    if (newCollaboratorIds.length > 0) {
        const mailConfig = await getReportConfig();
        if (mailConfig?.enabled) {
            const newCollaborators = await prisma.user.findMany({
                where: { id: { in: newCollaboratorIds } },
                select: { email: true, name: true }
            });

            for (const collab of newCollaborators) {
                if (collab.email) {
                    const subject = `[Remediate] Collaboration Requested: ${updated.name}`;
                    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
                    const vulnUrl = `${appUrl}/vulnerabilities?id=${vulnerabilityId}`;

                    const text = `Hello ${collab.name || "Collaborator"},\n\nYou have been added as a collaborator on a vulnerability: ${updated.name}.\n\nYou can view the details and join the collaboration here: ${vulnUrl}\n\nRegards,\nThe Remediate Team`;

                    const html = `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 8px;">
                            <h2 style="color: #1a202c;">Collaboration requested</h2>
                            <p style="color: #4a5568; font-size: 16px;">
                                Hello <strong>${collab.name || "Collaborator"}</strong>,
                            </p>
                            <p style="color: #4a5568; font-size: 16px;">
                                You have been added as a collaborator on the following vulnerability:
                            </p>
                            <div style="background: #f7fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <strong style="display: block; color: #2d3748;">${updated.name}</strong>
                                <span style="font-size: 14px; color: #718096;">Host: ${updated.host}${updated.port ? ":" + updated.port : ""}</span>
                            </div>
                            <a href="${vulnUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Vulnerability</a>
                            <hr style="margin: 30px 0; border: 0; border-top: 1px solid #edf2f7;" />
                            <p style="font-size: 12px; color: #a0aec0;">
                                This is an automated notification from Remediate.
                            </p>
                        </div>
                    `;

                    try {
                        await sendEmail(mailConfig, collab.email, subject, html, text);
                    } catch (error) {
                        console.error(`Failed to send collaboration email to ${collab.email}:`, error);
                    }
                }
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
