import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("UploadsClient error handling", () => {
  it("shows toast error when startUpload called with no selection", async () => {
    const { toast } = await import("sonner");
    const spy = vi.spyOn(toast, "error").mockImplementation(() => ({} as any));

    render(<UploadsClient initialSites={[]} initialUploads={[]} />);

    const btn = screen.getByText("Start Upload");
    fireEvent.click(btn);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
