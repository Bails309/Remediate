import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock BullMQ before importing the queue module
const { mockAdd, mockGetJob, mockGetJobs } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockGetJob: vi.fn(),
  mockGetJobs: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(function () {
    return {
      add: mockAdd,
      getJob: mockGetJob,
      getJobs: mockGetJobs,
      name: "{upload-queue}",
    };
  }),
  Worker: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    eval: vi.fn().mockResolvedValue(1),
    del: vi.fn(),
  },
}));

const mockStorageDelete = vi.fn();
vi.mock("@/lib/storage", () => ({
  getStorageProvider: vi.fn(async () => ({
    delete: mockStorageDelete,
  })),
}));

import * as queue from "@/lib/queue";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("queue operations", () => {
  it("getLockKey returns a formatted key", () => {
    expect(queue.getLockKey("site-123")).toBe("{site:site-123}:upload-lock");
  });

  it("enqueueUpload adds job to uploadQueue", async () => {
    await queue.enqueueUpload("u1", "payload-key");
    expect(mockAdd).toHaveBeenCalledWith("u1", { uploadId: "u1", storageKey: "payload-key" }, { jobId: "u1" });
  });

  it("getPayload returns storageKey from job data", async () => {
    mockGetJob.mockResolvedValue({ data: { storageKey: "key-123" } });
    const val = await queue.getPayload("u1");
    expect(val).toBe("key-123");
  });

  it("listDeadLetters returns job IDs from failed queue", async () => {
    mockGetJobs.mockResolvedValue([{ id: "j1" }, { id: "j2" }]);
    const ids = await queue.listDeadLetters(10);
    expect(mockGetJobs).toHaveBeenCalledWith(["failed"], 0, 9, false);
    expect(ids).toEqual(["j1", "j2"]);
  });

  it("getRetryCount returns attemptsMade from job", async () => {
    mockGetJob.mockResolvedValue({ attemptsMade: 3 });
    const attempts = await queue.getRetryCount("u1");
    expect(attempts).toBe(3);
  });

  it("removeDeadLetter calls remove on existing job", async () => {
    const remove = vi.fn(async () => undefined);
    mockGetJob.mockResolvedValue({ remove });
    await queue.removeDeadLetter("u1");
    expect(remove).toHaveBeenCalled();
  });

  it("removeDeadLetters iterates ids and calls removeDeadLetter", async () => {
    const remove = vi.fn(async () => undefined);
    mockGetJob.mockResolvedValue({ remove });
    await queue.removeDeadLetters(["a", "b"]);
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("resetRetry forwards to removeDeadLetter", async () => {
    const remove = vi.fn(async () => undefined);
    mockGetJob.mockResolvedValue({ remove });
    await queue.resetRetry("u1");
    expect(remove).toHaveBeenCalled();
  });

  it("deletePayload deletes the storage key", async () => {
    mockStorageDelete.mockResolvedValue(undefined);
    await queue.deletePayload("u1");
    expect(mockStorageDelete).toHaveBeenCalledWith("nessus-u1.csv");
  });

  it("deletePayload handles storage delete failure gracefully", async () => {
    mockStorageDelete.mockRejectedValue(new Error("Storage unavailable"));
    await expect(queue.deletePayload("u2")).resolves.toBeUndefined();
  });
});

describe("queue proxy handler methods", () => {
  it("set handler sets property on the queue", () => {
    (queue.uploadQueue as any).testProp = 42;
    expect((queue.uploadQueue as any).testProp).toBe(42);
  });

  it("has handler checks property existence", () => {
    expect("add" in queue.uploadQueue).toBe(true);
    expect("nonExistentMethod" in queue.uploadQueue).toBe(false);
  });

  it("ownKeys handler returns keys", () => {
    const keys = Reflect.ownKeys(queue.uploadQueue);
    expect(Array.isArray(keys)).toBe(true);
    expect(keys).toContain("add");
  });

  it("getOwnPropertyDescriptor returns descriptor", () => {
    const desc = Object.getOwnPropertyDescriptor(queue.uploadQueue, "add");
    expect(desc).toBeDefined();
  });
});
