/**
 * Unit tests for database layer (Phase 0.1 foundation)
 * Tests table creation and basic session persistence.
 */
import { Database } from "sqlite";
import { assertEquals, assertExists } from "jsr:@std/assert@0.217.0";
import { resolve } from "jsr:@std/path@0.217.0";

Deno.test({
  name: "getDb initializes database with schema",
  fn: () => {
    // Use a temporary in-memory database for testing
    const db = new Database(":memory:");

    // Load and execute schema
    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Verify sessions table exists with correct columns
    const sessionsTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    );
    const sessions = sessionsTable.get() as { name: string } | undefined;
    assertExists(sessions, "sessions table should exist");

    // Verify checkpoints table exists
    const checkpointsTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'"
    );
    const checkpoints = checkpointsTable.get() as { name: string } | undefined;
    assertExists(checkpoints, "checkpoints table should exist");

    // Verify action_traces table exists
    const actionTracesTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='action_traces'"
    );
    const actionTraces = actionTracesTable.get() as { name: string } | undefined;
    assertExists(actionTraces, "action_traces table should exist");

    db.close();
  },
});

Deno.test({
  name: "getDb creates correct column structure for sessions",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Get column info for sessions table
    const columns = db.prepare("PRAGMA table_info(sessions)").all() as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];

    const columnNames = columns.map((c) => c.name);
    assertEquals(columnNames.includes("id"), true, "id column should exist");
    assertEquals(columnNames.includes("goal"), true, "goal column should exist");
    assertEquals(columnNames.includes("status"), true, "status column should exist");
    assertEquals(columnNames.includes("created_at"), true, "created_at column should exist");
    assertEquals(columnNames.includes("updated_at"), true, "updated_at column should exist");
    assertEquals(columnNames.includes("metadata"), true, "metadata column should exist");

    db.close();
  },
});

Deno.test({
  name: "Session persistence - insert and retrieve session",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Insert a session
    const sessionId = "test-session-001";
    const goal = "Test goal for session persistence";
    const status = "pending";
    const metadata = JSON.stringify({ key: "value" });

    db.prepare(
      "INSERT INTO sessions (id, goal, status, metadata) VALUES (?, ?, ?, ?)"
    ).run(sessionId, goal, status, metadata);

    // Retrieve the session
    const session = db.prepare(
      "SELECT id, goal, status, metadata FROM sessions WHERE id = ?"
    ).get(sessionId) as {
      id: string;
      goal: string;
      status: string;
      metadata: string | null;
    } | undefined;

    assertExists(session, "session should be retrievable");
    assertEquals(session!.id, sessionId);
    assertEquals(session!.goal, goal);
    assertEquals(session!.status, status);
    assertEquals(session!.metadata, metadata);

    db.close();
  },
});

Deno.test({
  name: "Session persistence - update session status",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Insert a session
    const sessionId = "test-session-002";
    db.prepare(
      "INSERT INTO sessions (id, goal, status) VALUES (?, ?, ?)"
    ).run(sessionId, "Test goal", "pending");

    // Update status to running
    db.prepare(
      "UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run("running", sessionId);

    // Verify status was updated
    const session = db.prepare(
      "SELECT status FROM sessions WHERE id = ?"
    ).get(sessionId) as { status: string } | undefined;

    assertExists(session, "session should exist after update");
    assertEquals(session!.status, "running");

    db.close();
  },
});

Deno.test({
  name: "Session persistence - delete session cascades to checkpoints",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Insert session and checkpoint
    const sessionId = "test-session-003";
    const checkpointId = "test-checkpoint-001";

    db.prepare(
      "INSERT INTO sessions (id, goal, status) VALUES (?, ?, ?)"
    ).run(sessionId, "Test goal", "pending");

    db.prepare(
      "INSERT INTO checkpoints (id, session_id, step_number, state_json) VALUES (?, ?, ?, ?)"
    ).run(checkpointId, sessionId, 1, '{"state": "test"}');

    // Delete session
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);

    // Verify checkpoint was cascade deleted
    const checkpoint = db.prepare(
      "SELECT id FROM checkpoints WHERE id = ?"
    ).get(checkpointId);

    assertEquals(checkpoint, undefined, "checkpoint should be cascade deleted");

    db.close();
  },
});

Deno.test({
  name: "Indexes are created for query optimization",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Get all indexes
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    ).all() as { name: string }[];

    const indexNames = indexes.map((i) => i.name);
    assertEquals(indexNames.includes("idx_sessions_status"), true, "sessions status index should exist");
    assertEquals(indexNames.includes("idx_checkpoints_session"), true, "checkpoints session index should exist");
    assertEquals(indexNames.includes("idx_action_traces_session"), true, "action_traces session index should exist");
    assertEquals(indexNames.includes("idx_action_traces_checkpoint"), true, "action_traces checkpoint index should exist");
    assertEquals(indexNames.includes("idx_action_traces_trace_id"), true, "action_traces trace_id index should exist");

    db.close();
  },
});

Deno.test({
  name: "action_traces table has trace_id column",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Get column info for action_traces table
    const columns = db.prepare("PRAGMA table_info(action_traces)").all() as {
      name: string;
    }[];

    const columnNames = columns.map((c) => c.name);
    assertEquals(columnNames.includes("trace_id"), true, "trace_id column should exist in action_traces");

    db.close();
  },
});