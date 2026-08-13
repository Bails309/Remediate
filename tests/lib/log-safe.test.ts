import { describe, it, expect } from "vitest";
import { forLog } from "@/lib/log-safe";

describe("forLog", () => {
  it("strips CR/LF so a value cannot forge a second log line", () => {
    expect(forLog("upload-1\nFAKE: admin deleted everything")).toBe(
      "upload-1 FAKE: admin deleted everything"
    );
    expect(forLog("a\r\nb")).toBe("a  b");
  });

  it("strips other control characters, including NUL and DEL", () => {
    expect(forLog("a\u0000b\u001Fc\u007Fd")).toBe("a b c d");
  });

  it("escapes % so the value cannot act as a format specifier", () => {
    // Node treats the first console.* argument as a format string; an
    // unescaped %s would consume the next argument.
    expect(forLog("%s%d%j")).toBe("%%s%%d%%j");
  });

  it("caps length so a large value cannot flood the log", () => {
    expect(forLog("x".repeat(500))).toHaveLength(200);
    expect(forLog("x".repeat(500), 10)).toHaveLength(10);
  });

  it("coerces non-strings rather than throwing", () => {
    expect(forLog(42)).toBe("42");
    expect(forLog(null)).toBe("null");
    expect(forLog(undefined)).toBe("undefined");
  });
});
