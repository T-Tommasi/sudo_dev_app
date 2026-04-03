/**
 * Unit tests for action trace system
 */

import { assertEquals } from "jsr:@std/assert@0.217.0";
import { getDb, resetDb } from "./db.ts";
import {
  AsyncIterableSpanExporter,
  DatabaseSpanExporter,
  getActionTracesBySession,
  getActionTracesByCheckpoint,
  deleteActionTracesBySession,
} from "./action_trace.ts";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";

// Test database path
const TEST_DB_PATH = "./data/test_action_trace.db";

/**
 * Setup test database with session and checkpoint
 */
function setupTestDb(): { sessionId: string; checkpointId: string | null } {
  resetDb();
  const db = getDb(TEST_DB_PATH);
  
  // Create a test session
  const sessionId = `session_${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO sessions (id, goal, status, created_at, updated_at)
    VALUES (?, ?, 'pending', datetime('now'), datetime('now'))
  `);
  stmt.run(sessionId, "Test goal for action trace");
  stmt.finalize();
  
  return { sessionId, checkpointId: null };
}

/**
 * Cleanup test database
 */
function cleanupTestDb(): void {
  try {
    Deno.removeSync("./data/test_action_trace.db");
  } catch {
    // Ignore if file doesn't exist
  }
  resetDb();
}

/**
 * Mock span for testing - uses type assertion to avoid complex OTel type requirements
 */
function createMockSpan(spanId: string, traceId: string, sessionId: string): ReadableSpan {
  return {
    spanContext: () => ({
      spanId,
      traceId,
      traceFlags: 0,
      traceState: undefined as never,
    }),
    parentSpanId: undefined,
    name: "test_span",
    kind: 0,
    startTime: [Date.now() * 1_000_000, 0],
    endTime: [Date.now() * 1_000_000 + 1000000, 0],
    attributes: {
      "agent.name": "test_agent",
      "agent.role": "orchestrator",
      "action.type": "llm_call",
      "session.id": sessionId,
      "trace.id": traceId,
      "action.input": { prompt: "test" },
      "action.output": { response: "test response" },
      "status": "success",
    },
    status: {
      code: 0,
      description: undefined,
    },
    links: [],
    events: [],
    duration: [0, 0],
    ended: true,
    resource: {} as never,
    instrumentationLibrary: {} as never,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  } as unknown as ReadableSpan;
}

Deno.test("AsyncIterableSpanExporter - exports spans successfully", () => {
  const exporter = new AsyncIterableSpanExporter();
  
  const mockSpan = createMockSpan("span_123", "trace_abc", "session_1");
  
  let exported = false;
  exporter.export([mockSpan], (result) => {
    exported = result.code === 0; // ExportResultCode.SUCCESS
  });
  
  assertEquals(exported, true);
});

Deno.test("AsyncIterableSpanExporter - streams spans via async iterator", async () => {
  const exporter = new AsyncIterableSpanExporter();
  
  const mockSpan1 = createMockSpan("span_1", "trace_1", "session_1");
  const mockSpan2 = createMockSpan("span_2", "trace_1", "session_1");
  
  exporter.export([mockSpan1, mockSpan2], () => {});
  
  const spans: ReadableSpan[] = [];
  for await (const span of exporter) {
    spans.push(span);
    if (spans.length >= 2) break;
  }
  
  assertEquals(spans.length, 2);
});

Deno.test("AsyncIterableSpanExporter - shutdown closes stream", async () => {
  const exporter = new AsyncIterableSpanExporter();
  
  await exporter.shutdown();
  
  assertEquals(exporter.isShutdown(), true);
});

Deno.test("DatabaseSpanExporter - persists spans to database", () => {
  const { sessionId } = setupTestDb();
  const exporter = new DatabaseSpanExporter();
  
  const mockSpan = createMockSpan("span_xyz", "trace_xyz", sessionId);
  
  let exported = false;
  exporter.export([mockSpan], (result) => {
    exported = result.code === 0;
  });
  
  assertEquals(exported, true);
  
  // Verify the trace was stored
  const traces = getActionTracesBySession(sessionId);
  assertEquals(traces.length, 1);
  assertEquals(traces[0].id, "span_xyz");
  assertEquals(traces[0].sessionId, sessionId);
  assertEquals(traces[0].actionType, "llm_call");
  
  cleanupTestDb();
});

Deno.test("DatabaseSpanExporter - handles export failure gracefully", () => {
  const exporter = new DatabaseSpanExporter();
  
  // Export with invalid data should not crash
  // The exporter handles errors internally
  exporter.export([], () => {});
  
  assertEquals(exporter.isShutdown(), false);
});

Deno.test("DatabaseSpanExporter - shutdown prevents further exports", () => {
  const exporter = new DatabaseSpanExporter();
  
  exporter.shutdown();
  
  assertEquals(exporter.isShutdown(), true);
});

Deno.test("getActionTracesBySession - retrieves traces for a session", () => {
  const { sessionId } = setupTestDb();
  const exporter = new DatabaseSpanExporter();
  
  const mockSpan1 = createMockSpan("span_1", "trace_1", sessionId);
  const mockSpan2 = createMockSpan("span_2", "trace_1", sessionId);
  
  exporter.export([mockSpan1, mockSpan2], () => {});
  
  const traces = getActionTracesBySession(sessionId);
  
  assertEquals(traces.length, 2);
  assertEquals(traces[0].actionType, "llm_call");
  assertEquals(traces[1].actionType, "llm_call");
  
  cleanupTestDb();
});

Deno.test("getActionTracesBySession - returns empty array for unknown session", () => {
  setupTestDb();
  
  const traces = getActionTracesBySession("unknown_session");
  
  assertEquals(traces.length, 0);
});

Deno.test("getActionTracesByCheckpoint - retrieves traces for a checkpoint", () => {
  const { sessionId } = setupTestDb();
  const db = getDb(TEST_DB_PATH);
  
  // Create a checkpoint first
  const checkpointId = "cp_test_123";
  const cpStmt = db.prepare(`
    INSERT INTO checkpoints (id, session_id, step_number, state_json, created_at)
    VALUES (?, ?, 1, '{}', datetime('now'))
  `);
  cpStmt.run(checkpointId, sessionId);
  cpStmt.finalize();
  
  const exporter = new DatabaseSpanExporter();
  
  const mockSpan = createMockSpan("span_cp", "trace_cp", sessionId);
  // Add checkpoint ID to attributes
  const spanWithCheckpoint = {
    ...mockSpan,
    attributes: {
      ...mockSpan.attributes,
      "checkpoint.id": checkpointId,
    },
  };
  
  exporter.export([spanWithCheckpoint], () => {});
  
  const traces = getActionTracesByCheckpoint(checkpointId);
  
  assertEquals(traces.length, 1);
  assertEquals(traces[0].checkpointId, checkpointId);
  
  cleanupTestDb();
});

Deno.test("deleteActionTracesBySession - deletes all traces for a session", () => {
  const { sessionId } = setupTestDb();
  const exporter = new DatabaseSpanExporter();
  
  const mockSpan1 = createMockSpan("span_del_1", "trace_del", sessionId);
  const mockSpan2 = createMockSpan("span_del_2", "trace_del", sessionId);
  
  exporter.export([mockSpan1, mockSpan2], () => {});
  
  const deletedCount = deleteActionTracesBySession(sessionId);
  
  assertEquals(deletedCount, 2);
  assertEquals(getActionTracesBySession(sessionId).length, 0);
  
  cleanupTestDb();
});