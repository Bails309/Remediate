import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WEB_APP_ADMIN_ROLES } from "@/lib/rbac";
import {
    getGroupContext,
    canViewVulnerability,
    isLeaderOf,
    isMemberOf,
} from "@/lib/group-rbac";
import { z } from "zod";

const commentSchema = z.object({
    content: z.string().min(1).max(10000),
    isPrivate: z.boolean().optional(),
});

const patchCommentSchema = z.object({
    commentId: z.string().uuid(),
    content: z.string().min(1).max(10000),
});

const deleteCommentSchema = z.object({
    commentId: z.string().uuid(),
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

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<{ askForHelp: boolean, collaborators: { id: string }[], assigneeId: string | null, groupId: string | null } | null> }).findUnique({
        where: { id: vulnerabilityId },
        include: {
            collaborators: { select: { id: true } },
        },
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const ctx = await getGroupContext(user.id);
    if (!canViewVulnerability(isAdmin, ctx, vulnerability)) {
        // Don't leak existence to non-members of the assigned group.
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isCollaborator = ((vulnerability.collaborators as { id: string }[]) || []).some((c) => c.id === user.id);
    const isAssignee = vulnerability.assigneeId === user.id;
    const isLeader = isLeaderOf(ctx, vulnerability.groupId);

    // Visibility Rules:
    // 1. Admins and group leaders see all comments.
    // 2. If 'askForHelp' is true, collaborators and assignee see all comments.
    // 3. Otherwise, users only see comments they authored (plus any non-private ones).
    const seesAll = isAdmin || isLeader || (vulnerability?.askForHelp && (isCollaborator || isAssignee));

    const comments = await (prisma as unknown as { comment: { findMany: (a: unknown) => Promise<unknown[]> } }).comment.findMany({
        where: {
            vulnerabilityId,
            OR: seesAll
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

    const vulnerability = await (prisma.vulnerability as unknown as { findUnique: (a: unknown) => Promise<{ askForHelp: boolean, collaborators: { id: string }[], assigneeId: string | null, groupId: string | null } | null> }).findUnique({
        where: { id: vulnerabilityId },
        include: { collaborators: { select: { id: true } } }
    });

    if (!vulnerability) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }

    const isAdmin = (user?.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );
    const ctx = await getGroupContext(user.id);
    if (!canViewVulnerability(isAdmin, ctx, vulnerability)) {
        return NextResponse.json({ error: "Vulnerability not found" }, { status: 404 });
    }
    const isCollaborator = (vulnerability?.collaborators as { id: string }[] || []).some((c) => c.id === user?.id);
    const isAssignee = vulnerability?.assigneeId === user?.id;
    const isLeader = isLeaderOf(ctx, vulnerability.groupId);
    const isGroupMember = isMemberOf(ctx, vulnerability.groupId);

    // Admin, Assignee, Leader, Collaborator (if askForHelp), or any group member
    // (if askForHelp on a group-owned item) can comment.
    const canComment =
        isAdmin
        || isAssignee
        || isLeader
        || (vulnerability?.askForHelp && isCollaborator)
        || (vulnerability?.askForHelp && isGroupMember);

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

    const body = await req.json();
    const parsed = patchCommentSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { commentId, content } = parsed.data;

    const existing = await (prisma as unknown as { comment: { findUnique: (a: unknown) => Promise<{ id: string; authorId: string; vulnerabilityId: string } | null> } }).comment.findUnique({
        where: { id: commentId },
    });

    if (!existing || existing.vulnerabilityId !== vulnerabilityId) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAdmin = (user.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );
    const isAuthor = existing.authorId === user.id;

    if (!isAdmin && !isAuthor) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await (prisma as unknown as { comment: { update: (a: unknown) => Promise<unknown> } }).comment.update({
        where: { id: commentId },
        data: { content },
        include: {
            author: {
                select: { name: true, email: true }
            }
        }
    });

    return NextResponse.json(updated);
}

export async function DELETE(
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
    const parsed = deleteCommentSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }
    const { commentId } = parsed.data;

    const existing = await (prisma as unknown as { comment: { findUnique: (a: unknown) => Promise<{ id: string; authorId: string; vulnerabilityId: string } | null> } }).comment.findUnique({
        where: { id: commentId },
    });

    if (!existing || existing.vulnerabilityId !== vulnerabilityId) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAdmin = (user.roles as string[] || []).some((role) =>
        (WEB_APP_ADMIN_ROLES as readonly string[]).includes(role)
    );
    const isAuthor = existing.authorId === user.id;

    if (!isAdmin && !isAuthor) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await (prisma as unknown as { comment: { delete: (a: unknown) => Promise<unknown> } }).comment.delete({
        where: { id: commentId },
    });

    return NextResponse.json({ ok: true });
}
