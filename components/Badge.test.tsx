import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

describe("Badge Component", () => {
    it("renders with default neutral tone", () => {
        render(<Badge>Default Badge</Badge>);
        const badge = screen.getByText("Default Badge");
        expect(badge).toBeDefined();
        expect(badge.className).toContain("inline-flex");
        expect(badge.className).toContain("rounded-full");
    });

    it("renders with critical tone", () => {
        render(<Badge tone="critical">Critical Badge</Badge>);
        const badge = screen.getByText("Critical Badge");
        expect(badge.className).toContain("text-red-600");
        expect(badge.className).toContain("bg-red-500/10");
    });

    it("renders with high tone", () => {
        render(<Badge tone="high">High Badge</Badge>);
        const badge = screen.getByText("High Badge");
        expect(badge.className).toContain("text-orange-600");
        expect(badge.className).toContain("bg-orange-500/10");
    });

    it("applies base classes to all variants", () => {
        render(<Badge tone="low">Low Badge</Badge>);
        const badge = screen.getByText("Low Badge");
        expect(badge.className).toContain("inline-flex");
        expect(badge.className).toContain("px-2.5");
    });
});
