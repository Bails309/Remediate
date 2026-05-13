"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Animated progress display for upload pipelines.
 *
 * Long-running steps (especially "Calling PDF Processing API", which can block for minutes
 * while Document Intelligence extracts text) used to leave the UI looking frozen. This
 * component layers three light signals on top of the bare percentage to reassure the user:
 *
 *   1. A pulsing dot + shimmer bar so there's always motion on screen.
 *   2. A live elapsed timer reset on every step change.
 *   3. A rotating tip strip that swaps copy every ~4.5s when the step has been stuck for
 *      more than a couple seconds, so it doesn't flash for fast steps.
 */

const TIPS: ReadonlyArray<string> = [
    "PDF extraction can take a few minutes for large reports — hang tight.",
    "We're streaming pages through the configured Document Intelligence backend.",
    "Findings are deduped against your existing inventory as they arrive.",
    "Severity is recalculated using CVSS plus your environment overrides.",
    "Tip: you can keep this tab open or come back later — progress is server-side.",
    "Linking findings to assets… asset matching uses hostname + IP heuristics.",
    "Compiling remediation guidance from the report's recommendations section.",
    "Almost there — the upstream API is the slow part, not your browser.",
    "Pro tip: re-test the API connection in Admin → PDF Processing with a real PDF.",
    "Tagging unique vulnerability fingerprints so dashboards stay tidy.",
];

const STALL_STEPS = new Set<string>([
    "Calling PDF Processing API",
    "Processing",
    "Parsing",
    "Extracting findings",
]);

function formatElapsed(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function LiveProgressDisplay({
    progress,
}: {
    progress: { step: string; progress: number; error?: string };
}) {
    const isFailed = progress.step === "Failed";
    const isComplete = progress.progress >= 100 && !isFailed;
    const isStallable = useMemo(
        () => !isFailed && !isComplete && STALL_STEPS.has(progress.step),
        [isFailed, isComplete, progress.step],
    );

    const [stepStartedAt, setStepStartedAt] = useState(() => Date.now());
    const [now, setNow] = useState(() => Date.now());
    const [tipIndex, setTipIndex] = useState(0);
    const prevStepRef = useRef(progress.step);

    // Reset the elapsed timer whenever the step label changes. This is a legitimate
    // "synchronise an external clock with a prop change" case: we want the elapsed counter
    // to restart at 0 the instant the step transitions, which can't be expressed as either
    // a pure derivation (Date.now() is impure) or an external-system subscription. The
    // single follow-up render is intentional and bounded by the step changing.
    useEffect(() => {
        if (prevStepRef.current === progress.step) return;
        prevStepRef.current = progress.step;
        const ts = Date.now();
        /* eslint-disable react-hooks/set-state-in-effect */
        setStepStartedAt(ts);
        setNow(ts);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, [progress.step]);

    // 1s heartbeat for the elapsed counter — only while still in progress.
    useEffect(() => {
        if (isFailed || isComplete) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [isFailed, isComplete]);

    // Rotate tips every 4.5s once the step has been "stuck" for >2s.
    useEffect(() => {
        if (!isStallable) return;
        const id = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 4500);
        return () => clearInterval(id);
    }, [isStallable]);

    const elapsedMs = now - stepStartedAt;
    const showTip = isStallable && elapsedMs > 2000;
    const barColor = isFailed
        ? "from-red-500 to-rose-500"
        : isComplete
            ? "from-emerald-400 to-teal-500"
            : "from-[color:var(--color-accent)] to-indigo-500";

    return (
        <>
            <div className="mt-4 relative h-2 overflow-hidden rounded-full bg-[color:var(--color-muted)] shadow-inner">
                <div
                    className={`h-full bg-gradient-to-r ${barColor} transition-all duration-1000`}
                    style={{ width: `${Math.max(progress.progress, isStallable ? 4 : 0)}%` }}
                />
                {isStallable ? (
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full animate-[shimmer_2.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider opacity-60">
                    {!isFailed && !isComplete ? (
                        <span className="relative inline-flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[color:var(--color-accent)] opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-[color:var(--color-accent)]" />
                        </span>
                    ) : null}
                    {progress.step}
                </p>
                {!isFailed && !isComplete ? (
                    <span className="font-mono text-[10px] uppercase tracking-wider opacity-40">
                        {formatElapsed(elapsedMs)}
                    </span>
                ) : null}
            </div>

            {showTip ? (
                <div
                    key={tipIndex}
                    className="mt-3 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 px-3 py-2 animate-in fade-in slide-in-from-bottom-1 duration-500"
                >
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-bold uppercase tracking-wider text-[color:var(--color-accent)]">Tip ·</span>{" "}
                        {TIPS[tipIndex]}
                    </p>
                </div>
            ) : null}

            {progress.step === "Failed" && progress.error ? (
                <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-red-500">Failure reason</p>
                    <p className="mt-1 break-words text-sm text-red-600 dark:text-red-300">{progress.error}</p>
                </div>
            ) : null}
        </>
    );
}
