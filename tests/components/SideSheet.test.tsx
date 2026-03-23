import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SideSheet } from "../../components/SideSheet";

describe("SideSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <SideSheet open={false} onClose={vi.fn()} title="Test">
        Content
      </SideSheet>
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and content when open", () => {
    render(
      <SideSheet open={true} onClose={vi.fn()} title="Sheet Title">
        <p>Sheet body</p>
      </SideSheet>
    );
    expect(screen.getByText("Sheet Title")).toBeInTheDocument();
    expect(screen.getByText("Sheet body")).toBeInTheDocument();
  });

  it("renders Close button", () => {
    render(
      <SideSheet open={true} onClose={vi.fn()} title="Test">
        Content
      </SideSheet>
    );
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("calls onClose when Close button clicked", () => {
    const onClose = vi.fn();
    render(
      <SideSheet open={true} onClose={onClose} title="Test">
        Content
      </SideSheet>
    );
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when overlay clicked", () => {
    const onClose = vi.fn();
    render(
      <SideSheet open={true} onClose={onClose} title="Test">
        Content
      </SideSheet>
    );
    const overlay = document.querySelector(".bg-black\\/40");
    if (overlay) fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
