import { prisma } from "@/lib/prisma";

/**
 * Group-scoped RBAC helpers.
 *
 * Visibility / edit model (confirmed with product):
 *   - A vulnerability may have a `groupId` (the team that owns it) AND/OR an
 *     `assigneeId` (the individual working it). Both can be set independently.
 *   - When a vulnerability has a group, only that group's members + the group's
 *     leaders + site/web admins can SEE it. Group is a visibility wall, not just
 *     a filter.
 *   - Anyone may see and self-assign items with NO group (legacy behaviour).
 *   - Within a group, any member can self-assign. Only the assignee (or admins
 *     or group leaders) can edit status / CR / collaboration.
 *   - Group leaders can reassign within their group only. They cannot remove the
 *     group or hand items to a different team. They can edit status/CR for any
 *     item their group owns, even when individually assigned to a member.
 *   - Site / web-app admins bypass all group walls.
 */

export type GroupContext = {
  /** Group IDs the user is a member of (any role). */
  memberOf: string[];
  /** Group IDs where the user is a leader. */
  leaderOf: string[];
};

/** Fetch all groups a user belongs to plus the subset they lead. Cheap query, no joins. */
export async function getGroupContext(userId: string): Promise<GroupContext> {
  const rows = await prisma.groupMembership.findMany({
    where: { userId },
    select: { groupId: true, role: true },
  });
  return {
    memberOf: rows.map((r) => r.groupId),
    leaderOf: rows.filter((r) => r.role === "leader").map((r) => r.groupId),
  };
}

export function isMemberOf(ctx: GroupContext, groupId: string | null | undefined): boolean {
  if (!groupId) return false;
  return ctx.memberOf.includes(groupId);
}

export function isLeaderOf(ctx: GroupContext, groupId: string | null | undefined): boolean {
  if (!groupId) return false;
  return ctx.leaderOf.includes(groupId);
}

/**
 * Can the user SEE this vulnerability in the list?
 * - Admins: yes.
 * - No group: yes (open queue).
 * - Has group: only members & leaders of that group.
 */
export function canViewVulnerability(
  isAdmin: boolean,
  ctx: GroupContext,
  vuln: { groupId: string | null }
): boolean {
  if (isAdmin) return true;
  if (!vuln.groupId) return true;
  return isMemberOf(ctx, vuln.groupId);
}

/**
 * Can the user SELF-ASSIGN this vulnerability to themselves?
 * - Admins: yes.
 * - No group: yes (anyone can pick up unowned work).
 * - Has group: only members & leaders of that group.
 */
export function canSelfAssign(
  isAdmin: boolean,
  ctx: GroupContext,
  vuln: { groupId: string | null }
): boolean {
  return canViewVulnerability(isAdmin, ctx, vuln);
}

/**
 * Can the user EDIT this vulnerability (status, CR number, collaboration toggle)?
 * - Admins: yes.
 * - The individual assignee: yes (current behaviour).
 * - Leader of the assigned group: yes (covers items individually assigned to a member).
 */
export function canEditVulnerability(
  isAdmin: boolean,
  ctx: GroupContext,
  userId: string,
  vuln: { groupId: string | null; assigneeId: string | null }
): boolean {
  if (isAdmin) return true;
  if (vuln.assigneeId === userId) return true;
  if (isLeaderOf(ctx, vuln.groupId)) return true;
  return false;
}

/**
 * Can the user REASSIGN this vulnerability to `targetUserId`?
 * - Admins: yes (any user, any group context).
 * - Non-admins: only when targeting themselves or null (unassign).
 * - Group leaders: additionally, may assign to any member of THEIR group.
 */
export async function canReassign(
  isAdmin: boolean,
  ctx: GroupContext,
  userId: string,
  vuln: { groupId: string | null; assigneeId: string | null },
  targetUserId: string | null
): Promise<boolean> {
  if (isAdmin) return true;
  if (targetUserId === null) return true;             // unassign
  if (targetUserId === userId) {                       // self-assign
    return canSelfAssign(isAdmin, ctx, vuln);
  }
  // Leader of the assigned group can reassign within that group.
  if (vuln.groupId && isLeaderOf(ctx, vuln.groupId)) {
    const membership = await prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: vuln.groupId, userId: targetUserId } },
      select: { userId: true },
    });
    return Boolean(membership);
  }
  return false;
}

/**
 * Can the user CHANGE the groupId on this vulnerability?
 * Only site/web-app admins may reassign a vuln from one group to another, remove
 * a group, or add a group. Leaders' scope is bounded to their own group's items.
 */
export function canChangeGroup(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * Can the user MANAGE membership of a given group (add/remove/change role)?
 * - Admins: any group.
 * - Group leaders: their own group only.
 */
export function canManageGroupMembership(
  isAdmin: boolean,
  ctx: GroupContext,
  groupId: string
): boolean {
  if (isAdmin) return true;
  return isLeaderOf(ctx, groupId);
}
