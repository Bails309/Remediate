"use client";

import { useState, useEffect } from "react";
import { Info, ShieldAlert, Zap, ShieldCheck, Globe, Mail } from "lucide-react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { toast } from "@/lib/toast";

export function ThreatSubscriptionUI({ userId }: { userId: string }) {
    const [globalDigestEnabled, setGlobalDigestEnabled] = useState(false);
    const [environmentDigestEnabled, setEnvironmentDigestEnabled] = useState(true);
    const [minRisk, setMinRisk] = useState("High");
    const [cisaKevOnly, setCisaKevOnly] = useState(false);
    const [scheduledHour, setScheduledHour] = useState("08");
    const [scheduledMinute, setScheduledMinute] = useState("00");
    const [isSaving, setIsSaving] = useState(false);

    const hasAnyFeedEnabled = globalDigestEnabled || environmentDigestEnabled;

    const riskOptions = [
        { label: "Critical Only", value: "Critical" },
        { label: "High & Above", value: "High" },
        { label: "Medium & Above", value: "Medium" },
        { label: "Low (All Features)", value: "Low" },
    ];

    const hourOptions = Array.from({ length: 24 }, (_, i) => ({
        label: `${i.toString().padStart(2, "0")}:00`,
        value: i.toString().padStart(2, "0")
    }));

    const minuteOptions = [
        { label: "00", value: "00" },
        { label: "15", value: "15" },
        { label: "30", value: "30" },
        { label: "45", value: "45" },
    ];

    useEffect(() => {
        fetch(`/api/threat-intelligence/subscription?userId=${userId}`)
            .then(res => res.json())
            .then(data => {
                if (data) {
                    const isGlobal = data.globalDigestEnabled !== undefined 
                        ? data.globalDigestEnabled 
                        : (data.isSubscribed ?? false);
                    const isEnv = data.environmentDigestEnabled !== undefined 
                        ? data.environmentDigestEnabled 
                        : false;
                    
                    setGlobalDigestEnabled(isGlobal);
                    setEnvironmentDigestEnabled(isEnv);
                    if (data.minRisk) setMinRisk(data.minRisk);
                    if (data.cisaKevOnly !== undefined) setCisaKevOnly(data.cisaKevOnly);
                    if (data.scheduledHour !== undefined) {
                        setScheduledHour(data.scheduledHour.toString().padStart(2, "0"));
                    }
                    if (data.scheduledMinute !== undefined) {
                        setScheduledMinute(data.scheduledMinute.toString().padStart(2, "0"));
                    }
                }
            })
            .catch(() => {
                // Silently maintain defaults on fetch error
            });
    }, [userId]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch("/api/threat-intelligence/subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    globalDigestEnabled,
                    environmentDigestEnabled,
                    isSubscribed: hasAnyFeedEnabled,
                    minRisk,
                    cisaKevOnly,
                    scheduledHour: parseInt(scheduledHour, 10),
                    scheduledMinute: parseInt(scheduledMinute, 10)
                })
            });
            
            if (response.ok) {
                toast.success("Intelligence alert preferences updated successfully");
            } else {
                toast.error("Failed to update preferences. Please try again.");
            }
        } catch {
            toast.error("A network error occurred while saving preferences.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div id="tour-threat-subscription" className="glass glass-edge rounded-[28px] p-6 lg:p-8 flex flex-col h-full group hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors relative overflow-hidden text-[color:var(--color-foreground)]">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Zap className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold italic tracking-tight text-slate-900 dark:text-slate-100">Threat Intelligence Digest</h3>
                    <p className="text-xs text-blue-600 dark:text-blue-400 uppercase font-black tracking-widest mt-0.5">Premium Feature</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Option 1: Environment Threat Digest (Recommended, Targeted) */}
                <div className="p-4 bg-slate-100/60 dark:bg-white/[0.03] rounded-2xl border border-slate-200/80 dark:border-white/5 space-y-2.5 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                Environment Digest
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                Zero Noise
                            </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={environmentDigestEnabled}
                                onChange={(e) => setEnvironmentDigestEnabled(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 dark:peer-checked:bg-emerald-500"></div>
                        </label>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Alerts refined to software, packages, and CVEs with active or historical presence in your environment (imported via CSV, PDF, or ACR).
                    </p>
                </div>

                {/* Option 2: Global Threat Intelligence Horizon */}
                <div className="p-4 bg-slate-100/60 dark:bg-white/[0.03] rounded-2xl border border-slate-200/80 dark:border-white/5 space-y-2.5 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <Globe className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                Global Threat Feed
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                Horizon
                            </span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={globalDigestEnabled}
                                onChange={(e) => setGlobalDigestEnabled(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500"></div>
                        </label>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        Full worldwide vulnerability feed from NVD, OSV.dev, and CISA KEV (higher volume disclosures).
                    </p>
                </div>

                {/* Dual-Email Delivery Notification Banner */}
                {globalDigestEnabled && environmentDigestEnabled && (
                    <div className="p-3.5 bg-gradient-to-br from-emerald-500/10 via-blue-500/10 to-indigo-500/10 rounded-2xl border border-blue-500/20 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-start gap-2.5">
                            <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                    Dual Email Dispatch Active
                                </p>
                                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
                                    You will receive <b>2 separate emails</b> at your dispatch time: one focused on your environment assets, and one for the global threat feed.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Configuration Options (Active when at least one feed is enabled) */}
                {hasAnyFeedEnabled && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 pt-2 border-t border-slate-200/60 dark:border-white/5">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ml-1">
                                    Min Risk Level
                                </label>
                                <Select 
                                    value={minRisk}
                                    onChange={(val: string) => setMinRisk(val)}
                                    options={riskOptions}
                                    className="!h-10 !rounded-xl !text-[10px] uppercase font-bold tracking-widest text-[#00A3CC] dark:text-[#00C8FF]"
                                />
                            </div>
                            <div className="flex flex-col justify-end pb-1.5">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        className="rounded-lg border-slate-300 dark:border-white/20 bg-slate-100 dark:bg-white/5 text-blue-600 dark:text-blue-500 focus:ring-blue-500 h-4 w-4"
                                        checked={cisaKevOnly}
                                        onChange={(e) => setCisaKevOnly(e.target.checked)}
                                    />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        CISA KEV Only
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ml-1">
                                Dispatch Time (UTC)
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <Select 
                                    value={scheduledHour}
                                    onChange={(val: string) => setScheduledHour(val)}
                                    options={hourOptions}
                                    className="!h-10 !rounded-xl !text-[11px] font-mono tracking-widest"
                                />
                                <Select 
                                    value={scheduledMinute}
                                    onChange={(val: string) => setScheduledMinute(val)}
                                    options={minuteOptions}
                                    className="!h-10 !rounded-xl !text-[11px] font-mono tracking-widest"
                                />
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-3 bg-blue-500/[0.03] dark:bg-blue-500/5 rounded-xl border border-blue-500/10">
                            <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5" />
                            <p className="text-[10px] leading-relaxed text-blue-700/70 dark:text-blue-300/60 font-medium">
                                Alerts include attribution to NVD and OSV.dev. CISA KEV status is updated hourly.
                            </p>
                        </div>
                    </div>
                )}

                <Button 
                    onClick={handleSave}
                    loading={isSaving}
                    className="w-full py-6 rounded-2xl text-[11px] uppercase tracking-[0.2em] font-black mt-2"
                >
                    Save Preferences
                </Button>
            </div>

            {/* Legal Disclaimer Footer */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-white/5 flex items-center gap-2 text-[9px] text-slate-500 dark:text-slate-400 font-medium tracking-tight">
                <ShieldAlert className="w-3 h-3 text-slate-400" />
                <span>Aggregated data from NVD, OSV.dev, and CISA KEV. No liability assumed for feed downtime.</span>
            </div>
        </div>
    );
}
