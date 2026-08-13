import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CountryFlag } from "@/components/CountryFlag";

describe("CountryFlag", () => {
  it("renders a flag for an attributed country", () => {
    const { container } = render(<CountryFlag country="China" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders nothing for an unmapped country", () => {
    const { container } = render(<CountryFlag country="Atlantis" />);
    expect(container.firstChild).toBeNull();
  });
});
