import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast, subscribeToToasts, type ToastRecord } from "../../lib/toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  // Dismiss all to clean up state between tests
  toast.dismiss();
  vi.runAllTimers();
  vi.useRealTimers();
});

describe("toast", () => {
  it("enqueues a success toast", () => {
    const toasts: ToastRecord[] = [];
    const unsub = subscribeToToasts((t) => { toasts.length = 0; toasts.push(...t); });

    toast.success("Done!");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].variant).toBe("success");
    expect(toasts[0].message).toBe("Done!");
    expect(toasts[0].closing).toBe(false);

    unsub();
  });

  it("enqueues an error toast", () => {
    const toasts: ToastRecord[] = [];
    const unsub = subscribeToToasts((t) => { toasts.length = 0; toasts.push(...t); });

    toast.error("Fail");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].variant).toBe("error");

    unsub();
  });

  it("enqueues an info toast", () => {
    const toasts: ToastRecord[] = [];
    const unsub = subscribeToToasts((t) => { toasts.length = 0; toasts.push(...t); });

    toast.info("FYI");
    expect(toasts).toHaveLength(1);
    expect(toasts[0].variant).toBe("info");

    unsub();
  });

  it("auto-dismisses after 4 seconds", () => {
    const toasts: ToastRecord[] = [];
    const unsub = subscribeToToasts((t) => { toasts.length = 0; toasts.push(...t); });

    toast.success("Auto dismiss");
    expect(toasts).toHaveLength(1);

    // After 4s, closing animation starts
    vi.advanceTimersByTime(4000);
    expect(toasts[0].closing).toBe(true);

    // After another 220ms, toast is removed
    vi.advanceTimersByTime(220);
    expect(toasts).toHaveLength(0);

    unsub();
  });

  it("dismisses a specific toast by id", () => {
    const toasts: ToastRecord[] = [];
    const unsub = subscribeToToasts((t) => { toasts.length = 0; toasts.push(...t); });

    const id = toast.success("First");
    toast.success("Second");
    expect(toasts).toHaveLength(2);

    toast.dismiss(id);
    // Should be marked as closing
    const first = toasts.find(t => t.id === id);
    expect(first?.closing).toBe(true);

    vi.advanceTimersByTime(220);
    expect(toasts).toHaveLength(1);

    unsub();
  });

  it("dismisses all toasts when no id provided", () => {
    const toasts: ToastRecord[] = [];
    const unsub = subscribeToToasts((t) => { toasts.length = 0; toasts.push(...t); });

    toast.success("A");
    toast.error("B");
    expect(toasts).toHaveLength(2);

    toast.dismiss();
    expect(toasts.every(t => t.closing)).toBe(true);

    vi.advanceTimersByTime(220);
    expect(toasts).toHaveLength(0);

    unsub();
  });

  it("unsubscribes correctly", () => {
    let callCount = 0;
    const unsub = subscribeToToasts(() => { callCount++; });
    // Initial call from subscribe
    expect(callCount).toBe(1);

    toast.success("Test");
    expect(callCount).toBe(2);

    unsub();
    toast.success("After unsub");
    expect(callCount).toBe(2); // should not increment
  });
});
