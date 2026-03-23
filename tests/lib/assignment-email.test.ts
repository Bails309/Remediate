import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/email", () => ({
  renderEmailLayout: vi.fn().mockImplementation(({ contentHtml }) => `<html>${contentHtml}</html>`),
}));

import { renderWeeklyAssignmentEmail, type AssignmentItem } from "../../lib/assignment-email";

beforeEach(() => vi.clearAllMocks());

const user = { name: "Alice" };

describe("renderWeeklyAssignmentEmail", () => {
  it("renders email with all risk levels", () => {
    const assignments: AssignmentItem[] = [
      { id: "v1", name: "SQL Injection", risk: "Critical", host: "10.0.0.1", port: "443", status: "Open" },
      { id: "v2", name: "XSS Stored", risk: "High", host: "10.0.0.2", port: "80", status: "InProgress" },
      { id: "v3", name: "Info Disclosure", risk: "Medium", host: "10.0.0.3", port: "8080", status: "Open" },
      { id: "v4", name: "Minor Header", risk: "Low", host: "10.0.0.4", port: "0", status: "Open" },
    ];
    const html = renderWeeklyAssignmentEmail(user, assignments);
    expect(html).toContain("Alice");
    expect(html).toContain("SQL Injection");
    expect(html).toContain("XSS Stored");
    expect(html).toContain("Info Disclosure");
    expect(html).toContain("Minor Header");
    expect(html).toContain("Urgent Action Required");
    expect(html).toContain("High Priority");
    expect(html).toContain("Active Monitoring");
  });

  it("renders critical count correctly", () => {
    const assignments: AssignmentItem[] = [
      { id: "v1", name: "Vuln A", risk: "Critical", host: "10.0.0.1", port: "443", status: "Open" },
      { id: "v2", name: "Vuln B", risk: "Critical", host: "10.0.0.2", port: "443", status: "Open" },
    ];
    const html = renderWeeklyAssignmentEmail(user, assignments);
    // Should show count of 2 for critical
    expect(html).toContain(">2<");
  });

  it("omits sections with no items", () => {
    const assignments: AssignmentItem[] = [
      { id: "v1", name: "Medium Vuln", risk: "Medium", host: "10.0.0.1", port: "80", status: "Open" },
    ];
    const html = renderWeeklyAssignmentEmail(user, assignments);
    expect(html).not.toContain("Urgent Action Required");
    expect(html).not.toContain("High Priority");
    expect(html).toContain("Active Monitoring");
  });

  it("formats port correctly when port is 0", () => {
    const assignments: AssignmentItem[] = [
      { id: "v1", name: "Test", risk: "Low", host: "10.0.0.1", port: "0", status: "Open" },
    ];
    const html = renderWeeklyAssignmentEmail(user, assignments);
    // Port 0 should NOT show ":0"
    expect(html).toContain("10.0.0.1");
    expect(html).not.toContain("10.0.0.1:0");
  });

  it("includes link to vulnerability", () => {
    const assignments: AssignmentItem[] = [
      { id: "v1", name: "Test", risk: "High", host: "10.0.0.1", port: "443", status: "Open" },
    ];
    const html = renderWeeklyAssignmentEmail(user, assignments);
    expect(html).toContain("View Detail");
    expect(html).toContain("vulnerabilities?id=v1");
  });

  it("includes CTA button", () => {
    const assignments: AssignmentItem[] = [
      { id: "v1", name: "Test", risk: "High", host: "10.0.0.1", port: "443", status: "Open" },
    ];
    const html = renderWeeklyAssignmentEmail(user, assignments);
    expect(html).toContain("OPEN COMMAND CENTRE");
    expect(html).toContain("assigneeId=me");
  });
});
