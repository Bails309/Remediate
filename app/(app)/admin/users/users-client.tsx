"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { toast } from "sonner";
import { LogIn, Key, RefreshCw, Check, Trash2 } from "lucide-react";
import { ClientDate } from "@/components/ClientDate";
import { cn } from "@/components/cn";

type User = {
    id: string;
    name: string;
    email: string;
    roles: string[];
    authSource: string;
    createdAt: string;
};

const roleOptions = [
    { value: "site_admin", label: "Site Admin" },
    { value: "web_app_admin", label: "Workspace Admin" },
    { value: "pentest_admin", label: "Toolkit Admin" },
    { value: "web_app_user", label: "Workspace User" },
    { value: "pentest_user", label: "Toolkit User" },
];

function RoleTogglePill({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(
                "cursor-pointer inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors border select-none",
                checked
                    ? "bg-teal-500/10 border-teal-500 text-teal-700 dark:bg-teal-400/10 dark:border-teal-400 dark:text-teal-300"
                    : "bg-transparent border-slate-300 text-slate-500 hover:border-slate-400 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500"
            )}
        >
            {checked ? <Check className="h-3 w-3" /> : null}
            {label}
        </button>
    );
}

export function UsersClient() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/users");
            if (!res.ok) throw new Error("Failed to fetch users");
            const data = await res.json();
            setUsers(data);
            const roleMap: Record<string, string[]> = {};
            data.forEach((user: User) => {
                roleMap[user.id] = user.roles?.length ? [...user.roles] : ["web_app_user"];
            });
            setDraftRoles(roleMap);
        } catch {
            toast.error("Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const updateRoles = async (user: User) => {
        const roles = draftRoles[user.id] || [];
        setUpdatingId(user.id);

        try {
            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, roles }),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.error || "Failed to update role");
            }

            toast.success("User roles updated");
            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, roles } : u));
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message);
        } finally {
            setUpdatingId(null);
        }
    };

    const deleteUser = async (user: User) => {
        const ok = confirm(`Delete user ${user.name}? This action cannot be undone.`);
        if (!ok) return;

        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id }),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.error || "Failed to delete user");
            }

            toast.success("User deleted");
            setUsers(prev => prev.filter(u => u.id !== user.id));
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message);
        }
    };

    const toggleDraftRole = (userId: string, role: string) => {
        setDraftRoles((prev) => {
            const current = prev[userId] || [];
            const next = current.includes(role)
                ? current.filter((item) => item !== role)
                : [...current, role];
            if (!next.includes("web_app_user")) {
                next.push("web_app_user");
            }
            return { ...prev, [userId]: next };
        });
    };

    return (
        <div className="flex flex-col gap-8 p-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
                    <p className="text-sm text-[color:var(--color-foreground)] opacity-60">
                        View and manage all registered users in the system.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={fetchUsers}
                    disabled={loading}
                    className="glass glass-edge"
                >
                    <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            <div className="glass glass-edge overflow-hidden rounded-[32px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Authentication</th>
                                <th className="px-6 py-4">Roles</th>
                                <th className="px-6 py-4">Registered</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-sm">
                            {loading && users.length === 0 ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-6"><div className="h-4 w-32 rounded bg-white/5" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-24 rounded bg-white/5" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-16 rounded bg-white/5" /></td>
                                        <td className="px-6 py-6"><div className="h-4 w-24 rounded bg-white/5" /></td>
                                        <td className="px-6 py-6"><div className="ml-auto h-4 w-12 rounded bg-white/5" /></td>
                                    </tr>
                                ))
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm opacity-60">
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] font-bold">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{user.name}</p>
                                                    <p className="text-xs opacity-60">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-2">
                                                {user.authSource === "SSO" ? (
                                                    <LogIn className="h-4 w-4 text-blue-400" />
                                                ) : (
                                                    <Key className="h-4 w-4 text-emerald-400" />
                                                )}
                                                <span className="text-xs font-medium">
                                                    {user.authSource === "SSO" ? "Single Sign-On" : "Local Account"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3">
                                            <div className="flex flex-wrap gap-2">
                                                {roleOptions.map((role) => (
                                                    <RoleTogglePill
                                                        key={role.value}
                                                        label={role.label}
                                                        checked={(draftRoles[user.id] || []).includes(role.value)}
                                                        onToggle={() => toggleDraftRole(user.id, role.value)}
                                                    />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 opacity-70">
                                            <ClientDate date={user.createdAt} formatOptions={{ year: 'numeric', month: 'short', day: 'numeric' }} />
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => updateRoles(user)}
                                                    disabled={updatingId === user.id}
                                                    className="glass glass-edge text-xs font-medium transition-all hover:text-[color:var(--color-accent)]"
                                                >
                                                    {updatingId === user.id ? (
                                                        <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                                                    ) : null}
                                                    Save roles
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => deleteUser(user)}
                                                    className="text-rose-500 hover:bg-rose-50"
                                                >
                                                    <Trash2 className="h-3 w-3 mr-2" />
                                                    Delete
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
