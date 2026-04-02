import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { FeedbackButton } from "@/components/FeedbackButton";
import { toast } from "@/lib/toast";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("FeedbackButton", () => {
  it("renders the feedback button", () => {
    const { getByTitle } = render(<FeedbackButton />);
    expect(getByTitle("Send Feedback")).toBeDefined();
  });

  it("opens dialog when clicked", () => {
    const { getByTitle, getByText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    expect(getByText("Send Feedback")).toBeDefined();
    expect(getByText("Bug Report")).toBeDefined();
    expect(getByText("Feature Request")).toBeDefined();
    expect(getByText("General")).toBeDefined();
  });

  it("closes dialog when backdrop is clicked", () => {
    const { getByTitle, queryByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    // Click the backdrop (the absolute overlay div)
    const backdrop = document.querySelector(".absolute.inset-0.bg-slate-950\\/40");
    if (backdrop) fireEvent.click(backdrop);
    expect(queryByPlaceholderText("Describe your feedback...")).toBeNull();
  });

  it("disables submit when message is too short", () => {
    const { getByTitle, getByText, getByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    const textarea = getByPlaceholderText("Describe your feedback...");
    fireEvent.change(textarea, { target: { value: "Hi" } });
    const submit = getByText("Submit");
    expect(submit).toBeDisabled();
  });

  it("submits feedback and shows success toast", async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);

    const { getByTitle, getByText, getByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    
    const textarea = getByPlaceholderText("Describe your feedback...");
    fireEvent.change(textarea, { target: { value: "This is a valid feedback message" } });
    
    fireEvent.click(getByText("Submit"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/feedback", expect.objectContaining({
        method: "POST",
      }));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Feedback submitted — thank you!");
    });
  });

  it("shows error toast on submission failure", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    } as Response);

    const { getByTitle, getByText, getByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    
    const textarea = getByPlaceholderText("Describe your feedback...");
    fireEvent.change(textarea, { target: { value: "This is a valid feedback message" } });
    
    fireEvent.click(getByText("Submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Server error");
    });
  });

  it("shows error toast on network failure", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

    const { getByTitle, getByText, getByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    
    const textarea = getByPlaceholderText("Describe your feedback...");
    fireEvent.change(textarea, { target: { value: "This is a valid feedback message" } });
    
    fireEvent.click(getByText("Submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to submit feedback");
    });
  });

  it("sends correct type when type button is clicked", async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) } as Response);

    const { getByTitle, getByText, getByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    
    // Click "Bug Report" type
    fireEvent.click(getByText("Bug Report"));
    
    const textarea = getByPlaceholderText("Describe your feedback...");
    fireEvent.change(textarea, { target: { value: "This is a bug report message" } });
    
    fireEvent.click(getByText("Submit"));

    await waitFor(() => {
      const call = vi.mocked(global.fetch).mock.calls[0];
      const body = JSON.parse(call[1]?.body as string);
      expect(body.type).toBe("bug");
      expect(body.page).toBe("/dashboard");
    });
  });

  it("closes dialog when X button is clicked", () => {
    const { getByTitle, queryByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    // Find the close X button by its parent having the class
    const closeButton = document.querySelector("button.rounded-full");
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);
    expect(queryByPlaceholderText("Describe your feedback...")).toBeNull();
  });

  it("shows fallback error when res.json() throws", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error("parse error")),
    } as Response);

    const { getByTitle, getByText, getByPlaceholderText } = render(<FeedbackButton />);
    fireEvent.click(getByTitle("Send Feedback"));
    const textarea = getByPlaceholderText("Describe your feedback...");
    fireEvent.change(textarea, { target: { value: "This is a valid feedback message" } });
    fireEvent.click(getByText("Submit"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to submit feedback");
    });
  });
});
