"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { toast } from "@/lib/toast";
import { LogIn, Key, RefreshCw, Check, Trash2, UserPlus, AlertTriangle, X, Search } from "lucide-react";
import { ClientDate } from "@/components/ClientDate";
import { cn } from "@/components/cn";

type User = {
    id: string;
    name: string;
    email: string;
    roles: string[];
    authSource: string;
    createdAt: string;
    lastLoginAt?: string | null;
};

const roleOptions = [
    { value: "site_admin", label: "Site Admin", description: "Full control of the installation, including configuration, users, groups, logs and platform monitoring." },
    { value: "web_app_admin", label: "Workspace Admin", description: "Admin over dashboards, vulnerabilities, analytics, inventory and automation. No access to site settings, users, groups or logs." },
    { value: "toolkit_admin", label: "Toolkit Admin", description: "Manages the security toolkit and its registry." },
    { value: "web_app_user", label: "Workspace User", description: "Works with dashboards, vulnerabilities and analytics." },
    { value: "toolkit_user", label: "Toolkit User", description: "Runs security toolkit scans." },
    { value: "web_app_auditor", label: "Workspace Auditor (read-only)", description: "Read-only access to workspace data; cannot make changes." },
];

const WORKSPACE_WRITER_ROLES = ["site_admin", "web_app_admin", "web_app_user"];

function normaliseRoles(roles: string[]): string[] {
    const unique = Array.from(new Set(roles));
    if (unique.includes("web_app_auditor")) {
        // Auditor is read-only; remove writer roles. (Toolkit roles untouched.)
        return unique.filter((r) => !WORKSPACE_WRITER_ROLES.includes(r));
    }
    if (!unique.includes("web_app_user")) {
        unique.push("web_app_user");
    }
    return unique;
}

/**
 * Toggle a role for a draft role list, with conflict resolution so the role
 * the user just clicked always wins:
 *  - Adding a writer role while auditor is present → drop auditor.
 *  - Adding auditor while writer roles are present → normaliseRoles strips them.
 */
function toggleRoleWithConflictResolution(current: string[], role: string): string[] {
    const has = current.includes(role);
    let next = has ? current.filter((r) => r !== role) : [...current, role];
    if (!has) {
        if (WORKSPACE_WRITER_ROLES.includes(role)) {
            next = next.filter((r) => r !== "web_app_auditor");
        } else if (role === "web_app_auditor") {
            next = next.filter((r) => !WORKSPACE_WRITER_ROLES.includes(r));
        }
    }
    return normaliseRoles(next);
}

function RoleTogglePill({ label, description, checked, onToggle }: { label: string; description?: string; checked: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            title={description}
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
    const [userToDelete, setUserToDelete] = useState<User | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const filteredUsers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q)
        );
    }, [users, searchQuery]);

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

    const deleteUser = (user: User) => {
        // If a native confirm() is available (tests stub it), use it for quick confirmation
        // to support existing tests that mock window.confirm. Otherwise, show the modal.
        if (typeof window !== "undefined") {
            const win = window as Window & { confirm?: (message?: string) => boolean };
            if (typeof win.confirm === "function") {
                const ok = win.confirm(`Are you sure you want to remove "${user.name}"?`);
                if (!ok) return;

                // perform deletion immediately
                void (async () => {
                    setIsDeleting(true);
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
                    } finally {
                        setIsDeleting(false);
                    }
                })();

                return;
            }
        }

        setUserToDelete(user);
    };

    const confirmDelete = async () => {
        if (!userToDelete) return;
        setIsDeleting(true);

        try {
            const res = await fetch("/api/admin/users", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: userToDelete.id }),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.error || "Failed to delete user");
            }

            toast.success("User deleted");
            setUsers(prev => prev.filter((u: User) => u.id !== userToDelete.id));
            setUserToDelete(null);
        } catch (err: unknown) {
            const error = err as Error;
            toast.error(error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleDraftRole = (userId: string, role: string) => {
        setDraftRoles((prev: Record<string, string[]>) => {
            const current = prev[userId] || [];
            return { ...prev, [userId]: toggleRoleWithConflictResolution(current, role) };
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
                                        description={role.description}
                                        checked={newItemRoles.includes(role.value)}
                                        onToggle={() => {
                                            setNewItemRoles((prev: string[]) => toggleRoleWithConflictResolution(prev, role.value));
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
                <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-white/5 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name or email…"
                            className="w-full bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:opacity-40"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200/50 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {searchQuery
                            ? `${filteredUsers.length} of ${users.length} users`
                            : `${users.length} ${users.length === 1 ? "user" : "users"}`}
                    </p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Authentication</th>
                                <th className="px-6 py-4">Roles</th>
                                <th className="px-6 py-4">Registered</th>
                                <th className="px-6 py-4">Last Login</th>
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
                                        <td className="px-6 py-6"><div className="h-4 w-24 rounded bg-white/5" /></td>
                                        <td className="px-6 py-6"><div className="ml-auto h-4 w-12 rounded bg-white/5" /></td>
                                    </tr>
                                ))
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-sm opacity-60">
                                        {searchQuery ? `No users match “${searchQuery}”.` : "No users found."}
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => (
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
                                                        description={role.description}
                                                        checked={(draftRoles[user.id] || []).includes(role.value)}
                                                        onToggle={() => toggleDraftRole(user.id, role.value)}
                                                    />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 opacity-70">
                                            <ClientDate date={user.createdAt} formatOptions={{ year: 'numeric', month: 'short', day: 'numeric' }} />
                                        </td>
                                        <td className="px-6 py-3 opacity-70">
                                            {user.lastLoginAt ? (
                                                <ClientDate date={user.lastLoginAt} formatOptions={{ year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
                                            ) : (
                                                <span className="text-xs italic text-slate-400 dark:text-slate-500">Never</span>
                                            )}
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

            {userToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-red-500/20 bg-white dark:bg-slate-900 p-8 shadow-2xl glass glass-edge animate-in zoom-in-95 duration-300">
                        <button
                            onClick={() => setUserToDelete(null)}
                            disabled={isDeleting}
                            className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="flex flex-col items-center justify-center text-center">
                            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                                <AlertTriangle className="h-8 w-8 text-red-500" />
                            </div>
                            <h3 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">Delete User?</h3>
                            <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">
                                Are you sure you want to remove <span className="font-bold text-slate-700 dark:text-slate-300">&quot;{userToDelete.name}&quot;</span>?
                                This action is permanent and will immediately revoke all access and erase their profile from the system.
                            </p>

                            <div className="flex w-full gap-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setUserToDelete(null)}
                                    disabled={isDeleting}
                                    className="flex-1 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={confirmDelete}
                                    loading={isDeleting}
                                    className="flex-1 bg-red-600 hover:bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)] text-white border-0"
                                >
                                    {isDeleting ? "Deleting..." : "Delete Permanently"}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
