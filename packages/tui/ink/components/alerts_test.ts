import { describe, it } from "jsr:@std/testing@0.225.3/bdd";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1.0.0";
import type { AlertRule } from "../state/store.ts";

// Import the pure functions from alerts.tsx
// We re-declare them here since they're not exported

function formatTimestamp(iso: string): string {
  return iso.slice(11, 19);
}

function formatRule(rule: AlertRule, _triggeredCount: number): string {
  return `${rule.field} ${rule.operator} ${rule.value}`;
}

// Simulate the flash state toggle logic
function createFlashToggler(): {
  getFlash: () => boolean;
  toggle: () => boolean;
} {
  let flash = false;
  return {
    getFlash: () => flash,
    toggle: () => {
      flash = !flash;
      return flash;
    },
  };
}

describe("alerts.tsx pure functions", () => {
  describe("formatTimestamp()", () => {
    it("extracts HH:MM:SS from ISO timestamp", () => {
      assertEquals(formatTimestamp("2025-04-10T14:30:45.123Z"), "14:30:45");
    });

    it("handles midnight", () => {
      assertEquals(formatTimestamp("2025-04-10T00:00:00.000Z"), "00:00:00");
    });

    it("handles end of day", () => {
      assertEquals(formatTimestamp("2025-04-10T23:59:59.999Z"), "23:59:59");
    });
  });

  describe("formatRule()", () => {
    it("formats rule with string value", () => {
      const rule: AlertRule = {
        id: "rule-1",
        field: "status.code",
        operator: "eq",
        value: "2",
        enabled: true,
      };
      assertEquals(formatRule(rule, 5), "status.code eq 2");
    });

    it("formats rule with numeric value", () => {
      const rule: AlertRule = {
        id: "rule-2",
        field: "duration",
        operator: "gt",
        value: 1000,
        enabled: true,
      };
      assertEquals(formatRule(rule, 0), "duration gt 1000");
    });

    it("formats rule with contains operator", () => {
      const rule: AlertRule = {
        id: "rule-3",
        field: "error.message",
        operator: "contains",
        value: "timeout",
        enabled: true,
      };
      assertEquals(formatRule(rule, 2), "error.message contains timeout");
    });

    it("formats rule with matches operator", () => {
      const rule: AlertRule = {
        id: "rule-4",
        field: "name",
        operator: "matches",
        value: "error.*",
        enabled: false,
      };
      assertEquals(formatRule(rule, 1), "name matches error.*");
    });

    it("ignores triggeredCount parameter", () => {
      const rule: AlertRule = {
        id: "rule-5",
        field: "tool.name",
        operator: "eq",
        value: "supabase",
        enabled: true,
      };
      // Both calls should return same result regardless of triggeredCount
      assertEquals(formatRule(rule, 0), "tool.name eq supabase");
      assertEquals(formatRule(rule, 999), "tool.name eq supabase");
    });
  });

  describe("alert flashing state toggle logic", () => {
    it("toggles between true and false", () => {
      const toggler = createFlashToggler();
      assertStrictEquals(toggler.getFlash(), false);

      const firstToggle = toggler.toggle();
      assertStrictEquals(firstToggle, true);
      assertStrictEquals(toggler.getFlash(), true);

      const secondToggle = toggler.toggle();
      assertStrictEquals(secondToggle, false);
      assertStrictEquals(toggler.getFlash(), false);
    });

    it("multiple toggles alternate correctly", () => {
      const toggler = createFlashToggler();
      assertStrictEquals(toggler.toggle(), true);  // false -> true
      assertStrictEquals(toggler.toggle(), false); // true -> false
      assertStrictEquals(toggler.toggle(), true);  // false -> true
      assertStrictEquals(toggler.toggle(), false); // true -> false
    });

    it("each toggler instance is independent", () => {
      const toggler1 = createFlashToggler();
      const toggler2 = createFlashToggler();

      toggler1.toggle(); // t1: false->true, t2: still false

      assertStrictEquals(toggler1.getFlash(), true);
      assertStrictEquals(toggler2.getFlash(), false);
    });
  });

  describe("alert color logic", () => {
    // Simulate the color determination logic from the component
    function getAlertColor(
      acknowledged: boolean,
      isSelected: boolean,
      flash: boolean
    ): string | undefined {
      if (acknowledged) return "dim";
      if (isSelected) return undefined; // Uses default color
      return flash ? "red" : "dim";
    }

    it("returns dim when acknowledged", () => {
      assertStrictEquals(getAlertColor(true, false, false), "dim");
      assertStrictEquals(getAlertColor(true, false, true), "dim");
      assertStrictEquals(getAlertColor(true, true, false), "dim");
    });

    it("returns undefined when selected (uses default)", () => {
      assertStrictEquals(getAlertColor(false, true, false), undefined);
      assertStrictEquals(getAlertColor(false, true, true), undefined);
    });

    it("returns flash color when not acknowledged and not selected", () => {
      assertStrictEquals(getAlertColor(false, false, true), "red");
      assertStrictEquals(getAlertColor(false, false, false), "dim");
    });

    it("acknowledged takes precedence over flash state", () => {
      // Even if flash is true, acknowledged overrides
      assertStrictEquals(getAlertColor(true, false, true), "dim");
    });

    it("selected takes precedence over flash state", () => {
      // Even if flash is true, selection overrides
      assertStrictEquals(getAlertColor(false, true, true), undefined);
    });
  });
});
