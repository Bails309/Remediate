import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/current",
  useSearchParams: () => new URLSearchParams(),
}));

import { SiteFilter } from "@/components/SiteFilter";
import * as nav from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SiteFilter", () => {
  it("pushes new siteId in query when changed", () => {
    const push = vi.fn();
    (nav as any).useRouter = () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() });

    const sites = [{ id: "s1", name: "Site 1" }, { id: "s2", name: "Site 2" }];
    const { container } = render(<SiteFilter sites={sites} selected={""} />);

    const select = container.querySelector("select") as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: "s2" } });

    expect(push).toHaveBeenCalledWith("/current?siteId=s2");
  });
});
