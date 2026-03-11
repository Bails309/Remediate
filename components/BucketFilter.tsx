"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/Select";

type Bucket = { id: string; name: string };

export function BucketFilter({ buckets, selected }: { buckets: Bucket[]; selected: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const onChange = (value: string) => {
    const next = new URLSearchParams(params?.toString() || "");
    if (value) {
      next.set("bucketId", value);
    } else {
      next.delete("bucketId");
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  const options = [
    { label: "All Buckets", value: "" },
    ...buckets.map((bucket) => ({ label: bucket.name, value: bucket.id }))
  ];

  return (
    <Select
      value={selected}
      onChange={(val) => onChange(val)}
      options={options}
    />
  );
}
