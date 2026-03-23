import { describe, it, expect } from "vitest";

describe("/api/health GET", () => {
  it("returns 200 with ok:true", async () => {
    const { GET } = await import("../../app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
