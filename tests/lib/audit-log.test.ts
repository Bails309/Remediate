import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("../../lib/prisma", () => ({
  prisma: {
    auditLog: { create: mockCreate },
  },
}));

import { writeAuditLog } from "../../lib/audit-log";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("writeAuditLog", () => {
  const entry = {
    userId: "u1",
    userEmail: "user@test.com",
    action: "test.action",
    entityType: "Test",
    entityId: "e1",
    oldValue: "old",
    newValue: { key: "val" },
    ipAddress: "127.0.0.1",
  };

  it("creates an audit log record with all fields", async () => {
    mockCreate.mockResolvedValue({ id: "log1" });

    await writeAuditLog(entry);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        userEmail: "user@test.com",
        action: "test.action",
        entityType: "Test",
        entityId: "e1",
        oldValue: JSON.stringify("old"),
        newValue: JSON.stringify({ key: "val" }),
        ipAddress: "127.0.0.1",
      },
    });
  });

  it("defaults optional fields to null", async () => {
    mockCreate.mockResolvedValue({ id: "log2" });

    await writeAuditLog({
      userId: "u1",
      userEmail: "user@test.com",
      action: "test.minimal",
      entityType: "Test",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: null,
        oldValue: null,
        newValue: null,
        ipAddress: null,
      }),
    });
  });

  it("never throws even if prisma fails", async () => {
    mockCreate.mockRejectedValue(new Error("DB down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(writeAuditLog(entry)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      "[AuditLog] Failed to write audit entry:",
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
