"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { toast } from "sonner";
import { LogIn, Key, RefreshCw, Check, Trash2, UserPlus } from "lucide-react";
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
    { value: "toolkit_admin", label: "Toolkit Admin" },
    { value: "web_app_user", label: "Workspace User" },
    { value: "toolkit_user", label: "Toolkit User" },
];

function RoleTogglePill({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(
                "cursor-pointer inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors border select-none",
                checked
                    ? "bg-cyan-500/10 border-cyan-500 text-cyan-700 dark:bg-[#00C8FF]/10 dark:border-[#00C8FF] dark:text-[#00C8FF] shadow-[0_0_8px_rgba(0,200,255,0.2)]"
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
    const [newItemEmail, setNewItemEmail] = useState("");
    const [newItemRoles, setNewItemRoles] = useState<string[]>(["web_app_user"]);
    const [isCreating, setIsCreating] = useState(false);

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
        void fetchUsers();
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
            setUsers((prev: User[]) => prev.map((u: User) => u.id === user.id ? { ...u, roles } : u));
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
            setUsers(prev => prev.filter((u: User) => u.id !== user.id));
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message);
        }
    };

    const toggleDraftRole = (userId: string, role: string) => {
        setDraftRoles((prev: Record<string, string[]>) => {
            const current = prev[userId] || [];
            const next = current.includes(role)
                ? current.filter((item: string) => item !== role)
                : [...current, role];
            if (!next.includes("web_app_user")) {
                next.push("web_app_user");
            }
            return { ...prev, [userId]: next };
        });
    };

    const preRegisterUser = async (e: FormEvent) => {
        e.preventDefault();
        if (!newItemEmail) return;
        setIsCreating(true);

        try {
            const res = await fetch("/api/admin/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newItemEmail, roles: newItemRoles }),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.error || "Failed to pre-register user");
            }

            toast.success("User pre-registered successfully");
            setNewItemEmail("");
            setNewItemRoles(["web_app_user"]);
            void fetchUsers();
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message);
        } finally {
            setIsCreating(false);
        }
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
                <div className="flex items-center gap-3">
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
            </div>

            <div className="glass glass-edge rounded-[32px] p-6 lg:p-8">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <UserPlus className="h-5 w-5 text-cyan-500" />
                    Pre-register SSO User
                </h2>
                <form onSubmit={preRegisterUser} className="flex flex-col gap-6">
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60">Email Address</label>
                            <input
                                type="email"
                                value={newItemEmail}
                                onChange={(e) => setNewItemEmail(e.target.value)}
                                placeholder="user@company.com"
                                className="w-full bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:opacity-40"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2 lg:col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-60">Initial Roles</label>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {roleOptions.map((role) => (
                                    <RoleTogglePill
                                        key={role.value}
                                        label={role.label}
                                        checked={newItemRoles.includes(role.value)}
                                        onToggle={() => {
                                            setNewItemRoles((prev: string[]) =>
                                                prev.includes(role.value)
                                                    ? prev.filter((r: string) => r !== role.value)
                                                    : [...prev, role.value]
                                            );
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end border-t border-slate-100 dark:border-white/5 pt-6">
                        <Button
                            type="submit"
                            disabled={!newItemEmail}
                            loading={isCreating}
                            variant="primary"
                            className="px-8 shadow-[0_0_30px_rgba(6,182,212,0.1)] transition-all hover:scale-[1.02]"
                        >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Pre-register User
                        </Button>
                    </div>
                </form>
            </div>

            <div className="glass glass-edge overflow-hidden rounded-[32px]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
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
                                    <tr key={user.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-white/5 last:border-none">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)] font-bold">
                                                    {user.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 opacity-60 font-medium">{user.email}</p>
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
                                                    className="glass glass-edge text-[10px] font-bold uppercase tracking-widest transition-all hover:text-cyan-500 dark:hover:text-[#00C8FF]"
                                                >
                                                    {updatingId === user.id ? (
                                                        <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                                                    ) : null}
                                                    Save roles
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => deleteUser(user)}
                                                    className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:bg-rose-500/10"
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
