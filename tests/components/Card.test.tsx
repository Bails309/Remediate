import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../../components/Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<Card className="test-class">Hello</Card>);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("test-class");
  });

  it("spreads extra props", () => {
    render(<Card data-testid="custom-card">Test</Card>);
    expect(screen.getByTestId("custom-card")).toBeInTheDocument();
  });
});
