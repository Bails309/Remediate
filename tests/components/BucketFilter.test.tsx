import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/current",
  useSearchParams: () => new URLSearchParams(),
}));

import { BucketFilter } from "@/components/BucketFilter";
import * as nav from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BucketFilter", () => {
  it("pushes new bucketId in query when changed", () => {
    const push = vi.fn();
    vi.mocked(nav).useRouter = (() => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() })) as any;

    const buckets = [{ id: "b1", name: "Bucket 1" }, { id: "b2", name: "Bucket 2" }];
    const { container } = render(<BucketFilter buckets={buckets} selected={""} />);

    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: "b2" } });

    expect(push).toHaveBeenCalledWith("/current?bucketId=b2");
  });
});
