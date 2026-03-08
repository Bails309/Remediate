import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./Button";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

describe("Button Component", () => {
    it("renders children correctly", () => {
        render(<Button>Click Me</Button>);
        expect(screen.getByRole("button", { name: "Click Me" })).toBeDefined();
    });

    it("applies primary variant by default", () => {
        render(<Button>Primary</Button>);
        const button = screen.getByRole("button", { name: "Primary" });
        expect(button.className).toContain("bg-[color:var(--color-accent)]");
        expect(button.className).toContain("text-white");
    });

    it("applies outline variant correctly", () => {
        render(<Button variant="outline">Outline</Button>);
        const button = screen.getByRole("button", { name: "Outline" });
        expect(button.className).toContain("border-slate-300");
    });

    it("applies ghost variant correctly", () => {
        render(<Button variant="ghost">Ghost</Button>);
        const button = screen.getByRole("button", { name: "Ghost" });
        expect(button.className).toContain("text-[color:var(--color-foreground)]");
        expect(button.className).toContain("hover:bg-[color:var(--color-muted)]");
        expect(button.className).not.toContain("border");
    });

    it("accepts custom className and merges it correctly", () => {
        render(<Button className="custom-class">Custom</Button>);
        const button = screen.getByRole("button", { name: "Custom" });
        expect(button.className).toContain("custom-class");
        expect(button.className).toContain("inline-flex"); // Merges with base classes
    });

    it("passes native HTML attributes like 'disabled'", () => {
        render(<Button disabled>Disabled Button</Button>);
        const button = screen.getByRole("button", { name: "Disabled Button" }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(button.className).toContain("disabled:opacity-60");
    });

    it("triggers onClick handler when clicked", async () => {
        const onClickMock = vi.fn();
        render(<Button onClick={onClickMock}>Clickable</Button>);

        const button = screen.getByRole("button", { name: "Clickable" });
        await userEvent.click(button);

        expect(onClickMock).toHaveBeenCalledTimes(1);
    });
});
