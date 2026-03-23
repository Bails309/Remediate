import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "../../components/Dialog";

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Dialog open={false} onClose={vi.fn()} title="Test">
        Content
      </Dialog>
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and content when open", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} title="My Dialog">
        Dialog body
      </Dialog>
    );
    expect(screen.getByText("My Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
  });

  it("renders default Cancel and Confirm buttons", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} title="Test">
        Content
      </Dialog>
    );
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("renders custom footer", () => {
    render(
      <Dialog open={true} onClose={vi.fn()} title="Test" footer={<button>Custom</button>}>
        Content
      </Dialog>
    );
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).not.toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Test">
        Content
      </Dialog>
    );
    // The backdrop is the first absolute inset-0 div inside the outer container
    const backdrop = document.querySelector(".bg-slate-950\\/40");
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = vi.fn();
    render(
      <Dialog open={true} onClose={onClose} title="Test">
        Content
      </Dialog>
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
