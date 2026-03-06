import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, vi } from "vitest";

import { Select } from "@/components/Select";

describe("Select component", () => {
  it("renders placeholder, opens menu, and selects option", async () => {
    const options = [
      { label: "One", value: "1" },
      { label: "Two", value: "2" },
      { label: "Disabled", value: "d", disabled: true },
    ];

    const handleChange = vi.fn();

    render(<Select options={options} value={""} onChange={handleChange} placeholder="Choose" />);

    // Button shows placeholder
    const btn = screen.getByRole("button");
    expect(btn).toBeTruthy();
    expect(btn).toHaveTextContent("Choose");

    // Open menu
    fireEvent.click(btn);

    // Options should be visible as both <option> and menu <button>; ensure menu buttons exist
    const ones = screen.getAllByText("One");
    expect(ones.some((el) => el.tagName === "BUTTON")).toBe(true);
    const twos = screen.getAllByText("Two");
    expect(twos.some((el) => el.tagName === "BUTTON")).toBe(true);
    const disableds = screen.getAllByText("Disabled");
    expect(disableds.some((el) => el.tagName === "BUTTON")).toBe(true);

    // Click enabled option (the menu button)
    const twoBtn = twos.find((el) => el.tagName === "BUTTON")! as HTMLElement;
    fireEvent.click(twoBtn);
    expect(handleChange).toHaveBeenCalledWith("2");

    // Clicking disabled option should not call handler
    const disabledBtn = disableds.find((el) => el.tagName === "BUTTON")! as HTMLElement;
    fireEvent.click(disabledBtn);
    expect(handleChange).toHaveBeenCalledTimes(1);
  });
});
