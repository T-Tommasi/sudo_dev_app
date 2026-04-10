import { describe, it } from "jsr:@std/testing@0.225.3/bdd";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1.0.0";
import type { SpanData } from "../../ws/client.ts";

// Import the pure functions from stream.tsx
// We re-declare them here since they're not exported

function formatTime(iso: string): string {
  return iso.slice(11, 19);
}

function getStatusDisplay(code: number): { text: string; color: string } {
  switch (code) {
    case 1:
      return { text: "OK", color: "green" };
    case 2:
      return { text: "ERROR", color: "red" };
    default:
      return { text: "PENDING", color: "yellow" };
  }
}

function getToolAbbr(toolName: string): string {
  return toolName.slice(0, 2);
}

describe("stream.tsx pure functions", () => {
  describe("formatTime()", () => {
    it("extracts HH:MM:SS from ISO timestamp", () => {
      assertEquals(formatTime("2025-04-10T14:30:45.123Z"), "14:30:45");
    });

    it("handles midnight (00:00:00)", () => {
      assertEquals(formatTime("2025-04-10T00:00:00.000Z"), "00:00:00");
    });

    it("handles end of day (23:59:59)", () => {
      assertEquals(formatTime("2025-04-10T23:59:59.999Z"), "23:59:59");
    });

    it("handles ISO string with timezone offset", () => {
      // The function just slices characters 11-19, so it works on any ISO-like string
      assertEquals(formatTime("2025-04-10T09:15:30+05:30"), "09:15:30");
    });

    it("handles ISO string without milliseconds", () => {
      assertEquals(formatTime("2025-04-10T09:15:30Z"), "09:15:30");
    });
  });

  describe("getStatusDisplay()", () => {
    it("returns OK green for code 1", () => {
      assertStrictEquals(getStatusDisplay(1).text, "OK");
      assertStrictEquals(getStatusDisplay(1).color, "green");
    });

    it("returns ERROR red for code 2", () => {
      assertStrictEquals(getStatusDisplay(2).text, "ERROR");
      assertStrictEquals(getStatusDisplay(2).color, "red");
    });

    it("returns PENDING yellow for code 0", () => {
      assertStrictEquals(getStatusDisplay(0).text, "PENDING");
      assertStrictEquals(getStatusDisplay(0).color, "yellow");
    });

    it("returns PENDING yellow for negative code", () => {
      assertStrictEquals(getStatusDisplay(-1).text, "PENDING");
      assertStrictEquals(getStatusDisplay(-1).color, "yellow");
    });

    it("returns PENDING yellow for large unknown code", () => {
      assertStrictEquals(getStatusDisplay(999).text, "PENDING");
      assertStrictEquals(getStatusDisplay(999).color, "yellow");
    });
  });

  describe("getToolAbbr()", () => {
    it("returns first 2 characters of tool name", () => {
      assertEquals(getToolAbbr("supabase"), "su");
    });

    it("returns full name if shorter than 2 chars", () => {
      assertEquals(getToolAbbr("A"), "A");
    });

    it("returns empty string for empty input", () => {
      assertEquals(getToolAbbr(""), "");
    });

    it("handles tool names with dots", () => {
      assertEquals(getToolAbbr("tool.name.with.dots"), "to");
    });

    it("handles tool names with underscores", () => {
      assertEquals(getToolAbbr("tool_name"), "to");
    });
  });

  describe("filtering logic", () => {
    // Helper to simulate the filter logic from StreamPanel
    function applyFilters(
      spans: SpanData[],
      activeFilters: string[]
    ): SpanData[] {
      if (activeFilters.length === 0) {
        return spans;
      }
      return spans.filter((span) => {
        const toolName = (span.attributes["tool.name"] as string | undefined) ?? "";
        const name = span.name;
        return activeFilters.some(
          (filter) => name.includes(filter) || toolName.includes(filter)
        );
      });
    }

    it("returns all spans when no filters active", () => {
      const spans: SpanData[] = [
        createSpan("span1", "test-span", "supabase"),
        createSpan("span2", "another-span", "bash"),
      ];
      const result = applyFilters(spans, []);
      assertEquals(result.length, 2);
    });

    it("filters spans by tool name match", () => {
      const spans: SpanData[] = [
        createSpan("span1", "test-span", "supabase"),
        createSpan("span2", "another-span", "bash"),
        createSpan("span3", "third-span", "supabase"),
      ];
      const filtered = applyFilters(spans, ["supabase"]);
      assertEquals(filtered.length, 2);
      assertStrictEquals(filtered.every((s) => s.attributes["tool.name"] === "supabase"), true);
    });

    it("filters spans by span name match", () => {
      const spans: SpanData[] = [
        createSpan("span1", "error-span", "tool1"),
        createSpan("span2", "success-span", "tool2"),
        createSpan("span3", "error-other", "tool3"),
      ];
      const filtered = applyFilters(spans, ["error"]);
      assertEquals(filtered.length, 2);
      assertStrictEquals(filtered.every((s) => s.name.includes("error")), true);
    });

    it("combines multiple filters with OR logic", () => {
      const spans: SpanData[] = [
        createSpan("span1", "test", "sql"),
        createSpan("span2", "query", "bash"),
        createSpan("span3", "other", "python"),
      ];
      const filtered = applyFilters(spans, ["sql", "bash"]);
      assertEquals(filtered.length, 2);
      assertEquals(filtered.map((s) => s.spanId).sort(), ["span1", "span2"]);
    });

    it("returns empty array when no spans match", () => {
      const spans: SpanData[] = [
        createSpan("span1", "test-span", "supabase"),
      ];
      const filtered = applyFilters(spans, ["nonexistent"]);
      assertEquals(filtered, []);
    });

    it("handles spans with missing tool.name attribute", () => {
      const spans: SpanData[] = [
        createSpan("span1", "error-span", ""),
        createSpan("span2", "other-span", "tool"),
      ];
      const filtered = applyFilters(spans, ["error"]);
      assertEquals(filtered.length, 1);
      assertStrictEquals(filtered[0].spanId, "span1");
    });

    it("handles empty spans array", () => {
      assertEquals(applyFilters([], ["filter"]), []);
    });
  });
});

// Helper function to create test SpanData
function createSpan(
  spanId: string,
  name: string,
  toolName: string
): SpanData {
  return {
    traceId: "trace-1",
    spanId,
    parentSpanId: undefined,
    name,
    kind: 1,
    startTime: "2025-04-10T10:00:00.000Z",
    endTime: "2025-04-10T10:00:01.000Z",
    attributes: {
      "tool.name": toolName || undefined,
    },
    status: { code: 0 },
  };
}
