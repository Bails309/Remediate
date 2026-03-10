import { describe, it, expect, vi, beforeEach } from "vitest";

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
  },
}));

import * as queue from "@/lib/queue";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queue operations", () => {
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
});
