import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
    prisma: {
        groupMembership: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}));

import { prisma } from "@/lib/prisma";
import {
    getGroupContext,
    isMemberOf,
    isLeaderOf,
    canViewVulnerability,
    canSelfAssign,
    canEditVulnerability,
    canReassign,
    canChangeGroup,
    canManageGroupMembership,
} from "@/lib/group-rbac";

const EMPTY_CTX = { memberOf: [], leaderOf: [] };
const MEMBER_CTX = { memberOf: ["g1"], leaderOf: [] };
const LEADER_CTX = { memberOf: ["g1"], leaderOf: ["g1"] };

describe("group-rbac", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getGroupContext", () => {
        it("derives memberOf and leaderOf", async () => {
            (prisma.groupMembership.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
                { groupId: "g1", role: "member" },
                { groupId: "g2", role: "leader" },
            ]);
            const ctx = await getGroupContext("u1");
            expect(ctx.memberOf.sort()).toEqual(["g1", "g2"]);
            expect(ctx.leaderOf).toEqual(["g2"]);
        });
    });

    describe("isMemberOf / isLeaderOf", () => {
        it("handles null group", () => {
            expect(isMemberOf(LEADER_CTX, null)).toBe(false);
            expect(isLeaderOf(LEADER_CTX, null)).toBe(false);
        });
        it("checks membership", () => {
            expect(isMemberOf(MEMBER_CTX, "g1")).toBe(true);
            expect(isMemberOf(MEMBER_CTX, "g2")).toBe(false);
        });
        it("checks leadership", () => {
            expect(isLeaderOf(LEADER_CTX, "g1")).toBe(true);
            expect(isLeaderOf(MEMBER_CTX, "g1")).toBe(false);
        });
    });

    describe("canViewVulnerability", () => {
        it("admin sees everything", () => {
            expect(canViewVulnerability(true, EMPTY_CTX, { groupId: "g1" })).toBe(true);
            expect(canViewVulnerability(true, EMPTY_CTX, { groupId: null })).toBe(true);
        });
        it("anyone sees ungrouped items", () => {
            expect(canViewVulnerability(false, EMPTY_CTX, { groupId: null })).toBe(true);
        });
        it("non-member cannot see group items", () => {
            expect(canViewVulnerability(false, EMPTY_CTX, { groupId: "g1" })).toBe(false);
        });
        it("member can see group items", () => {
            expect(canViewVulnerability(false, MEMBER_CTX, { groupId: "g1" })).toBe(true);
        });
    });

    describe("canSelfAssign", () => {
        it("mirrors view rules", () => {
            expect(canSelfAssign(false, EMPTY_CTX, { groupId: "g1" })).toBe(false);
            expect(canSelfAssign(false, MEMBER_CTX, { groupId: "g1" })).toBe(true);
            expect(canSelfAssign(false, EMPTY_CTX, { groupId: null })).toBe(true);
        });
    });

    describe("canEditVulnerability", () => {
        it("admin always edits", () => {
            expect(canEditVulnerability(true, EMPTY_CTX, "u1", { groupId: "g1", assigneeId: null })).toBe(true);
        });
        it("assignee edits", () => {
            expect(canEditVulnerability(false, EMPTY_CTX, "u1", { groupId: null, assigneeId: "u1" })).toBe(true);
        });
        it("leader edits group's items", () => {
            expect(canEditVulnerability(false, LEADER_CTX, "u1", { groupId: "g1", assigneeId: "u2" })).toBe(true);
        });
        it("plain member cannot edit when not assignee", () => {
            expect(canEditVulnerability(false, MEMBER_CTX, "u1", { groupId: "g1", assigneeId: "u2" })).toBe(false);
        });
    });

    describe("canReassign", () => {
        it("admin always reassigns", async () => {
            await expect(
                canReassign(true, EMPTY_CTX, "u1", { groupId: "g1", assigneeId: null }, "u2")
            ).resolves.toBe(true);
        });
        it("unassign is always allowed for viewer", async () => {
            await expect(
                canReassign(false, EMPTY_CTX, "u1", { groupId: null, assigneeId: "u2" }, null)
            ).resolves.toBe(true);
        });
        it("self-assign is allowed when can view", async () => {
            await expect(
                canReassign(false, MEMBER_CTX, "u1", { groupId: "g1", assigneeId: null }, "u1")
            ).resolves.toBe(true);
        });
        it("leader can assign to a group member", async () => {
            (prisma.groupMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ userId: "u2" });
            await expect(
                canReassign(false, LEADER_CTX, "u1", { groupId: "g1", assigneeId: null }, "u2")
            ).resolves.toBe(true);
        });
        it("leader cannot assign to a non-member", async () => {
            (prisma.groupMembership.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
            await expect(
                canReassign(false, LEADER_CTX, "u1", { groupId: "g1", assigneeId: null }, "u2")
            ).resolves.toBe(false);
        });
        it("plain member cannot reassign to someone else", async () => {
            await expect(
                canReassign(false, MEMBER_CTX, "u1", { groupId: "g1", assigneeId: null }, "u2")
            ).resolves.toBe(false);
        });
    });

    describe("canChangeGroup", () => {
        it("admin only", () => {
            expect(canChangeGroup(true)).toBe(true);
            expect(canChangeGroup(false)).toBe(false);
        });
    });

    describe("canManageGroupMembership", () => {
        it("admin manages any group", () => {
            expect(canManageGroupMembership(true, EMPTY_CTX, "g1")).toBe(true);
        });
        it("leader manages their group", () => {
            expect(canManageGroupMembership(false, LEADER_CTX, "g1")).toBe(true);
        });
        it("member cannot manage", () => {
            expect(canManageGroupMembership(false, MEMBER_CTX, "g1")).toBe(false);
        });
        it("leader of one group cannot manage another", () => {
            expect(canManageGroupMembership(false, LEADER_CTX, "g2")).toBe(false);
        });
    });
});
