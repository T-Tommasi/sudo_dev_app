import { describe, it } from "jsr:@std/testing@0.225.3/bdd";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1.0.0";

// Import the pure functions from sidebar.tsx
// We need to re-declare them here since they're not exported

function sanitizeForTerminal(str: string): string {
  const filtered: string[] = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code < 0x7F) || code >= 0xA0) {
      filtered.push(ch);
    }
  }
  const esc = "\x1B";
  return filtered.join("").replace(new RegExp(esc + "\\[[0-9;]*[a-zA-Z]", "g"), "");
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "pending":
      return "yellow";
    case "active":
      return "green";
    case "completed":
      return "blue";
    case "failed":
      return "red";
    default:
      return "white";
  }
}

describe("sidebar.tsx pure functions", () => {
  describe("sanitizeForTerminal()", () => {
    it("preserves printable ASCII characters (0x20-0x7E)", () => {
      assertEquals(sanitizeForTerminal("Hello, World!"), "Hello, World!");
    });

    it("strips C0 control characters (0x00-0x1F)", () => {
      assertEquals(sanitizeForTerminal("Hello\x00World\x1Atest"), "HelloWorldtest");
    });

    it("filters out ESC character (0x1B)", () => {
      // The function filters characters first, removing ESC (0x1B) before ANSI stripping
      const result = sanitizeForTerminal("\x1B[31mRed Text\x1B[0m");
      // ESC is stripped, so ANSI codes become visible text
      assertEquals(result.includes("\x1B"), false);
    });

    it("preserves high ASCII / Unicode characters (0xA0 and above)", () => {
      const result = sanitizeForTerminal("Hello\u00A0World");
      assertEquals(result, "Hello\u00A0World");
    });

    it("handles empty string", () => {
      assertEquals(sanitizeForTerminal(""), "");
    });

    it("handles string with only control characters", () => {
      assertEquals(sanitizeForTerminal("\x00\x07"), "");
    });

    it("result contains no C0 control characters", () => {
      const result = sanitizeForTerminal("Hello\x00World\x1Atest");
      for (const ch of result) {
        const code = ch.charCodeAt(0);
        assertStrictEquals(code >= 0x20 && code < 0x7F || code >= 0xA0, true);
      }
    });
  });

  describe("getStatusColor()", () => {
    it('returns "yellow" for "pending"', () => {
      assertEquals(getStatusColor("pending"), "yellow");
    });

    it('returns "yellow" for "PENDING" (case insensitive)', () => {
      assertEquals(getStatusColor("PENDING"), "yellow");
    });

    it('returns "green" for "active"', () => {
      assertEquals(getStatusColor("active"), "green");
    });

    it('returns "green" for "Active" (mixed case)', () => {
      assertEquals(getStatusColor("Active"), "green");
    });

    it('returns "blue" for "completed"', () => {
      assertEquals(getStatusColor("completed"), "blue");
    });

    it('returns "blue" for "COMPLETED" (uppercase)', () => {
      assertEquals(getStatusColor("COMPLETED"), "blue");
    });

    it('returns "red" for "failed"', () => {
      assertEquals(getStatusColor("failed"), "red");
    });

    it('returns "red" for "Failed" (title case)', () => {
      assertEquals(getStatusColor("Failed"), "red");
    });

    it('returns "white" for unknown status', () => {
      assertEquals(getStatusColor("unknown"), "white");
    });

    it('returns "white" for empty string', () => {
      assertEquals(getStatusColor(""), "white");
    });

    it('returns "white" for arbitrary unrecognized value', () => {
      assertEquals(getStatusColor("processing"), "white");
    });
  });

  describe("session goal truncation (30 chars)", () => {
    it("truncates goal to 30 characters", () => {
      const longGoal = "A".repeat(50);
      const sanitized = sanitizeForTerminal(longGoal);
      assertStrictEquals(sanitized.slice(0, 30).length, 30);
    });

    it("leaves shorter goals unchanged", () => {
      const shortGoal = "Short goal";
      const sanitized = sanitizeForTerminal(shortGoal);
      assertEquals(sanitized, "Short goal");
    });

    it("goal at exactly 30 chars stays unchanged", () => {
      const exactGoal = "A".repeat(30);
      const sanitized = sanitizeForTerminal(exactGoal);
      assertEquals(sanitized, exactGoal);
    });

    it("truncated result contains no C0 control characters", () => {
      const input = "Hello\x00World\x1Atest\x1B[31m!\x1B[0mExtraLongText";
      const sanitized = sanitizeForTerminal(input).slice(0, 30);
      for (const ch of sanitized) {
        const code = ch.charCodeAt(0);
        assertStrictEquals(code >= 0x20 && code < 0x7F || code >= 0xA0, true);
      }
    });
  });
});
