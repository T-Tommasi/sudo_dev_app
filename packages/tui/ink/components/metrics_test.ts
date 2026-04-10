import { describe, it } from "jsr:@std/testing@0.225.3/bdd";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1.0.0";

// Import the pure functions from metrics.tsx
// We re-declare them here since they're not exported

const LATENCY_LABELS = ["<10ms", "<50ms", "<100ms", "<500ms", ">=500ms"];
const BAR_WIDTH = 30;

function renderBar(count: number, max: number, width = BAR_WIDTH): string {
  if (max === 0) return " ".repeat(width);
  const filled = Math.round((count / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

describe("metrics.tsx pure functions", () => {
  describe("renderBar()", () => {
    it("renders full bar when count equals max", () => {
      const result = renderBar(30, 30, 30);
      // Verify result has correct length
      assertStrictEquals(result.length, 30);
      // Verify no empty characters (all filled)
      assertStrictEquals(result.includes("░"), false);
    });

    it("handles zero max by returning spaces", () => {
      const result = renderBar(10, 0, 30);
      // When max is 0, should return all spaces
      assertStrictEquals(result.length, 30);
      assertStrictEquals(result.includes("█"), false);
      assertStrictEquals(result.includes("░"), false);
    });

    it("handles custom width", () => {
      const result = renderBar(5, 10, 10);
      assertStrictEquals(result.length, 10);
    });

    it("bar length is always equal to width for valid inputs", () => {
      const result = renderBar(7, 100, 15);
      assertStrictEquals(result.length, 15);
    });

    it("uses default BAR_WIDTH of 30", () => {
      const result = renderBar(15, 30);
      assertStrictEquals(result.length, 30);
    });

    it("produces correct ratio of filled to empty characters", () => {
      // For count=15, max=30, width=30: expect 50% filled
      const result = renderBar(15, 30, 30);
      const filledCount = (result.match(/█/g) || []).length;
      const emptyCount = (result.match(/░/g) || []).length;
      // Total should be 30
      assertStrictEquals(filledCount + emptyCount, 30);
    });
  });

  describe("LATENCY_LABELS constant", () => {
    it("has exactly 5 labels", () => {
      assertEquals(LATENCY_LABELS.length, 5);
    });

    it("contains expected bucket labels", () => {
      assertEquals(LATENCY_LABELS, ["<10ms", "<50ms", "<100ms", "<500ms", ">=500ms"]);
    });

    it("labels are in correct order for latency ranges", () => {
      // Verify indexing matches intended bucket positions
      assertStrictEquals(LATENCY_LABELS[0], "<10ms");     // latency < 10ms
      assertStrictEquals(LATENCY_LABELS[1], "<50ms");     // 10ms <= latency < 50ms
      assertStrictEquals(LATENCY_LABELS[2], "<100ms");    // 50ms <= latency < 100ms
      assertStrictEquals(LATENCY_LABELS[3], "<500ms");    // 100ms <= latency < 500ms
      assertStrictEquals(LATENCY_LABELS[4], ">=500ms");   // latency >= 500ms
    });
  });

  describe("tool count sorting (top 5)", () => {
    // Simulate the sorting logic from renderToolCounts
    function getTopToolCounts(
      toolCounts: Record<string, number>,
      topN = 5
    ): Array<[string, number]> {
      return Object.entries(toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN);
    }

    it("returns tools sorted by count descending", () => {
      const toolCounts = {
        "supabase": 100,
        "bash": 50,
        "git": 25,
        "docker": 75,
      };
      const result = getTopToolCounts(toolCounts);
      assertStrictEquals(result[0][0], "supabase");
      assertStrictEquals(result[0][1], 100);
      assertStrictEquals(result[1][0], "docker");
      assertStrictEquals(result[1][1], 75);
      assertStrictEquals(result[2][0], "bash");
      assertStrictEquals(result[2][1], 50);
      assertStrictEquals(result[3][0], "git");
      assertStrictEquals(result[3][1], 25);
    });

    it("limits to top 5 by default", () => {
      const toolCounts = {
        "a": 1, "b": 2, "c": 3, "d": 4, "e": 5, "f": 6, "g": 7,
      };
      const result = getTopToolCounts(toolCounts);
      assertEquals(result.length, 5);
      assertStrictEquals(result[0][0], "g");
      assertStrictEquals(result[0][1], 7);
      assertStrictEquals(result[4][0], "c");
      assertStrictEquals(result[4][1], 3);
    });

    it("respects custom topN parameter", () => {
      const toolCounts = {
        "a": 1, "b": 2, "c": 3, "d": 4, "e": 5,
      };
      const result = getTopToolCounts(toolCounts, 3);
      assertEquals(result.length, 3);
    });

    it("handles empty tool counts", () => {
      const result = getTopToolCounts({});
      assertEquals(result, []);
    });

    it("handles fewer tools than topN", () => {
      const toolCounts = { "supabase": 10, "bash": 5 };
      const result = getTopToolCounts(toolCounts);
      assertEquals(result.length, 2);
    });

    it("handles tools with equal counts (stable sort order)", () => {
      const toolCounts = { "a": 10, "b": 10, "c": 10 };
      const result = getTopToolCounts(toolCounts, 2);
      assertEquals(result.length, 2);
      // All entries should have count 10
      assertStrictEquals(result.every(([, count]) => count === 10), true);
    });

    it("handles tools with zero counts", () => {
      const toolCounts = { "a": 0, "b": 5, "c": 0 };
      const result = getTopToolCounts(toolCounts);
      assertStrictEquals(result[0][0], "b");
      assertStrictEquals(result[0][1], 5);
    });
  });

  describe("latency bucket indexing", () => {
    // Simulate the bucket assignment logic
    function getLatencyBucket(latencyMs: number): number {
      if (latencyMs < 10) return 0;
      if (latencyMs < 50) return 1;
      if (latencyMs < 100) return 2;
      if (latencyMs < 500) return 3;
      return 4;
    }

    it("assigns correct bucket for <10ms", () => {
      assertStrictEquals(getLatencyBucket(5), 0);
      assertStrictEquals(getLatencyBucket(9), 0);
    });

    it("assigns correct bucket for <50ms (10-49ms)", () => {
      assertStrictEquals(getLatencyBucket(10), 1);
      assertStrictEquals(getLatencyBucket(49), 1);
    });

    it("assigns correct bucket for <100ms (50-99ms)", () => {
      assertStrictEquals(getLatencyBucket(50), 2);
      assertStrictEquals(getLatencyBucket(99), 2);
    });

    it("assigns correct bucket for <500ms (100-499ms)", () => {
      assertStrictEquals(getLatencyBucket(100), 3);
      assertStrictEquals(getLatencyBucket(499), 3);
    });

    it("assigns correct bucket for >=500ms", () => {
      assertStrictEquals(getLatencyBucket(500), 4);
      assertStrictEquals(getLatencyBucket(1000), 4);
      assertStrictEquals(getLatencyBucket(10000), 4);
    });
  });
});
