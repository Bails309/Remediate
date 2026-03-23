import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "../../components/Input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<Input className="custom-input" data-testid="inp" />);
    const input = screen.getByTestId("inp") as HTMLInputElement;
    expect(input.className).toContain("custom-input");
  });

  it("passes through HTML attributes", () => {
    render(<Input type="email" name="email" disabled data-testid="inp" />);
    const input = screen.getByTestId("inp") as HTMLInputElement;
    expect(input.type).toBe("email");
    expect(input.name).toBe("email");
    expect(input.disabled).toBe(true);
  });
});
