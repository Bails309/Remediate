"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MultiSelect } from "@/components/MultiSelect";

type Bucket = { id: string; name: string };

export function BucketFilter({
  buckets,
  selected,
}: {
  buckets: Bucket[];
  /**
   * Currently selected bucket ids. Accepts a string (legacy `bucketId` searchParam)
   * or a string array (new `bucketIds` searchParam) for backwards compatibility.
   */
  selected: string | string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const selectedIds = Array.isArray(selected)
    ? selected.filter(Boolean)
    : selected
      ? [selected]
      : [];

  const onChange = (values: string[]) => {
    const next = new URLSearchParams(params?.toString() || "");
    next.delete("bucketId");
    next.delete("bucketIds");
    if (values.length === 1) {
      next.set("bucketId", values[0]);
    } else if (values.length > 1) {
      next.set("bucketIds", values.join(","));
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <MultiSelect
      value={selectedIds}
      onChange={onChange}
      placeholder="All Buckets"
      allLabel="All Buckets"
      options={buckets.map((bucket) => ({ label: bucket.name, value: bucket.id }))}
    />
  );
}
