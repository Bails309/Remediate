import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await (prisma.user as any).findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true } as any
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = (user as any).roles.some((role: any) =>
        WEB_APP_ADMIN_ROLES.includes(role as any)
    );

    const vulnerability = await prisma.vulnerability.findUnique({
        where: { id: vulnerabilityId },
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
    if (typeof askForHelp === "boolean") {
        updateData.askForHelp = askForHelp;
    }
    if (Array.isArray(collaboratorIds)) {
        updateData.collaborators = {
            set: collaboratorIds.map((id: string) => ({ id })),
        };
    }

    const updated = await (prisma.vulnerability as any).update({
        where: { id: vulnerabilityId },
        data: updateData,
        include: {
            collaborators: { select: { id: true, name: true } },
        } as any
    });

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

    const vulnerability = await (prisma.vulnerability as any).findUnique({
        where: { id: vulnerabilityId },
        include: {
            assignee: { select: { id: true, name: true } },
            collaborators: { select: { id: true, name: true } },
            site: true,
        } as any
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(vulnerability);
}
