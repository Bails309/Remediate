import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InfoTooltip } from "../../components/InfoTooltip";

describe("InfoTooltip", () => {
  it("renders the info button with aria-label", () => {
    render(<InfoTooltip text="Help text" />);
    expect(screen.getByRole("button", { name: "Help text" })).toBeInTheDocument();
  });

  it("does not show tooltip by default", () => {
    render(<InfoTooltip text="Help text" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows tooltip on mouse enter", () => {
    render(<InfoTooltip text="Help text" />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Help text")).toBeInTheDocument();
  });

  it("hides tooltip on mouse leave", () => {
    render(<InfoTooltip text="Help text" />);
    const button = screen.getByRole("button");
    fireEvent.mouseEnter(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows tooltip on focus", () => {
    render(<InfoTooltip text="Focus text" />);
    const button = screen.getByRole("button");
    fireEvent.focus(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("hides tooltip on blur", () => {
    render(<InfoTooltip text="Blur text" />);
    const button = screen.getByRole("button");
    fireEvent.focus(button);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.blur(button);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<InfoTooltip text="Test" className="extra" />);
    expect(container.firstChild).toHaveClass("extra");
  });
});
