import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatCard } from "../../components/StatCard";

describe("StatCard", () => {
  it("renders label and value", () => {
    render(<StatCard label="Critical" value={42} />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("applies critical tone color", () => {
    const { container } = render(<StatCard label="Crit" value={5} tone="critical" />);
    const valueEl = container.querySelector(".text-\\[\\#E11D48\\]");
    expect(valueEl).not.toBeNull();
  });

  it("applies high tone color", () => {
    const { container } = render(<StatCard label="High" value={10} tone="high" />);
    const valueEl = container.querySelector(".text-\\[\\#EA580C\\]");
    expect(valueEl).not.toBeNull();
  });

  it("applies medium tone color", () => {
    const { container } = render(<StatCard label="Med" value={3} tone="medium" />);
    const valueEl = container.querySelector(".text-\\[\\#D97706\\]");
    expect(valueEl).not.toBeNull();
  });

  it("applies low tone color", () => {
    const { container } = render(<StatCard label="Low" value={1} tone="low" />);
    const valueEl = container.querySelector(".text-\\[\\#2563EB\\]");
    expect(valueEl).not.toBeNull();
  });

  it("uses neutral tone by default", () => {
    const { container } = render(<StatCard label="Info" value={0} />);
    const neutralEl = container.querySelector(".text-4xl");
    expect(neutralEl?.className).toContain("text-slate-900");
  });

  it("renders icon when provided", () => {
    const MockIcon = ({ size }: { size: number }) => <span data-testid="icon">{size}</span>;
    render(<StatCard label="Test" value={1} icon={MockIcon} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});
