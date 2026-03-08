"use client";

import React, { useState, useEffect } from "react";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/components/cn";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";

export function ImportSettingsClient() {
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pluginGracePeriodDays, setPluginGracePeriodDays] = useState(30);

    useEffect(() => {
        async function fetchConfig() {
            try {
                const res = await fetch("/api/admin/import");
                if (res.ok) {
                    const data = await res.json();
                    setPluginGracePeriodDays(data.pluginGracePeriodDays);
                }
            } catch (e) {
                console.error("Failed to load config", e);
            } finally {
                setLoading(false);
            }
        }
        fetchConfig();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/admin/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ pluginGracePeriodDays }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to save settings");
            }

            const updated = await res.json();
            setPluginGracePeriodDays(updated.pluginGracePeriodDays);
            setSuccess("Import settings updated successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (e: unknown) {
            const err = e as Error;
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <Card className="bg-white dark:bg-gray-800/50 border border-slate-200 dark:border-gray-700 shadow-sm rounded-xl p-6 max-w-2xl">
                <p className="text-sm opacity-70">Loading configuration...</p>
            </Card>
        );
    }

    return (
        <Card className="max-w-2xl">
            <div className="mb-8">
                <h2 className="text-2xl font-semibold">CSV Import Settings</h2>
                <p className="mt-1 text-sm opacity-70">
                    Configure how automated vulnerability scans are processed.
                </p>
            </div>

            {error && (
                <div className="mb-6 flex items-center gap-3 rounded-2xl bg-red-500/10 p-4 text-red-500">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}

            {success && (
                <div className="mb-6 flex items-center gap-3 rounded-2xl bg-green-500/10 p-4 text-green-500">
                    <CheckCircle2 size={20} />
                    <p className="text-sm font-medium">{success}</p>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Plugin Publication Grace Period (Days)
                    </label>
                    <Input
                        type="number"
                        min="0"
                        value={pluginGracePeriodDays}
                        onChange={(e) => setPluginGracePeriodDays(parseInt(e.target.value) || 0)}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-gray-400">
                        Vulnerabilities published within this window will be ignored during CSV upload to allow automated patching tools time to remediate them. Set to 0 to ingest all findings immediately.
                    </p>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className={cn(
                            "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] font-semibold text-white transition-opacity",
                            isSaving ? "opacity-50 cursor-not-allowed" : "hover:opacity-90",
                        )}
                    >
                        {isSaving ? (
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        ) : (
                            <Save size={18} />
                        )}
                        Save Configuration
                    </button>
                </div>
            </form>
        </Card>
    );
}
