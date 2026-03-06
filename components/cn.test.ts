import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn utility", () => {
    it("merges basic tailwind classes", () => {
        expect(cn("p-2 text-white", "bg-red-500")).toBe("p-2 text-white bg-red-500");
    });

    it("resolves tailwind conflicts correctly using tailwind-merge", () => {
        expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
        expect(cn("p-4", "p-8")).toBe("p-8");
    });

    it("handles conditional classes correctly", () => {
        expect(cn("text-base", true && "font-bold", false && "underline")).toBe("text-base font-bold");
    });

    it("handles arrays and nested arrays of classes", () => {
        expect(cn("flex", ["items-center", "justify-center"])).toBe("flex items-center justify-center");
    });
});
