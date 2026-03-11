"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/Select";

export function TrendRangeFilter({ selected }: { selected: string }) {
    const router = useRouter();
    const params = useSearchParams();
    const pathname = usePathname();

    const onChange = (value: string) => {
        const next = new URLSearchParams(params?.toString() || "");
        if (value) {
            next.set("range", value);
        } else {
            next.delete("range");
        }
        router.push(`${pathname}?${next.toString()}`);
    };

    const options = [
        { label: "7 Days", value: "7d" },
        { label: "30 Days", value: "30d" },
        { label: "3 Months", value: "3m" },
        { label: "6 Months", value: "6m" },
        { label: "12 Months", value: "12m" },
    ];

    return (
        <div className="w-40">
            <Select
                value={selected}
                onChange={(val) => onChange(val)}
                options={options}
            />
        </div>
    );
}
