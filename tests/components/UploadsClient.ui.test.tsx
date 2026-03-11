import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { UploadsClient } from "@/app/(app)/uploads/uploads-client";

describe("UploadsClient UI", () => {
  it("renders headings and empty states with no uploads", () => {
    render(<UploadsClient initialSites={[]} initialUploads={[]} />);

    expect(screen.getByText("CSV Uploads")).toBeDefined();
    expect(screen.getByText("Recent Uploads")).toBeDefined();
    // Progress area should show EmptyState text
    expect(screen.getByText("No upload in progress")).toBeDefined();
    // Recent uploads empty state
    expect(screen.getByText("No uploads yet")).toBeDefined();
  });
});
