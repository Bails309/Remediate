"use client";

import { useState, useEffect } from "react";
import { Bell, Info, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/Button";
import { Select } from "@/components/Select";
import { toast } from "@/lib/toast";

export function ThreatSubscriptionUI({ userId }: { userId: string }) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [minRisk, setMinRisk] = useState("High");
    const [cisaKevOnly, setCisaKevOnly] = useState(false);
    const [scheduledHour, setScheduledHour] = useState("08");
    const [scheduledMinute, setScheduledMinute] = useState("00");
    const [isSaving, setIsSaving] = useState(false);

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
        // Fetch current subscription status
        fetch(`/api/threat-intelligence/subscription?userId=${userId}`)
            .then(res => res.json())
            .then(data => {
                if (data) {
                    setIsSubscribed(data.isSubscribed);
                    setMinRisk(data.minRisk);
                    setCisaKevOnly(data.cisaKevOnly);
                    setScheduledHour(data.scheduledHour.toString().padStart(2, "0"));
                    setScheduledMinute(data.scheduledMinute.toString().padStart(2, "0"));
                }
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
                    isSubscribed,
                    minRisk,
                    cisaKevOnly,
                    scheduledHour: parseInt(scheduledHour, 10),
                    scheduledMinute: parseInt(scheduledMinute, 10)
                })
            });
            
            if (response.ok) {
                toast.success("Intelligence preferences updated successfully");
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
        <div className="glass glass-edge rounded-[28px] p-6 lg:p-8 flex flex-col h-full group hover:bg-black/[0.01] dark:hover:bg-white/[0.02] transition-colors relative overflow-hidden text-[color:var(--color-foreground)]">
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
                <div className="flex items-center justify-between p-4 bg-slate-100/50 dark:bg-white/[0.03] rounded-xl border border-slate-200 dark:border-white/5">
                    <div className="flex items-center gap-3">
                        <Bell className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Daily Digest Email</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={isSubscribed}
                            onChange={(e) => setIsSubscribed(e.target.checked)}
                        />
                        <div className="w-9 h-5 bg-slate-200 dark:bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500"></div>
                    </label>
                </div>

                {isSubscribed && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ml-1">Min Risk Level</label>
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
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">CISA KEV Only</span>
                                </label>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] ml-1">Dispatch Time (UTC)</label>
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
                    className="w-full py-6 rounded-2xl text-[11px] uppercase tracking-[0.2em] font-black"
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
