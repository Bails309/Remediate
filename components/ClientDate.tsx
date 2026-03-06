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

    let dateString: string;
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            dateString = fallback;
        } else {
            // Force UK formatting for dates in the client UI.
            const locale = "en-GB";
            dateString = d.toLocaleString(locale, formatOptions);
        }
    } catch {
        dateString = fallback;
    }

    return <span className={className}>{dateString}</span>;
}
