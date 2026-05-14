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
  it("pushes new bucketId in query when a single bucket is selected", () => {
    const push = vi.fn();
    vi.mocked(nav).useRouter = (() => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() })) as any;

    const buckets = [{ id: "b1", name: "Bucket 1" }, { id: "b2", name: "Bucket 2" }];
    const { getByRole, getByText } = render(<BucketFilter buckets={buckets} selected={""} />);

    // Open the popover and click the option
    fireEvent.click(getByRole("button"));
    fireEvent.click(getByText("Bucket 2"));

    expect(push).toHaveBeenCalledWith("/current?bucketId=b2");
  });

  it("removes bucket params when the only selected bucket is toggled off", () => {
    const push = vi.fn();
    vi.mocked(nav).useRouter = (() => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() })) as any;
    vi.mocked(nav).useSearchParams = (() => new URLSearchParams("bucketId=b1")) as any;

    const buckets = [{ id: "b1", name: "Bucket 1" }];
    const { getAllByRole, getByRole } = render(<BucketFilter buckets={buckets} selected={"b1"} />);

    // First button is the trigger; click it to open the popover.
    fireEvent.click(getAllByRole("button")[0]);
    // Toggle the already-selected bucket off via its option role.
    fireEvent.click(getByRole("option", { name: /Bucket 1/ }));

    expect(push).toHaveBeenCalledWith("/current");
  });

  it("uses bucketIds (CSV) when multiple buckets are selected", () => {
    const push = vi.fn();
    vi.mocked(nav).useRouter = (() => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() })) as any;
    vi.mocked(nav).useSearchParams = (() => new URLSearchParams("bucketId=b1")) as any;

    const buckets = [{ id: "b1", name: "Bucket 1" }, { id: "b2", name: "Bucket 2" }];
    const { getAllByRole, getByText } = render(<BucketFilter buckets={buckets} selected={"b1"} />);

    fireEvent.click(getAllByRole("button")[0]);
    fireEvent.click(getByText("Bucket 2"));

    expect(push).toHaveBeenCalledWith("/current?bucketIds=b1%2Cb2");
  });
});
