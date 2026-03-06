import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";

describe("prisma integration", () => {
  it("can query database", async () => {
    const res = await prisma.$queryRaw`SELECT 1 as one`;
    // Prisma returns array-like, check presence
    expect(res).toBeDefined();
  });
});
