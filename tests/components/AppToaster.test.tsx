import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock the toast module
const mockToasts = vi.hoisted(() => vi.fn());
vi.mock("../../lib/toast", () => ({
  subscribeToToasts: vi.fn((cb: (toasts: any[]) => void) => {
    mockToasts.mockImplementation(cb);
    cb([]); // initial call
    return vi.fn(); // unsubscribe
  }),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { toast } from "../../lib/toast";
import { AppToaster } from "../../components/AppToaster";

beforeEach(() => vi.clearAllMocks());

describe("AppToaster", () => {
  it("renders empty when no toasts", () => {
    const { container } = render(<AppToaster />);
    expect(container.querySelector(".app-toaster")).not.toBeNull();
    expect(container.querySelectorAll(".app-toast")).toHaveLength(0);
  });

  it("renders toasts from subscription", () => {
    render(<AppToaster />);

    act(() => {
      mockToasts([
        { id: "t1", message: "Saved!", variant: "success", closing: false },
        { id: "t2", message: "Error!", variant: "error", closing: false },
      ]);
    });

    expect(screen.getByText("Saved!")).toBeInTheDocument();
    expect(screen.getByText("Error!")).toBeInTheDocument();
  });

  it("applies variant class correctly", () => {
    render(<AppToaster />);

    act(() => {
      mockToasts([
        { id: "t1", message: "Info", variant: "info", closing: false },
      ]);
    });

    const toastEl = document.querySelector(".app-toast--info");
    expect(toastEl).not.toBeNull();
  });

  it("applies closing class", () => {
    render(<AppToaster />);

    act(() => {
      mockToasts([
        { id: "t1", message: "Closing", variant: "success", closing: true },
      ]);
    });

    const toastEl = document.querySelector(".app-toast--closing");
    expect(toastEl).not.toBeNull();
  });

  it("calls dismiss when close button clicked", () => {
    render(<AppToaster />);

    act(() => {
      mockToasts([
        { id: "t1", message: "Test", variant: "success", closing: false },
      ]);
    });

    const closeBtn = screen.getByLabelText("Dismiss notification");
    fireEvent.click(closeBtn);
    expect(toast.dismiss).toHaveBeenCalledWith("t1");
  });

  it("has aria-live polite for accessibility", () => {
    const { container } = render(<AppToaster />);
    const section = container.querySelector("section");
    expect(section?.getAttribute("aria-live")).toBe("polite");
  });
});
