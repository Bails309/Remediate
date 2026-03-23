import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../../components/EmptyState";

describe("EmptyState", () => {
  it("renders title", () => {
    render(<EmptyState title="No data found" />);
    expect(screen.getByText("No data found")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="Empty" description="Nothing to show here" />);
    expect(screen.getByText("Nothing to show here")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    const { container } = render(<EmptyState title="Empty" />);
    const descriptions = container.querySelectorAll(".text-sm");
    expect(descriptions).toHaveLength(0);
  });

  it("renders icon when provided", () => {
    render(<EmptyState title="Empty" icon={<span data-testid="icon">!</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<EmptyState title="Empty" className="extra-class" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toContain("extra-class");
  });
});
