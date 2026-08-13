import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BrandIcon, hasBrandIcon } from "@/components/BrandIcon";

describe("BrandIcon", () => {
  it("reports which technologies have a brand mark", () => {
    expect(hasBrandIcon("Citrix")).toBe(true);
    expect(hasBrandIcon("VPN Appliances")).toBe(false);
  });

  it("renders the brand svg with an accessible label", () => {
    const { container, getByLabelText } = render(<BrandIcon technology="Apache / Log4j" />);
    expect(container.querySelector("path")).not.toBeNull();
    expect(getByLabelText("Apache")).toBeDefined();
  });

  it("falls back to currentColor for brand colours that are too dark", () => {
    const { container } = render(<BrandIcon technology="Atlassian Confluence" />);
    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
  });

  it("keeps a legible brand colour", () => {
    const { container } = render(<BrandIcon technology="Containers / Kubernetes" />);
    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("#326CE5");
  });

  it("renders nothing without a brand mark", () => {
    const { container } = render(<BrandIcon technology="Databases" />);
    expect(container.firstChild).toBeNull();
  });
});
