import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark" }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", props),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import { signOut } from "next-auth/react";

vi.mock("@/components/FeedbackButton", () => ({
  FeedbackButton: () => React.createElement("button", { "data-testid": "feedback" }, "Feedback"),
}));

import { Sidebar } from "@/components/Sidebar";

const baseSession = {
  user: {
    name: "Test User",
    email: "test@example.com",
    roles: ["web_app_user"],
  },
};

describe("Sidebar", () => {
  it("renders workspace navigation links", () => {
    const { getByText, getByRole, getAllByText } = render(<Sidebar session={baseSession as any} />);
    expect(getByText("Vulnerabilities")).toBeDefined();
    fireEvent.mouseEnter(getByRole("button", { name: /Insights/i }));
    expect(getAllByText("Command Centre").length).toBeGreaterThan(0);
    expect(getAllByText("Analytics").length).toBeGreaterThan(0);
  });

  it("shows user name and role", () => {
    const { getByText } = render(<Sidebar session={baseSession as any} />);
    expect(getByText("Test User")).toBeDefined();
    expect(getByText("web_app_user")).toBeDefined();
  });

  it("renders sign out button", () => {
    const { getByText } = render(<Sidebar session={baseSession as any} />);
    expect(getByText("Sign Out")).toBeDefined();
  });

  it("renders feedback button", () => {
    const { getByTestId } = render(<Sidebar session={baseSession as any} />);
    expect(getByTestId("feedback")).toBeDefined();
  });

  it("shows admin section for site_admin", () => {
    const adminSession = { user: { name: "Admin", email: "admin@test.com", roles: ["site_admin"] } };
    const { getAllByText } = render(<Sidebar session={adminSession as any} />);
    expect(getAllByText("Settings").length).toBeGreaterThan(0);
  });

  it("hides admin section for regular users", () => {
    const { queryAllByText } = render(<Sidebar session={baseSession as any} />);
    expect(queryAllByText("Settings").length).toBe(0);
  });

  it("gives workspace admins inventory and automation but not settings", () => {
    const workspaceAdmin = { user: { name: "WS Admin", email: "ws@test.com", roles: ["web_app_admin"] } };
    const { getByRole, queryByRole } = render(<Sidebar session={workspaceAdmin as any} />);
    expect(getByRole("button", { name: /Inventory/i })).toBeDefined();
    expect(getByRole("button", { name: /Automation/i })).toBeDefined();
    expect(queryByRole("button", { name: /^Settings$/i })).toBeNull();
  });

  it("shows tools section for toolkit_user", () => {
    const toolSession = { user: { name: "Tool User", email: "tool@test.com", roles: ["toolkit_user"] } };
    const { getByRole, getAllByText } = render(<Sidebar session={toolSession as any} />);
    fireEvent.mouseEnter(getByRole("button", { name: /Intelligence/i }));
    expect(getAllByText("Threat Feed").length).toBeGreaterThan(0);
    expect(getAllByText("Threat Actors").length).toBeGreaterThan(0);
    // Tools now lives in the Inventory flyout
    fireEvent.mouseEnter(getByRole("button", { name: /Inventory/i }));
    expect(getAllByText("Tools").length).toBeGreaterThan(0);
  });

  it("hides tools section for web_app_user only", () => {
    const { queryByText } = render(<Sidebar session={baseSession as any} />);
    expect(queryByText("Intelligence")).toBeNull();
  });

  it("renders without session", () => {
    const { getByText } = render(<Sidebar session={null} />);
    expect(getByText("Vulnerabilities")).toBeDefined();
    expect(getByText("Insights")).toBeDefined();
  });

  it("calls signOut when sign out button is clicked", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({}) as any;
    const { getByText } = render(<Sidebar session={baseSession as any} />);
    fireEvent.click(getByText("Sign Out"));
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });
    global.fetch = originalFetch;
  });

  it("toggles admin expansion on button click", () => {
    const adminSession = { user: { name: "Admin", email: "admin@test.com", roles: ["site_admin"] } };
    const { getByRole } = render(<Sidebar session={adminSession as any} />);
    const adminToggle = getByRole("button", { name: /Settings/i });
    expect(adminToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(adminToggle);
    expect(adminToggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens the settings flyout on hover", () => {
    const adminSession = { user: { name: "Admin", email: "admin@test.com", roles: ["site_admin"] } };
    const { getByRole, getAllByText } = render(<Sidebar session={adminSession as any} />);
    const adminToggle = getByRole("button", { name: /Settings/i });
    fireEvent.mouseEnter(adminToggle);
    expect(getAllByText("Users").length).toBeGreaterThan(0);
  });

  it("keeps the flyout open when clicking after hovering", () => {
    const adminSession = { user: { name: "Admin", email: "admin@test.com", roles: ["site_admin"] } };
    const { getByRole, getAllByText } = render(<Sidebar session={adminSession as any} />);
    const adminToggle = getByRole("button", { name: /Settings/i });
    fireEvent.mouseEnter(adminToggle);
    fireEvent.click(adminToggle);
    fireEvent.mouseLeave(adminToggle);
    expect(getAllByText("Users").length).toBeGreaterThan(0);
  });

  it("opens the inventory flyout with the manual upload pages", () => {
    const adminSession = { user: { name: "Admin", email: "admin@test.com", roles: ["site_admin"] } };
    const { getByRole, getAllByText } = render(<Sidebar session={adminSession as any} />);
    fireEvent.mouseEnter(getByRole("button", { name: /Inventory/i }));
    expect(getAllByText("Nessus CSV").length).toBeGreaterThan(0);
    expect(getAllByText("Pentest PDF").length).toBeGreaterThan(0);
    expect(getAllByText("ACR CSV").length).toBeGreaterThan(0);
  });
});
