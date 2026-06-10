"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { toast } from "@/lib/toast";
import { cn } from "@/components/cn";
import { Users, Shield, RefreshCw, Plus, Trash2, X, UserPlus } from "lucide-react";

type Group = {
    id: string;
    name: string;
    description: string | null;
    memberCount: number;
    vulnerabilityCount: number;
    viewerRole: "member" | "leader" | null;
};

type GroupMember = {
    userId: string;
    name: string;
    email: string;
    role: "member" | "leader";
};

type GroupDetail = {
    id: string;
    name: string;
    description: string | null;
    vulnerabilityCount: number;
    members: GroupMember[];
    viewerCanManage: boolean;
};

type UserOption = {
    id: string;
    name: string;
    email: string;
};

export function GroupsClient() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [users, setUsers] = useState<UserOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [detail, setDetail] = useState<GroupDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [newName, setNewName] = useState("");
    const [newDescription, setNewDescription] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const [addUserId, setAddUserId] = useState("");
    const [addRole, setAddRole] = useState<"member" | "leader">("member");
    const [isAdding, setIsAdding] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/groups");
            if (!res.ok) throw new Error("Failed to load groups");
            const data: Group[] = await res.json();
            setGroups(data);
            if (data.length && !selectedGroupId) {
                setSelectedGroupId(data[0].id);
            }
        } catch {
            toast.error("Failed to load groups");
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch("/api/admin/users");
            if (!res.ok) return;
            const data = await res.json();
            setUsers(data.map((u: { id: string; name: string; email: string }) => ({
                id: u.id, name: u.name, email: u.email,
            })));
        } catch {
            // non-admins won't have access; tolerate silently
        }
    };

    const fetchDetail = async (id: string) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/groups/${id}`);
            if (!res.ok) throw new Error("Failed to load group");
            const data = await res.json();
            setDetail(data);
        } catch {
            toast.error("Failed to load group");
        } finally {
            setDetailLoading(false);
        }
    };

    useEffect(() => {
        void fetchGroups();
        void fetchUsers();
    }, []);

    useEffect(() => {
        if (selectedGroupId) void fetchDetail(selectedGroupId);
    }, [selectedGroupId]);

    const createGroup = async (e: FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        setIsCreating(true);
        try {
            const res = await fetch("/api/groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim(), description: newDescription.trim() || null }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "Failed to create group");
            toast.success("Group created");
            setNewName("");
            setNewDescription("");
            await fetchGroups();
            setSelectedGroupId(payload.id);
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setIsCreating(false);
        }
    };

    const addMember = async (e: FormEvent) => {
        e.preventDefault();
        if (!selectedGroupId || !addUserId) return;
        setIsAdding(true);
        try {
            const res = await fetch(`/api/groups/${selectedGroupId}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: addUserId, role: addRole }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "Failed to add member");
            toast.success("Member added");
            setAddUserId("");
            setAddRole("member");
            await Promise.all([fetchDetail(selectedGroupId), fetchGroups()]);
        } catch (err) {
            toast.error((err as Error).message);
        } finally {
            setIsAdding(false);
        }
    };

    const changeRole = async (userId: string, role: "member" | "leader") => {
        if (!selectedGroupId) return;
        try {
            const res = await fetch(`/api/groups/${selectedGroupId}/members`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, role }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "Failed to update role");
            toast.success(`Role updated to ${role}`);
            await fetchDetail(selectedGroupId);
        } catch (err) {
            toast.error((err as Error).message);
        }
    };

    const removeMember = async (userId: string) => {
        if (!selectedGroupId) return;
        if (!confirm("Remove this user from the group?")) return;
        try {
            const res = await fetch(`/api/groups/${selectedGroupId}/members`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || "Failed to remove member");
            toast.success("Member removed");
            await Promise.all([fetchDetail(selectedGroupId), fetchGroups()]);
        } catch (err) {
            toast.error((err as Error).message);
        }
    };

    const confirmDeleteGroup = async () => {
        if (!groupToDelete) return;
        try {
            const res = await fetch(`/api/groups/${groupToDelete.id}`, { method: "DELETE" });
            const payload = await res.json();
            if (!res.ok) {
                if (payload.activeCount && confirm(`This group still owns ${payload.activeCount} active vulnerabilities. They will become ungrouped. Continue?`)) {
                    const forceRes = await fetch(`/api/groups/${groupToDelete.id}?force=true`, { method: "DELETE" });
                    if (!forceRes.ok) {
                        const fp = await forceRes.json();
                        throw new Error(fp.error || "Failed to delete group");
                    }
                } else {
                    throw new Error(payload.error || "Failed to delete group");
                }
            }
            toast.success("Group deleted");
            setGroupToDelete(null);
            if (selectedGroupId === groupToDelete.id) {
                setSelectedGroupId(null);
                setDetail(null);
            }
            await fetchGroups();
        } catch (err) {
            toast.error((err as Error).message);
        }
    };

    const memberIdSet = useMemo(() => new Set(detail?.members.map((m) => m.userId) ?? []), [detail]);
    const addableUsers = users.filter((u) => !memberIdSet.has(u.id));

    return (
        <div className="flex flex-col gap-8 p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
                    <p className="text-sm text-[color:var(--color-foreground)] opacity-60">
                        Departments and teams that own vulnerabilities. Members see only what their groups own;
                        leaders can reassign within their group and edit any of its items.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={fetchGroups}
                    disabled={loading}
                    className="glass glass-edge"
                >
                    <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="glass glass-edge rounded-[32px] p-6 lg:p-8">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Plus className="h-5 w-5 text-cyan-500" />
                    Create group
                </h2>
                <form onSubmit={createGroup} className="grid gap-4 md:grid-cols-3">
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Network Team"
                        required
                    />
                    <Input
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Description (optional)"
                        className="md:col-span-1"
                    />
                    <Button type="submit" loading={isCreating} disabled={!newName.trim()}>
                        Create group
                    </Button>
                </form>
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
                {/* Groups list */}
                <div className="glass glass-edge rounded-[24px] p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-3 px-2">
                        {groups.length} group{groups.length === 1 ? "" : "s"}
                    </h3>
                    {loading && <p className="text-sm opacity-60 px-2">Loading...</p>}
                    {!loading && groups.length === 0 && (
                        <p className="text-sm opacity-60 px-2">No groups yet. Create one above.</p>
                    )}
                    <div className="flex flex-col gap-1">
                        {groups.map((g) => (
                            <button
                                key={g.id}
                                onClick={() => setSelectedGroupId(g.id)}
                                className={cn(
                                    "text-left px-3 py-2 rounded-xl transition-all",
                                    selectedGroupId === g.id
                                        ? "bg-cyan-500/10 ring-1 ring-cyan-500/40"
                                        : "hover:bg-black/5 dark:hover:bg-white/5"
                                )}
                            >
                                <div className="text-sm font-semibold flex items-center gap-2">
                                    <Users className="h-3.5 w-3.5 opacity-60" />
                                    {g.name}
                                    {g.viewerRole === "leader" && (
                                        <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                            Leader
                                        </span>
                                    )}
                                </div>
                                <div className="text-[11px] opacity-60 mt-0.5">
                                    {g.memberCount} member{g.memberCount === 1 ? "" : "s"} · {g.vulnerabilityCount} vuln{g.vulnerabilityCount === 1 ? "" : "s"}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Group detail / member management */}
                <div className="glass glass-edge rounded-[24px] p-6">
                    {!detail && !detailLoading && (
                        <p className="text-sm opacity-60">Select a group to manage its members.</p>
                    )}
                    {detailLoading && <p className="text-sm opacity-60">Loading group...</p>}
                    {detail && (
                        <>
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold">{detail.name}</h2>
                                    {detail.description && (
                                        <p className="text-sm opacity-70 mt-1">{detail.description}</p>
                                    )}
                                    <p className="text-xs opacity-50 mt-2">
                                        {detail.vulnerabilityCount} active vulnerabilit{detail.vulnerabilityCount === 1 ? "y" : "ies"} owned by this group
                                    </p>
                                </div>
                                {detail.viewerCanManage && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            const g = groups.find((x) => x.id === detail.id);
                                            if (g) setGroupToDelete(g);
                                        }}
                                        className="text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete group
                                    </Button>
                                )}
                            </div>

                            {detail.viewerCanManage && (
                                <form onSubmit={addMember} className="grid gap-3 md:grid-cols-[1fr_140px_auto] mb-6 pb-6 border-b border-slate-100 dark:border-white/5">
                                    <Select
                                        value={addUserId}
                                        onChange={(v) => setAddUserId(v)}
                                        placeholder="Choose a user to add"
                                        options={[
                                            { label: "Select user...", value: "" },
                                            ...addableUsers.map((u) => ({
                                                label: `${u.name} (${u.email})`,
                                                value: u.id,
                                            })),
                                        ]}
                                    />
                                    <Select
                                        value={addRole}
                                        onChange={(v) => setAddRole(v as "member" | "leader")}
                                        options={[
                                            { label: "Member", value: "member" },
                                            { label: "Leader", value: "leader" },
                                        ]}
                                    />
                                    <Button type="submit" loading={isAdding} disabled={!addUserId}>
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Add
                                    </Button>
                                </form>
                            )}

                            <div className="flex flex-col gap-1">
                                {detail.members.length === 0 && (
                                    <p className="text-sm opacity-60">No members yet.</p>
                                )}
                                {detail.members.map((m) => (
                                    <div
                                        key={m.userId}
                                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{m.name}</div>
                                            <div className="text-xs opacity-60 truncate">{m.email}</div>
                                        </div>
                                        {detail.viewerCanManage ? (
                                            <Select
                                                value={m.role}
                                                onChange={(v) => changeRole(m.userId, v as "member" | "leader")}
                                                options={[
                                                    { label: "Member", value: "member" },
                                                    { label: "Leader", value: "leader" },
                                                ]}
                                                className="w-32"
                                            />
                                        ) : (
                                            <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                                                {m.role === "leader" ? (
                                                    <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                                                        <Shield className="h-3 w-3" />
                                                        Leader
                                                    </span>
                                                ) : "Member"}
                                            </span>
                                        )}
                                        {detail.viewerCanManage && (
                                            <button
                                                onClick={() => removeMember(m.userId)}
                                                aria-label={`Remove ${m.name}`}
                                                className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {groupToDelete && (
                <div
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                    onClick={() => setGroupToDelete(null)}
                >
                    <div
                        className="glass glass-edge rounded-[24px] p-6 max-w-md w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold mb-2">Delete group?</h3>
                        <p className="text-sm opacity-70 mb-4">
                            Removing <strong>{groupToDelete.name}</strong> will unassign it from any vulnerabilities
                            it currently owns. Members will lose group-based visibility into those items.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setGroupToDelete(null)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={confirmDeleteGroup}
                                className="bg-red-600 hover:bg-red-700 text-white"
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
