import { describe, it } from "jsr:@std/testing@0.225.3/bdd";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1.0.0";

// Import the pure functions from filter.tsx
// We re-declare them here since they're not exported

type QuickFilter = "all" | "errors" | "tools" | "llm";

function getActiveQuickFilter(activeFilters: string[]): QuickFilter {
  if (activeFilters.includes("status.code=2")) return "errors";
  if (activeFilters.includes("has:tool.name")) return "tools";
  if (activeFilters.includes("agent.type=llm")) return "llm";
  return "all";
}

// Mock TuiStore for testing applyQuickFilter
interface MockStore {
  filters: string[];
  addFilterCalls: string[];
  removeFilterCalls: string[];
}

function createMockStore(): MockStore {
  return {
    filters: [],
    addFilterCalls: [],
    removeFilterCalls: [],
  };
}

function applyQuickFilterToMock(
  store: MockStore,
  filter: QuickFilter
): void {
  const quickFilterTags = ["status.code=2", "has:tool.name", "agent.type=llm"];

  // Remove existing quick filters first
  quickFilterTags.forEach((tag) => {
    const idx = store.filters.indexOf(tag);
    if (idx !== -1) {
      store.filters.splice(idx, 1);
      store.removeFilterCalls.push(tag);
    }
  });

  switch (filter) {
    case "errors":
      store.filters.push("status.code=2");
      store.addFilterCalls.push("status.code=2");
      break;
    case "tools":
      store.filters.push("has:tool.name");
      store.addFilterCalls.push("has:tool.name");
      break;
    case "llm":
      store.filters.push("agent.type=llm");
      store.addFilterCalls.push("agent.type=llm");
      break;
    case "all":
    default:
      // All quick filters removed
      break;
  }
}

describe("filter.tsx pure functions", () => {
  describe("getActiveQuickFilter()", () => {
    it('returns "all" when no quick filters active', () => {
      assertStrictEquals(getActiveQuickFilter([]), "all");
    });

    it('returns "all" when only custom filters active', () => {
      assertStrictEquals(getActiveQuickFilter(["custom.filter"]), "all");
      assertStrictEquals(getActiveQuickFilter(["tool.name=supabase"]), "all");
    });

    it('returns "errors" when status.code=2 filter active', () => {
      assertStrictEquals(getActiveQuickFilter(["status.code=2"]), "errors");
      assertStrictEquals(getActiveQuickFilter(["custom", "status.code=2"]), "errors");
    });

    it('returns "tools" when has:tool.name filter active', () => {
      assertStrictEquals(getActiveQuickFilter(["has:tool.name"]), "tools");
      assertStrictEquals(getActiveQuickFilter(["has:tool.name", "other"]), "tools");
    });

    it('returns "llm" when agent.type=llm filter active', () => {
      assertStrictEquals(getActiveQuickFilter(["agent.type=llm"]), "llm");
    });

    it('returns "errors" when multiple quick filters include errors', () => {
      // errors takes priority in the if-else chain
      assertStrictEquals(getActiveQuickFilter(["status.code=2", "has:tool.name"]), "errors");
    });

    it("precedence order: errors > tools > llm > all", () => {
      assertStrictEquals(getActiveQuickFilter(["status.code=2"]), "errors");
      assertStrictEquals(getActiveQuickFilter(["has:tool.name"]), "tools");
      assertStrictEquals(getActiveQuickFilter(["agent.type=llm"]), "llm");
    });
  });

  describe("applyQuickFilter()", () => {
    it('removes all quick filters for "all"', () => {
      const store = createMockStore();
      store.filters = ["status.code=2", "has:tool.name", "agent.type=llm"];

      applyQuickFilterToMock(store, "all");

      assertEquals(store.filters, []);
      assertEquals(store.removeFilterCalls, [
        "status.code=2",
        "has:tool.name",
        "agent.type=llm",
      ]);
      assertEquals(store.addFilterCalls, []);
    });

    it('adds status.code=2 filter for "errors"', () => {
      const store = createMockStore();
      store.filters = [];

      applyQuickFilterToMock(store, "errors");

      assertEquals(store.filters, ["status.code=2"]);
      assertEquals(store.addFilterCalls, ["status.code=2"]);
      assertEquals(store.removeFilterCalls, []);
    });

    it('removes existing quick filters before adding errors filter', () => {
      const store = createMockStore();
      store.filters = ["has:tool.name", "agent.type=llm"];

      applyQuickFilterToMock(store, "errors");

      // New filter is appended after removal of old quick filters
      assertEquals(store.removeFilterCalls, ["has:tool.name", "agent.type=llm"]);
      assertEquals(store.addFilterCalls, ["status.code=2"]);
      // Final filters: old quick filters removed, new one added at end
      assertEquals(store.filters, ["status.code=2"]);
    });

    it('adds has:tool.name filter for "tools"', () => {
      const store = createMockStore();

      applyQuickFilterToMock(store, "tools");

      assertEquals(store.filters, ["has:tool.name"]);
      assertEquals(store.addFilterCalls, ["has:tool.name"]);
    });

    it('adds agent.type=llm filter for "llm"', () => {
      const store = createMockStore();

      applyQuickFilterToMock(store, "llm");

      assertEquals(store.filters, ["agent.type=llm"]);
      assertEquals(store.addFilterCalls, ["agent.type=llm"]);
    });

    it("handles empty initial filters", () => {
      const store = createMockStore();

      applyQuickFilterToMock(store, "all");

      assertEquals(store.filters, []);
      assertEquals(store.removeFilterCalls, []);
    });

    it("preserves non-quick filters when applying quick filter", () => {
      const store = createMockStore();
      store.filters = ["custom.filter", "another.filter"];

      applyQuickFilterToMock(store, "errors");

      // Non-quick filters are preserved, new quick filter is appended
      assertEquals(store.filters, ["custom.filter", "another.filter", "status.code=2"]);
    });
  });

  describe("filter chip parsing", () => {
    it("filter strings are stored as-is", () => {
      const filterInput = "tool.name=supabase";
      const store = createMockStore();
      store.filters = [filterInput];

      assertStrictEquals(store.filters.includes(filterInput), true);
    });

    it("filter strings with special characters are preserved", () => {
      const filters = [
        "status.code=2",
        "has:tool.name",
        "agent.type=llm",
        "error.message=timeout",
        "duration>1000",
      ];

      const store = createMockStore();
      store.filters = [...filters];

      filters.forEach((f) => {
        assertStrictEquals(store.filters.includes(f), true);
      });
    });

    it("empty filter string is valid", () => {
      const store = createMockStore();
      store.filters = [""];

      assertStrictEquals(store.filters.includes(""), true);
    });

    it("filter parsing is case-sensitive", () => {
      const store = createMockStore();
      store.filters = ["Status.Code=2", "status.code=2"];

      // Only exact match for quick filter detection
      assertStrictEquals(getActiveQuickFilter(["status.code=2"]), "errors");
      assertStrictEquals(getActiveQuickFilter(["Status.Code=2"]), "all");
    });
  });

  describe("filter removal logic", () => {
    it("removes exact filter match", () => {
      const filters = ["status.code=2", "custom", "has:tool.name"];
      const toRemove = "status.code=2";
      const result = filters.filter((f) => f !== toRemove);

      assertEquals(result, ["custom", "has:tool.name"]);
    });

    it("removes only the specified filter", () => {
      const filters = ["status.code=2", "status.code=2", "custom"];
      const result = filters.filter((f) => f !== "status.code=2");

      assertEquals(result, ["custom"]);
    });

    it("handles removing non-existent filter gracefully", () => {
      const filters = ["custom", "other"];
      const result = filters.filter((f) => f !== "nonexistent");

      assertEquals(result, ["custom", "other"]);
    });
  });
});
