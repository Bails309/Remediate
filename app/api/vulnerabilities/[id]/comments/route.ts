import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import { z } from "zod";

const commentSchema = z.object({
    content: z.string().min(1).max(10000),
    isPrivate: z.boolean().optional(),
});

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: vulnerabilityId } = await params;
    const session = await auth();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isAdmin = ((user.roles as string[]) || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<{ askForHelp: boolean, collaborators: { id: string }[], assigneeId: string | null } | null> }).findUnique({
        where: { id: vulnerabilityId },
        include: {
            collaborators: { select: { id: true } },
        },
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isCollaborator = ((vulnerability.collaborators as { id: string }[]) || []).some((c) => c.id === user.id);
    const isAssignee = vulnerability.assigneeId === user.id;

    // Visibility Rules:
    // 1. Admins see all comments.
    // 2. If 'askForHelp' is true, collaborators and assignee see all comments.
    // 3. Otherwise, users only see comments they authored.

    const comments = await (prisma as unknown as { comment: { findMany: (a: unknown) => Promise<unknown[]> } }).comment.findMany({
        where: {
            vulnerabilityId,
            OR: isAdmin || (vulnerability?.askForHelp && (isCollaborator || isAssignee))
                ? undefined
                : [
                    { authorId: user?.id },
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

    const user = await (prisma.user as unknown as { findUnique: (a: unknown) => Promise<{ id: string, roles: string[] } | null> }).findUnique({
        where: { email: session.user.email },
        select: { id: true, roles: true }
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = commentSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { content, isPrivate = true } = parsed.data;

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<{ askForHelp: boolean, collaborators: { id: string }[], assigneeId: string | null } | null> }).findUnique({
        where: { id: vulnerabilityId },
        include: { collaborators: { select: { id: true } } }
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAdmin = (user?.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );
    const isCollaborator = (vulnerability?.collaborators as { id: string }[] || []).some((c) => c.id === user?.id);
    const isAssignee = vulnerability?.assigneeId === user?.id;

    // Only Admin, Assignee, or Collaborator (if askForHelp is true) can comment
    const canComment = isAdmin || isAssignee || (vulnerability?.askForHelp && isCollaborator);

    if (!canComment) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const comment = await (prisma as unknown as { comment: { create: (a: unknown) => Promise<unknown> } }).comment.create({
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
