/**
 * Unit tests for checkpoint management
 */

import { assertEquals, assertExists, assertThrows } from "jsr:@std/assert@0.217.0";
import { getDb, resetDb } from "./db.ts";
import {
  createCheckpoint,
  getCheckpoint,
  getCheckpointsBySession,
  getLatestCheckpoint,
  deleteCheckpoint,
  deleteCheckpointsBySession,
  parseCheckpointState,
  type AgentState,
} from "./checkpoint.ts";

// Test database path
const TEST_DB_PATH = "./data/test_checkpoint.db";

/**
 * Setup test database and session
 */
function setupTestDb(): string {
  resetDb();
  const db = getDb(TEST_DB_PATH);
  
  // Create a test session
  const sessionId = `session_${Date.now()}`;
  const stmt = db.prepare(`
    INSERT INTO sessions (id, goal, status, created_at, updated_at)
    VALUES (?, ?, 'pending', datetime('now'), datetime('now'))
  `);
  stmt.run(sessionId, "Test goal for checkpoint");
  stmt.finalize();
  
  return sessionId;
}

/**
 * Cleanup test database
 */
function cleanupTestDb(): void {
  try {
    Deno.removeSync("./data/test_checkpoint.db");
  } catch {
    // Ignore if file doesn't exist
  }
  resetDb();
}

Deno.test({
  name: "createCheckpoint - creates a checkpoint successfully",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: { key: "value" },
    };
    
    const checkpoint = createCheckpoint(sessionId, 1, state);
    
    assertExists(checkpoint.id);
    assertEquals(checkpoint.sessionId, sessionId);
    assertEquals(checkpoint.stepNumber, 1);
    assertEquals(checkpoint.stateJson, JSON.stringify(state));
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "createCheckpoint - throws error for non-existent session",
  fn: () => {
    setupTestDb();
    
    const state: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId: "non_existent_session",
      metadata: {},
    };
    
    assertThrows(
      () => createCheckpoint("non_existent_session", 1, state),
      Error,
      "Session not found",
    );
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "getCheckpoint - retrieves checkpoint by ID",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    const created = createCheckpoint(sessionId, 1, state);
    const retrieved = getCheckpoint(created.id);
    
    assertExists(retrieved);
    assertEquals(retrieved!.id, created.id);
    assertEquals(retrieved!.sessionId, sessionId);
    assertEquals(retrieved!.stepNumber, 1);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "getCheckpoint - returns null for non-existent checkpoint",
  fn: () => {
    setupTestDb();
    
    const result = getCheckpoint("non_existent_checkpoint");
    assertEquals(result, null);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "getCheckpointsBySession - retrieves all checkpoints for a session",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state1: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    const state2: AgentState = {
      goal: "Test goal",
      currentStep: 2,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    createCheckpoint(sessionId, 1, state1);
    createCheckpoint(sessionId, 2, state2);
    
    const checkpoints = getCheckpointsBySession(sessionId);
    
    assertEquals(checkpoints.length, 2);
    assertEquals(checkpoints[0].stepNumber, 1);
    assertEquals(checkpoints[1].stepNumber, 2);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "getLatestCheckpoint - retrieves the most recent checkpoint",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state1: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    const state2: AgentState = {
      goal: "Test goal",
      currentStep: 2,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    createCheckpoint(sessionId, 1, state1);
    createCheckpoint(sessionId, 2, state2);
    
    const latest = getLatestCheckpoint(sessionId);
    
    assertExists(latest);
    assertEquals(latest!.stepNumber, 2);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "getLatestCheckpoint - returns null when no checkpoints exist",
  fn: () => {
    const sessionId = setupTestDb();
    
    const latest = getLatestCheckpoint(sessionId);
    
    assertEquals(latest, null);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "deleteCheckpoint - deletes a checkpoint successfully",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    const checkpoint = createCheckpoint(sessionId, 1, state);
    const deleted = deleteCheckpoint(checkpoint.id);
    
    assertEquals(deleted, true);
    assertEquals(getCheckpoint(checkpoint.id), null);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "deleteCheckpoint - returns false for non-existent checkpoint",
  fn: () => {
    setupTestDb();
    
    const deleted = deleteCheckpoint("non_existent_checkpoint");
    
    assertEquals(deleted, false);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "deleteCheckpointsBySession - deletes all checkpoints for a session",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state: AgentState = {
      goal: "Test goal",
      currentStep: 1,
      maxSteps: 10,
      traceId: "trace_123",
      sessionId,
      metadata: {},
    };
    
    createCheckpoint(sessionId, 1, state);
    createCheckpoint(sessionId, 2, state);
    
    const deletedCount = deleteCheckpointsBySession(sessionId);
    
    assertEquals(deletedCount, 2);
    assertEquals(getCheckpointsBySession(sessionId).length, 0);
    
    cleanupTestDb();
  },
});

Deno.test({
  name: "parseCheckpointState - parses state JSON correctly",
  fn: () => {
    const sessionId = setupTestDb();
    
    const state: AgentState = {
      goal: "Test goal",
      currentStep: 5,
      maxSteps: 10,
      traceId: "trace_abc",
      sessionId,
      metadata: { testKey: "testValue" },
    };
    
    const checkpoint = createCheckpoint(sessionId, 5, state);
    const parsed = parseCheckpointState(checkpoint);
    
    assertEquals(parsed.goal, "Test goal");
    assertEquals(parsed.currentStep, 5);
    assertEquals(parsed.maxSteps, 10);
    assertEquals(parsed.traceId, "trace_abc");
    assertEquals(parsed.sessionId, sessionId);
    assertEquals(parsed.metadata.testKey, "testValue");
    
    cleanupTestDb();
  },
});