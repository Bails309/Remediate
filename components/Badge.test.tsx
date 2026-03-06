import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

describe("Badge Component", () => {
    it("renders with default neutral tone", () => {
        render(<Badge>Default Badge</Badge>);
        const badge = screen.getByText("Default Badge");
        expect(badge).toBeDefined();
        expect(badge.className).toContain("bg-[color:var(--color-muted)]");
    });

    it("renders with critical tone", () => {
        render(<Badge tone="critical">Critical Badge</Badge>);
        const badge = screen.getByText("Critical Badge");
        expect(badge.className).toContain("bg-[#3a0f0f]");
        expect(badge.className).toContain("text-[#ffb4a4]");
    });

    it("renders with high tone", () => {
        render(<Badge tone="high">High Badge</Badge>);
        const badge = screen.getByText("High Badge");
        expect(badge.className).toContain("bg-[#3a240f]");
        expect(badge.className).toContain("text-[#ffc07a]");
    });

    it("applies base classes to all variants", () => {
        render(<Badge tone="low">Low Badge</Badge>);
        const badge = screen.getByText("Low Badge");
        expect(badge.className).toContain("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide");
    });
});
