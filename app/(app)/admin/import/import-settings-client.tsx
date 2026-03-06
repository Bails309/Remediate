"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/components/cn";

type FormData = {
    pluginGracePeriodDays: number;
};

export function ImportSettingsClient() {
    const [isSaving, setIsSaving] = useState(false);
    const [success, setSuccess] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { isDirty },
    } = useForm<FormData>({
        defaultValues: {
            pluginGracePeriodDays: 30,
        },
    });

    useEffect(() => {
        async function fetchConfig() {
            try {
                const res = await fetch("/api/admin/import");
                if (res.ok) {
                    const data = await res.json();
                    setValue("pluginGracePeriodDays", data.pluginGracePeriodDays, { shouldDirty: false });
                }
            } catch (e) {
                console.error("Failed to load config", e);
            }
        }
        fetchConfig();
    }, [setValue]);

    const onSubmit = async (data: FormData) => {
        setIsSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const res = await fetch("/api/admin/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to save settings");
            }

            const updated = await res.json();
            setValue("pluginGracePeriodDays", updated.pluginGracePeriodDays, { shouldDirty: false });
            setSuccess("Import settings updated successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="glass glass-edge max-w-2xl rounded-[32px] p-6 lg:p-8">
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

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium">Plugin Publication Grace Period (Days)</label>
                        <input
                            type="number"
                            min="0"
                            placeholder="30"
                            {...register("pluginGracePeriodDays", { valueAsNumber: true, min: 0 })}
                            className={cn(
                                "h-12 w-full rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 text-sm outline-none transition",
                                "focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:color-mix(in srgb,var(--color-accent) 35%,transparent)]"
                            )}
                        />
                        <p className="mt-2 text-xs opacity-60">
                            Vulnerabilities published within this window will be ignored during CSV upload to allow automated patching tools time to remediate them. Set to 0 to ingest all findings immediately.
                        </p>
                    </div>
                </div>

                <div className="pt-4">
                    <button
                        type="submit"
                        disabled={!isDirty || isSaving}
                        className={cn(
                            "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--color-accent)] font-semibold text-white transition-opacity",
                            (!isDirty || isSaving) ? "opacity-50 cursor-not-allowed" : "hover:opacity-90",
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
        </div>
    );
}
