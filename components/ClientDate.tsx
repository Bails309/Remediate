"use client";

import { useEffect, useState } from "react";

type ClientDateProps = {
    date: Date | string | number | null | undefined;
    className?: string;
    fallback?: string;
    formatOptions?: Intl.DateTimeFormatOptions;
};

export function ClientDate({
    date,
    className,
    fallback = "Unknown",
    formatOptions = {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    },
}: ClientDateProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <span className={className}>...</span>;
    }

    if (!date) {
        return <span className={className}>{fallback}</span>;
    }

    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            return <span className={className}>{fallback}</span>;
        }
        return <span className={className}>{d.toLocaleString(undefined, formatOptions)}</span>;
    } catch (e) {
        return <span className={className}>{fallback}</span>;
    }
}
