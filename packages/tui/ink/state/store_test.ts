import { RingBuffer, TuiStore, type Alert, type SessionInfo } from "./store.ts";

function assertEquals<T>(actual: T, expected: T): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson} but got ${actualJson}`);
  }
}

function assertTrue(actual: boolean, message = ""): void {
  if (!actual) {
    throw new Error(message || `Expected true but got ${actual}`);
  }
}

function createMockSpan(overrides: Partial<{
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  kind: number;
  startTime: string;
  endTime: string;
  attributes: Record<string, unknown>;
  status: { code: number; description?: string };
}> = {}): {
  traceId: string;
  spanId: string;
  parentSpanId: string | undefined;
  name: string;
  kind: number;
  startTime: string;
  endTime: string;
  attributes: Record<string, unknown>;
  status: { code: number; description?: string };
} {
  return {
    traceId: "test-trace-1",
    spanId: "span-1",
    parentSpanId: undefined,
    name: "test-span",
    kind: 1,
    startTime: "2025-04-10T10:00:00.000Z",
    endTime: "2025-04-10T10:00:00.050Z",
    attributes: { "session.id": "session-1", "tool.name": "test-tool" },
    status: { code: 1 },
    ...overrides,
  };
}

Deno.test("RingBuffer should start empty", () => {
  const buffer = new RingBuffer<string>(5);
  assertEquals(buffer.size, 0);
  assertEquals(buffer.getAll(), []);
});

Deno.test("RingBuffer should push items and increase size", () => {
  const buffer = new RingBuffer<string>(3);
  buffer.push("a");
  assertEquals(buffer.size, 1);
  assertEquals(buffer.getAll(), ["a"]);
});

Deno.test("RingBuffer should push beyond capacity and evict oldest", () => {
  const buffer = new RingBuffer<string>(3);
  buffer.push("a");
  buffer.push("b");
  buffer.push("c");
  assertEquals(buffer.size, 3);
  assertEquals(buffer.getAll(), ["a", "b", "c"]);

  // Push a 4th item, should evict "a"
  buffer.push("d");
  assertEquals(buffer.size, 3);
  assertEquals(buffer.getAll(), ["b", "c", "d"]);
});

Deno.test("RingBuffer should evict multiple items when pushing beyond capacity", () => {
  const buffer = new RingBuffer<number>(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);
  buffer.push(5);
  assertEquals(buffer.size, 3);
  assertEquals(buffer.getAll(), [3, 4, 5]);
});

Deno.test("RingBuffer getAll() should return all items", () => {
  const buffer = new RingBuffer<string>(5);
  buffer.push("a");
  buffer.push("b");
  buffer.push("c");
  assertEquals(buffer.getAll(), ["a", "b", "c"]);
});

Deno.test("RingBuffer getAll() should return a copy, not the original buffer", () => {
  const buffer = new RingBuffer<string>(5);
  buffer.push("a");
  const retrieved = buffer.getAll();
  retrieved.push("b");
  assertEquals(buffer.size, 1);
});

Deno.test("RingBuffer getLatest() should return latest n items", () => {
  const buffer = new RingBuffer<number>(5);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);
  buffer.push(5);
  assertEquals(buffer.getLatest(2), [4, 5]);
});

Deno.test("RingBuffer getLatest() should return all items if n >= size", () => {
  const buffer = new RingBuffer<number>(5);
  buffer.push(1);
  buffer.push(2);
  assertEquals(buffer.getLatest(10), [1, 2]);
});

Deno.test("RingBuffer getLatest() should return all items if n equals buffer size", () => {
  const buffer = new RingBuffer<number>(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  assertEquals(buffer.getLatest(3), [1, 2, 3]);
});

Deno.test("RingBuffer getLatest() should return empty array when buffer is empty", () => {
  const buffer = new RingBuffer<number>(5);
  assertEquals(buffer.getLatest(3), []);
});

Deno.test("RingBuffer should report correct size", () => {
  const buffer = new RingBuffer<string>(10);
  assertEquals(buffer.size, 0);
  buffer.push("a");
  assertEquals(buffer.size, 1);
  buffer.push("b");
  assertEquals(buffer.size, 2);
});

Deno.test("RingBuffer should clear all items", () => {
  const buffer = new RingBuffer<string>(3);
  buffer.push("a");
  buffer.push("b");
  buffer.push("c");
  assertEquals(buffer.size, 3);
  buffer.clear();
  assertEquals(buffer.size, 0);
  assertEquals(buffer.getAll(), []);
});

Deno.test("RingBuffer should handle capacity of 1", () => {
  const buffer = new RingBuffer<string>(1);
  buffer.push("a");
  assertEquals(buffer.size, 1);
  assertEquals(buffer.getAll(), ["a"]);
  buffer.push("b");
  assertEquals(buffer.size, 1);
  assertEquals(buffer.getAll(), ["b"]);
});

Deno.test("TuiStore should start with disconnected state", () => {
  const store = new TuiStore();
  assertEquals(store.getState().connectionState, "disconnected");
});

Deno.test("TuiStore should start with no active session", () => {
  const store = new TuiStore();
  assertEquals(store.getState().activeSessionId, null);
});

Deno.test("TuiStore should start with empty sessions", () => {
  const store = new TuiStore();
  assertEquals(store.getState().sessions, []);
});

Deno.test("TuiStore should start with empty spans buffer", () => {
  const store = new TuiStore();
  assertEquals(store.getState().spans.size, 0);
});

Deno.test("TuiStore should start with initial metrics", () => {
  const store = new TuiStore();
  const metrics = store.getState().metrics;
  assertEquals(metrics.totalSpans, 0);
  assertEquals(metrics.successCount, 0);
  assertEquals(metrics.errorCount, 0);
  assertEquals(metrics.toolCounts, {});
  assertEquals(metrics.latencyBuckets, [0, 0, 0, 0, 0]);
});

Deno.test("TuiStore should start with no active filters", () => {
  const store = new TuiStore();
  assertEquals(store.getState().activeFilters, []);
});

Deno.test("TuiStore should start with no active alerts", () => {
  const store = new TuiStore();
  assertEquals(store.getActiveAlerts(), []);
});

Deno.test("TuiStore setConnectionState should update connection state", () => {
  const store = new TuiStore();
  store.setConnectionState("connecting");
  assertEquals(store.getState().connectionState, "connecting");
  store.setConnectionState("connected");
  assertEquals(store.getState().connectionState, "connected");
});

Deno.test("TuiStore addSpan should add span to buffer", () => {
  const store = new TuiStore();
  const span = createMockSpan();
  store.addSpan(span);
  assertEquals(store.getState().spans.size, 1);
});

Deno.test("TuiStore addSpan should increment totalSpans metric", () => {
  const store = new TuiStore();
  const span = createMockSpan();
  store.addSpan(span);
  assertEquals(store.getState().metrics.totalSpans, 1);
});

Deno.test("TuiStore addSpan should update successCount when status.code is 1", () => {
  const store = new TuiStore();
  const span = createMockSpan({ status: { code: 1 } });
  store.addSpan(span);
  assertEquals(store.getState().metrics.successCount, 1);
});

Deno.test("TuiStore addSpan should update errorCount when status.code is 2", () => {
  const store = new TuiStore();
  const span = createMockSpan({ status: { code: 2 } });
  store.addSpan(span);
  assertEquals(store.getState().metrics.errorCount, 1);
});

Deno.test("TuiStore addSpan should track tool counts", () => {
  const store = new TuiStore();
  const span1 = createMockSpan({ attributes: { "tool.name": "test-tool" } });
  const span2 = createMockSpan({ attributes: { "tool.name": "test-tool" } });
  const span3 = createMockSpan({ attributes: { "tool.name": "other-tool" } });
  store.addSpan(span1);
  store.addSpan(span2);
  store.addSpan(span3);
  const toolCounts = store.getState().metrics.toolCounts;
  assertEquals(toolCounts["test-tool"], 2);
  assertEquals(toolCounts["other-tool"], 1);
});

Deno.test("TuiStore addSpan should update latency buckets", () => {
  const store = new TuiStore();

  // Latency < 10ms -> bucket 0
  const span1 = createMockSpan({ startTime: "2025-04-10T10:00:00.000Z", endTime: "2025-04-10T10:00:00.005Z" });
  store.addSpan(span1);
  assertEquals(store.getState().metrics.latencyBuckets[0], 1);

  // Latency 10-50ms -> bucket 1
  const span2 = createMockSpan({ startTime: "2025-04-10T10:00:00.000Z", endTime: "2025-04-10T10:00:00.030Z" });
  store.addSpan(span2);
  assertEquals(store.getState().metrics.latencyBuckets[1], 1);

  // Latency 50-100ms -> bucket 2
  const span3 = createMockSpan({ startTime: "2025-04-10T10:00:00.000Z", endTime: "2025-04-10T10:00:00.080Z" });
  store.addSpan(span3);
  assertEquals(store.getState().metrics.latencyBuckets[2], 1);

  // Latency 100-500ms -> bucket 3
  const span4 = createMockSpan({ startTime: "2025-04-10T10:00:00.000Z", endTime: "2025-04-10T10:00:00.300Z" });
  store.addSpan(span4);
  assertEquals(store.getState().metrics.latencyBuckets[3], 1);

  // Latency >= 500ms -> bucket 4
  const span5 = createMockSpan({ startTime: "2025-04-10T10:00:00.000Z", endTime: "2025-04-10T10:00:01.000Z" });
  store.addSpan(span5);
  assertEquals(store.getState().metrics.latencyBuckets[4], 1);
});

Deno.test("TuiStore getSpansForSession should filter spans by session.id", () => {
  const store = new TuiStore();
  const span1 = createMockSpan({ attributes: { "session.id": "session-1" } });
  const span2 = createMockSpan({ attributes: { "session.id": "session-2" } });
  const span3 = createMockSpan({ attributes: { "session.id": "session-1" } });
  store.addSpan(span1);
  store.addSpan(span2);
  store.addSpan(span3);
  const sessionSpans = store.getSpansForSession("session-1");
  assertEquals(sessionSpans.length, 2);
});

Deno.test("TuiStore alert eq operator should trigger when values match", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "eq", value: "test-span", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  const alerts = store.getActiveAlerts();
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].ruleId, "rule-1");
});

Deno.test("TuiStore alert eq operator should not trigger when values don't match", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "eq", value: "other-span", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert neq operator should trigger when values differ", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "neq", value: "other-span", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 1);
});

Deno.test("TuiStore alert neq operator should not trigger when values match", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "neq", value: "test-span", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert contains operator should trigger when field contains value", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "contains", value: "test", enabled: true });

  const span = createMockSpan({ name: "my-test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 1);
});

Deno.test("TuiStore alert contains operator should not trigger when field doesn't contain value", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "contains", value: "xyz", enabled: true });

  const span = createMockSpan({ name: "my-test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert matches operator should trigger when regex matches", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "matches", value: "^test-.*$", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 1);
});

Deno.test("TuiStore alert matches operator should not trigger when regex doesn't match", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "matches", value: "^other-.*$", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert matches operator should handle invalid regex gracefully", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "matches", value: "[invalid", enabled: true });

  const span = createMockSpan({ name: "test-span" });
  // Should not throw
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert gt operator should trigger when field value is greater", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "attributes.count", operator: "gt", value: 5, enabled: true });

  const span = createMockSpan({ attributes: { "session.id": "session-1", "tool.name": "test", count: 10 } });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 1);
});

Deno.test("TuiStore alert gt operator should not trigger when field value is not greater", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "attributes.count", operator: "gt", value: 10, enabled: true });

  const span = createMockSpan({ attributes: { "session.id": "session-1", "tool.name": "test", count: 5 } });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert lt operator should trigger when field value is less", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "attributes.count", operator: "lt", value: 10, enabled: true });

  const span = createMockSpan({ attributes: { "session.id": "session-1", "tool.name": "test", count: 5 } });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 1);
});

Deno.test("TuiStore alert lt operator should not trigger when field value is not less", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "attributes.count", operator: "lt", value: 5, enabled: true });

  const span = createMockSpan({ attributes: { "session.id": "session-1", "tool.name": "test", count: 10 } });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert should not trigger for disabled rules", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "name", operator: "eq", value: "test-span", enabled: false });

  const span = createMockSpan({ name: "test-span" });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert should not trigger when field does not exist", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.alertRules.push({ id: "rule-1", field: "nonexistent.field", operator: "eq", value: "value", enabled: true });

  const span = createMockSpan();
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 0);
});

Deno.test("TuiStore alert should support nested field access", () => {
  const store = new TuiStore();
  const state = store.getState();
  // Use a truly nested attribute object, not a dot-separated key
  state.alertRules.push({ id: "rule-1", field: "attributes.nested.value", operator: "eq", value: "test-value", enabled: true });

  const span = createMockSpan({ attributes: { "session.id": "session-1", nested: { value: "test-value" } } });
  store.addSpan(span);
  assertEquals(store.getActiveAlerts().length, 1);
});

Deno.test("TuiStore setSessions should update sessions list", () => {
  const store = new TuiStore();
  const sessions: SessionInfo[] = [
    { id: "s1", goal: "test goal", status: "pending", createdAt: "2025-01-01", updatedAt: "2025-01-01" },
  ];
  store.setSessions(sessions);
  assertEquals(store.getState().sessions, sessions);
});

Deno.test("TuiStore setSessions should replace existing sessions", () => {
  const store = new TuiStore();
  store.setSessions([{ id: "s1", goal: "goal 1", status: "pending", createdAt: "2025-01-01", updatedAt: "2025-01-01" }]);
  store.setSessions([{ id: "s2", goal: "goal 2", status: "completed", createdAt: "2025-01-02", updatedAt: "2025-01-02" }]);
  assertEquals(store.getState().sessions.length, 1);
  assertEquals(store.getState().sessions[0].id, "s2");
});

Deno.test("TuiStore setActiveSession should set active session id", () => {
  const store = new TuiStore();
  store.setActiveSession("session-123");
  assertEquals(store.getState().activeSessionId, "session-123");
});

Deno.test("TuiStore setActiveSession should allow setting active session to null", () => {
  const store = new TuiStore();
  store.setActiveSession("session-123");
  store.setActiveSession(null);
  assertEquals(store.getState().activeSessionId, null);
});

Deno.test("TuiStore addFilter should add filter", () => {
  const store = new TuiStore();
  store.addFilter("tool.name=test");
  assertEquals(store.getState().activeFilters, ["tool.name=test"]);
});

Deno.test("TuiStore addFilter should not add duplicate filter", () => {
  const store = new TuiStore();
  store.addFilter("tool.name=test");
  store.addFilter("tool.name=test");
  assertEquals(store.getState().activeFilters.length, 1);
});

Deno.test("TuiStore removeFilter should remove filter", () => {
  const store = new TuiStore();
  store.addFilter("tool.name=test");
  store.addFilter("status=error");
  store.removeFilter("tool.name=test");
  assertEquals(store.getState().activeFilters, ["status=error"]);
});

Deno.test("TuiStore removeFilter should handle removing non-existent filter", () => {
  const store = new TuiStore();
  store.addFilter("tool.name=test");
  store.removeFilter("nonexistent");
  assertEquals(store.getState().activeFilters, ["tool.name=test"]);
});

Deno.test("TuiStore acknowledgeAlert should mark alert as acknowledged", () => {
  const store = new TuiStore();
  const state = store.getState();
  const alert: Alert = {
    id: "alert-1",
    ruleId: "rule-1",
    message: "Test alert",
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };
  state.triggeredAlerts.push(alert);

  store.acknowledgeAlert("alert-1");
  assertEquals(store.getActiveAlerts().length, 0);
  assertEquals(store.getState().triggeredAlerts[0].acknowledged, true);
});

Deno.test("TuiStore acknowledgeAlert should handle acknowledging non-existent alert", () => {
  const store = new TuiStore();
  // Should not throw
  store.acknowledgeAlert("nonexistent-id");
  assertTrue(true);
});

Deno.test("TuiStore getSpansForSession should return spans filtered by session id", () => {
  const store = new TuiStore();
  const span1 = createMockSpan({ attributes: { "session.id": "session-1" } });
  const span2 = createMockSpan({ attributes: { "session.id": "session-2" } });
  const span3 = createMockSpan({ attributes: { "session.id": "session-1" } });
  store.addSpan(span1);
  store.addSpan(span2);
  store.addSpan(span3);
  const spans = store.getSpansForSession("session-1");
  assertEquals(spans.length, 2);
});

Deno.test("TuiStore getSpansForSession should return empty array when no spans match session", () => {
  const store = new TuiStore();
  const span = createMockSpan({ attributes: { "session.id": "session-1" } });
  store.addSpan(span);
  assertEquals(store.getSpansForSession("nonexistent-session").length, 0);
});

Deno.test("TuiStore getActiveAlerts should return only unacknowledged alerts", () => {
  const store = new TuiStore();
  const state = store.getState();
  state.triggeredAlerts.push({
    id: "alert-1",
    ruleId: "rule-1",
    message: "Alert 1",
    timestamp: new Date().toISOString(),
    acknowledged: false,
  });
  state.triggeredAlerts.push({
    id: "alert-2",
    ruleId: "rule-1",
    message: "Alert 2",
    timestamp: new Date().toISOString(),
    acknowledged: true,
  });
  const activeAlerts = store.getActiveAlerts();
  assertEquals(activeAlerts.length, 1);
  assertEquals(activeAlerts[0].id, "alert-1");
});
