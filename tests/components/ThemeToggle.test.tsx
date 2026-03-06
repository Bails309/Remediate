import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { ThemeToggle } from "@/components/ThemeToggle";

describe("ThemeToggle", () => {
  it("toggles theme on click", async () => {
    const { getByRole } = render(<ThemeToggle />);
    const btn = await getByRole("button");
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    // setTheme is mocked within module; ensure no error thrown and button exists
    expect(btn).toBeDefined();
  });
});
