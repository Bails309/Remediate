import React from "react";
import { render } from "@testing-library/react";
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
    const { getByText } = render(<Sidebar session={baseSession as any} />);
    expect(getByText("Dashboard")).toBeDefined();
    expect(getByText("Analytics")).toBeDefined();
    expect(getByText("Vulnerabilities")).toBeDefined();
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
    const { getByText } = render(<Sidebar session={adminSession as any} />);
    expect(getByText("Administration")).toBeDefined();
  });

  it("hides admin section for regular users", () => {
    const { queryByText } = render(<Sidebar session={baseSession as any} />);
    expect(queryByText("Administration")).toBeNull();
  });

  it("shows tools section for toolkit_user", () => {
    const toolSession = { user: { name: "Tool User", email: "tool@test.com", roles: ["toolkit_user"] } };
    const { getByText } = render(<Sidebar session={toolSession as any} />);
    expect(getByText("Intelligence")).toBeDefined();
    expect(getByText("Tools")).toBeDefined();
  });

  it("hides tools section for web_app_user only", () => {
    const { queryByText } = render(<Sidebar session={baseSession as any} />);
    expect(queryByText("Intelligence")).toBeNull();
  });

  it("renders without session", () => {
    const { getByText } = render(<Sidebar session={null} />);
    expect(getByText("Dashboard")).toBeDefined();
  });
});
