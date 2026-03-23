import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientDate } from "../../components/ClientDate";

// Mock requestAnimationFrame for mount detection
const origRAF = global.requestAnimationFrame;
const origCAF = global.cancelAnimationFrame;

beforeAll(() => {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  global.cancelAnimationFrame = vi.fn();
});

afterAll(() => {
  global.requestAnimationFrame = origRAF;
  global.cancelAnimationFrame = origCAF;
});

describe("ClientDate", () => {
  it("shows loading placeholder before mount", () => {
    // Temporarily block mount
    global.requestAnimationFrame = (() => 1) as any;
    render(<ClientDate date="2024-01-15T10:30:00Z" />);
    expect(screen.getByText("...")).toBeInTheDocument();
    // Restore
    global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  });

  it("renders fallback for null date", () => {
    render(<ClientDate date={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders custom fallback for null date", () => {
    render(<ClientDate date={null} fallback="N/A" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders formatted date for valid input", () => {
    render(<ClientDate date="2024-06-15T14:30:00Z" />);
    // After mount, should show a formatted date string (en-GB locale)
    const span = screen.getByText(/2024/);
    expect(span).toBeInTheDocument();
  });

  it("renders fallback for invalid date string", () => {
    render(<ClientDate date="not-a-date" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<ClientDate date="2024-01-01" className="custom" />);
    expect(container.querySelector(".custom")).not.toBeNull();
  });
});
