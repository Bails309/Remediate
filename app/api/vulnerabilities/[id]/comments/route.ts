import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";

export async function GET(
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
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = (user as any).roles.some((role: any) =>
        WEB_APP_ADMIN_ROLES.includes(role as any)
    );

    const vulnerability = await (prisma.vulnerability as any).findUnique({
        where: { id: vulnerabilityId },
        include: {
            collaborators: { select: { id: true } },
        },
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isCollaborator = (vulnerability as any).collaborators.some((c: any) => c.id === user.id);
    const isAssignee = (vulnerability as any).assigneeId === user.id;

    // Visibility Rules:
    // 1. Admins see all comments.
    // 2. If 'askForHelp' is true, collaborators and assignee see all comments.
    // 3. Otherwise, users only see comments they authored.

    const comments = await (prisma as any).comment.findMany({
        where: {
            vulnerabilityId,
            OR: isAdmin || ((vulnerability as any).askForHelp && (isCollaborator || isAssignee))
                ? undefined
                : [
                    { authorId: user.id },
                    { isPrivate: false } // Just in case we add non-private comments later
                ],
        },
        include: {
            author: {
                select: { name: true, email: true }
            }
        },
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(comments);
}

export async function POST(
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
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { content, isPrivate = true } = await req.json();

    if (!content) {
        return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    const vulnerability = await (prisma.vulnerability as any).findUnique({
        where: { id: vulnerabilityId },
        include: { collaborators: { select: { id: true } } }
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAdmin = (user as any).roles.some((role: any) =>
        WEB_APP_ADMIN_ROLES.includes(role as any)
    );
    const isCollaborator = (vulnerability as any).collaborators.some((c: any) => c.id === user.id);
    const isAssignee = (vulnerability as any).assigneeId === user.id;

    // Only Admin, Assignee, or Collaborator (if askForHelp is true) can comment
    const canComment = isAdmin || isAssignee || ((vulnerability as any).askForHelp && isCollaborator);

    if (!canComment) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const comment = await (prisma as any).comment.create({
        data: {
            content,
            isPrivate,
            vulnerabilityId,
            authorId: user.id,
        },
        include: {
            author: {
                select: { name: true, email: true }
            }
        }
    });

    return NextResponse.json(comment);
}
